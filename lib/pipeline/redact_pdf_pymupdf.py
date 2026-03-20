"""
True PDF redaction using PyMuPDF (fitz).

Applies redaction annotations and then burns them in, which genuinely
removes the underlying text from the PDF content stream.

Usage:
    python3 redact_pdf_pymupdf.py <input_pdf> <output_pdf> <redactions_json>

    redactions_json is a path to a JSON file containing an array of:
    {
        "page": 1,            // 1-based page number
        "posX": 10.5,         // percentage of page width (0-100)
        "posY": 20.3,         // percentage of page height from top (0-100)
        "posW": 15.0,         // percentage of page width
        "posH": 2.5,          // percentage of page height
        "label": "s7(2)(a)"   // ground reference to overlay
    }
"""

import sys
import json
import fitz  # PyMuPDF


def main():
    if len(sys.argv) != 4:
        print("Usage: redact_pdf_pymupdf.py <input> <output> <redactions_json>", file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    redactions_path = sys.argv[3]

    with open(redactions_path, "r") as f:
        redactions = json.load(f)

    doc = fitz.open(input_path)
    page_count = len(doc)

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

        # Add redaction annotation with ground label as overlay text
        label = r.get("label", "")
        page.add_redact_annot(
            rect,
            text=label,
            fontname="helv",
            fontsize=0,  # 0 = auto-fit
            fill=(0, 0, 0),        # Black fill
            text_color=(1, 1, 1),  # White text
        )

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

    print(json.dumps({"success": True, "pages": page_count, "redactions": len(redactions)}))


if __name__ == "__main__":
    main()
