"""
True PDF redaction using PyMuPDF (fitz).

Applies redaction annotations and then burns them in, which genuinely
removes the underlying text from the PDF content stream.

Two modes:

  coordinate (default):
    Redaction rectangles are specified as percentage-based bounding boxes.
    Used for PDF originals where Azure Document Intelligence provides
    word-level polygon coordinates.

  text-search:
    Redaction targets are specified as text strings. PyMuPDF searches for
    each string in the page and redacts every occurrence found. Used for
    non-PDF documents converted to PDF via LibreOffice, where no bounding
    box data is available.

Usage:
    python3 redact_pdf_pymupdf.py <input_pdf> <output_pdf> <redactions_json> [--mode=coordinate|text-search]

    coordinate mode redactions_json:
    [{ "page": 1, "posX": 10.5, "posY": 20.3, "posW": 15.0, "posH": 2.5, "label": "s7(2)(a)" }]

    text-search mode redactions_json:
    [{ "page": 1, "text": "John Smith", "label": "s7(2)(a)" }]
"""

import sys
import json
import fitz  # PyMuPDF


def redact_by_coordinates(doc, redactions):
    """Apply redactions using percentage-based bounding box coordinates."""
    page_count = len(doc)
    applied = 0

    for r in redactions:
        page_num = r["page"] - 1  # Convert to 0-based
        if page_num < 0 or page_num >= page_count:
            continue

        page = doc[page_num]
        pw = page.rect.width
        ph = page.rect.height

        # Convert percentage coordinates to points
        x0 = (r["posX"] / 100.0) * pw
        y0 = (r["posY"] / 100.0) * ph
        w = (r["posW"] / 100.0) * pw
        h = (r["posH"] / 100.0) * ph
        x1 = x0 + w
        y1 = y0 + h

        rect = fitz.Rect(x0, y0, x1, y1)
        label = r.get("label", "")
        page.add_redact_annot(
            rect,
            text=label,
            fontname="helv",
            fontsize=0,  # 0 = auto-fit
            fill=(0, 0, 0),        # Black fill
            text_color=(1, 1, 1),  # White text
        )
        applied += 1

    return applied


def redact_by_text_search(doc, redactions):
    """Apply redactions by searching for text strings in each page."""
    page_count = len(doc)
    applied = 0
    missed = 0
    padding = 2  # Extra pixels around found text for clean redaction

    for r in redactions:
        page_num = r["page"] - 1  # Convert to 0-based
        search_text = r.get("text", "")
        label = r.get("label", "")

        if not search_text:
            continue

        if page_num < 0 or page_num >= page_count:
            # Text might appear on a different page after conversion —
            # search all pages as fallback
            pages_to_search = range(page_count)
        else:
            # Search the target page first, then all others if not found
            pages_to_search = [page_num]

        found = False
        for pn in pages_to_search:
            page = doc[pn]
            rects = page.search_for(search_text)

            if rects:
                for rect in rects:
                    # Add slight padding for clean appearance
                    padded = rect + fitz.Rect(-padding, -padding, padding, padding)
                    page.add_redact_annot(
                        padded,
                        text=label,
                        fontname="helv",
                        fontsize=0,
                        fill=(0, 0, 0),
                        text_color=(1, 1, 1),
                    )
                    applied += 1
                found = True
                break  # Found on this page, stop searching others

        if not found and page_num >= 0 and page_num < page_count:
            # Try searching all pages if we only searched the target page
            for pn in range(page_count):
                if pn == page_num:
                    continue
                page = doc[pn]
                rects = page.search_for(search_text)
                if rects:
                    for rect in rects:
                        padded = rect + fitz.Rect(-padding, -padding, padding, padding)
                        page.add_redact_annot(
                            padded,
                            text=label,
                            fontname="helv",
                            fontsize=0,
                            fill=(0, 0, 0),
                            text_color=(1, 1, 1),
                        )
                        applied += 1
                    found = True
                    break

        if not found:
            missed += 1
            print(f"WARNING: text not found in PDF: {search_text[:80]!r}", file=sys.stderr)

    return applied, missed


def main():
    if len(sys.argv) < 4:
        print("Usage: redact_pdf_pymupdf.py <input> <output> <redactions_json> [--mode=coordinate|text-search]", file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    redactions_path = sys.argv[3]

    # Parse mode from optional 4th argument
    mode = "coordinate"
    for arg in sys.argv[4:]:
        if arg.startswith("--mode="):
            mode = arg.split("=", 1)[1]

    with open(redactions_path, "r") as f:
        redactions = json.load(f)

    doc = fitz.open(input_path)
    page_count = len(doc)

    if mode == "text-search":
        applied, missed = redact_by_text_search(doc, redactions)
    else:
        applied = redact_by_coordinates(doc, redactions)
        missed = 0

    # Apply all redaction annotations — this REMOVES the underlying content
    for page in doc:
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_REMOVE)

    # Strip metadata
    doc.set_metadata({
        "title": "",
        "author": "",
        "subject": "",
        "keywords": "",
        "creator": "Veil LGOIMA Disclosure Platform",
        "producer": "Veil by DataSing",
    })

    doc.save(output_path, garbage=4, deflate=True)
    doc.close()

    result = {"success": True, "pages": page_count, "redactions_applied": applied, "mode": mode}
    if missed > 0:
        result["missed"] = missed
    print(json.dumps(result))


if __name__ == "__main__":
    main()
