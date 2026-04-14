"""
Test that text-search redaction covers all pages of a multi-page PDF.

Creates a 3-page PDF where "Rohan Patel" and "mere.ngata@example.nz" appear
on pages 1 and 3.  Runs the text-search redaction with all detections
declaring page=1 (simulating DOCX→PDF conversion where Mammoth sets page=1
for everything).  Asserts that occurrences on BOTH pages are redacted.
"""

import json
import os
import subprocess
import sys
import tempfile

import fitz  # PyMuPDF


def create_test_pdf(path):
    """Create a 3-page PDF with known text on pages 1 and 3."""
    doc = fitz.open()

    # Page 1: contains PII
    page1 = doc.new_page(width=595, height=842)
    page1.insert_text(
        (72, 100),
        "Subject: Rohan Patel\nEmail: mere.ngata@example.nz\nPhone: 022 410 6671",
        fontsize=12,
    )
    page1.insert_text((72, 200), "This is page 1 with some filler content.", fontsize=12)

    # Page 2: no PII
    page2 = doc.new_page(width=595, height=842)
    page2.insert_text((72, 100), "This is page 2. No sensitive information here.", fontsize=12)

    # Page 3: same PII repeated
    page3 = doc.new_page(width=595, height=842)
    page3.insert_text(
        (72, 100),
        "Appendix: Rohan Patel\nContact: mere.ngata@example.nz\nMobile: 022 410 6671",
        fontsize=12,
    )
    page3.insert_text((72, 200), "This is page 3 — the appendix.", fontsize=12)

    doc.save(path)
    doc.close()


def count_text_occurrences(pdf_path, search_text):
    """Count how many times search_text appears across all pages."""
    doc = fitz.open(pdf_path)
    total = 0
    per_page = []
    for page in doc:
        rects = page.search_for(search_text)
        total += len(rects)
        per_page.append(len(rects))
    doc.close()
    return total, per_page


def test_multipage_text_search():
    """Text-search mode should redact ALL pages, not just the declared page."""
    script_path = os.path.join(
        os.path.dirname(__file__), "..", "redact_pdf_pymupdf.py"
    )

    with tempfile.TemporaryDirectory() as tmpdir:
        input_pdf = os.path.join(tmpdir, "input.pdf")
        output_pdf = os.path.join(tmpdir, "output.pdf")
        json_path = os.path.join(tmpdir, "redactions.json")

        create_test_pdf(input_pdf)

        # Verify: before redaction, text exists on both pages
        before_rohan, before_rohan_pages = count_text_occurrences(input_pdf, "Rohan Patel")
        before_email, before_email_pages = count_text_occurrences(input_pdf, "mere.ngata@example.nz")
        before_phone, before_phone_pages = count_text_occurrences(input_pdf, "022 410 6671")

        print(f"BEFORE: 'Rohan Patel' found {before_rohan} times: {before_rohan_pages}")
        print(f"BEFORE: 'mere.ngata@example.nz' found {before_email} times: {before_email_pages}")
        print(f"BEFORE: '022 410 6671' found {before_phone} times: {before_phone_pages}")

        assert before_rohan >= 2, f"Expected Rohan Patel on 2+ pages, got {before_rohan}"
        assert before_email >= 2, f"Expected email on 2+ pages, got {before_email}"

        # All detections declare page=1 (simulating DOCX behaviour)
        redactions = [
            {"page": 1, "text": "Rohan Patel", "label": "s7(2)(a)"},
            {"page": 1, "text": "mere.ngata@example.nz", "label": "s7(2)(a)"},
            {"page": 1, "text": "022 410 6671", "label": "s7(2)(a)"},
        ]

        with open(json_path, "w") as f:
            json.dump(redactions, f)

        # Run the redaction script in text-search mode
        result = subprocess.run(
            [sys.executable, script_path, input_pdf, output_pdf, json_path, "--mode=text-search"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        print(f"STDOUT: {result.stdout.strip()}")
        if result.stderr:
            print(f"STDERR: {result.stderr.strip()}")

        assert result.returncode == 0, f"Script failed: {result.stderr}"

        output = json.loads(result.stdout.strip())
        print(f"Redactions applied: {output['redactions_applied']}")

        # After redaction, the text should be gone from ALL pages
        after_rohan, after_rohan_pages = count_text_occurrences(output_pdf, "Rohan Patel")
        after_email, after_email_pages = count_text_occurrences(output_pdf, "mere.ngata@example.nz")
        after_phone, after_phone_pages = count_text_occurrences(output_pdf, "022 410 6671")

        print(f"AFTER: 'Rohan Patel' found {after_rohan} times: {after_rohan_pages}")
        print(f"AFTER: 'mere.ngata@example.nz' found {after_email} times: {after_email_pages}")
        print(f"AFTER: '022 410 6671' found {after_phone} times: {after_phone_pages}")

        # Key assertions: text must be removed from ALL pages
        assert after_rohan == 0, f"Rohan Patel still found {after_rohan} times after redaction: {after_rohan_pages}"
        assert after_email == 0, f"Email still found {after_email} times after redaction: {after_email_pages}"
        assert after_phone == 0, f"Phone still found {after_phone} times after redaction: {after_phone_pages}"

        # Verify the script reported the correct count (at least 6: 3 texts × 2 pages)
        assert output["redactions_applied"] >= 6, (
            f"Expected ≥6 redactions (3 texts × 2 pages), got {output['redactions_applied']}"
        )

        print(f"\nPASS: All {output['redactions_applied']} redactions applied across all pages")


if __name__ == "__main__":
    test_multipage_text_search()
