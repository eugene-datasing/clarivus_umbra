"""
Post-redaction verification using PyMuPDF.

Extracts text from the redacted PDF and checks whether any of the
detection texts that should have been redacted are still present.

Usage:
    python3 verify_redaction_pymupdf.py <pdf_path> <detections_json>

    detections_json is a path to a JSON file containing an array of:
    { "text": "sensitive text", "page": 1 }

Outputs JSON to stdout:
    { "passed": true/false, "leaksFound": 0, "details": [...] }
"""

import sys
import json
import fitz  # PyMuPDF


def main():
    if len(sys.argv) != 3:
        print("Usage: verify_redaction_pymupdf.py <pdf> <detections_json>", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]
    detections_path = sys.argv[2]

    with open(detections_path, "r") as f:
        detections = json.load(f)

    doc = fitz.open(pdf_path)
    page_count = len(doc)

    # Extract text from each page
    page_texts = {}
    for i in range(page_count):
        page_texts[i + 1] = doc[i].get_text("text").lower()

    details = []
    leaks_found = 0

    for det in detections:
        text = det["text"]
        page_num = det["page"]

        if not text or len(text.strip()) < 3:
            details.append({
                "detectionText": text,
                "page": page_num,
                "leaked": False,
                "note": "Text too short to verify reliably",
            })
            continue

        if page_num > page_count:
            details.append({
                "detectionText": text,
                "page": page_num,
                "leaked": False,
                "note": f"Page {page_num} does not exist ({page_count} pages)",
            })
            continue

        page_text = page_texts.get(page_num, "")
        if text.lower() in page_text:
            details.append({
                "detectionText": text[:50] + ("..." if len(text) > 50 else ""),
                "page": page_num,
                "leaked": True,
                "note": "LEAK: Redacted text still present in PDF text layer",
            })
            leaks_found += 1
        else:
            details.append({
                "detectionText": text[:50] + ("..." if len(text) > 50 else ""),
                "page": page_num,
                "leaked": False,
                "note": "Verified: text removed from content stream",
            })

    doc.close()

    result = {
        "passed": leaks_found == 0,
        "totalChecked": len(detections),
        "leaksFound": leaks_found,
        "details": details,
    }

    print(json.dumps(result))


if __name__ == "__main__":
    main()
