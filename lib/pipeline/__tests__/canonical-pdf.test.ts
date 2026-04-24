import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";
import { PDFDocument } from "pdf-lib";

// Module-level mocks so buildCanonicalPdf never spawns a real LibreOffice
// subprocess or invokes the (Step-5) email renderer. Real subprocess wiring
// is exercised by the Step-10 integration and Playwright tests.
vi.mock("../redact-pdf", () => ({
  LIBREOFFICE_CONVERTIBLE: new Set([
    "docx", "doc", "xlsx", "xls", "pptx", "ppt", "odt", "ods", "odp",
    "rtf", "txt", "csv", "html", "htm",
  ]),
  convertToPdfWithLibreOffice: vi.fn(),
}));

vi.mock("../email-to-pdf", () => ({
  renderEmailAsPdf: vi.fn(),
}));

import { buildCanonicalPdf, isCanonicalPdfSupported, isTextSelectable } from "../canonical-pdf";
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertToPdfWithLibreOffice } from "../redact-pdf";
import { renderEmailAsPdf } from "../email-to-pdf";

const convertMock = vi.mocked(convertToPdfWithLibreOffice);
const renderEmailMock = vi.mocked(renderEmailAsPdf);

async function makeRealPdfBuffer(pageCount = 1): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) pdf.addPage([100, 100]);
  return Buffer.from(await pdf.save());
}

describe("buildCanonicalPdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PDF input routes to 'original' branch and passes buffer through", async () => {
    const buf = await makeRealPdfBuffer(3);
    const result = await buildCanonicalPdf({ id: "doc-pdf", fileType: "pdf" }, buf);
    expect(result.source).toBe("original");
    expect(result.pdfBuffer).toBe(buf);
    expect(result.pageCount).toBe(3);
    expect(convertMock).not.toHaveBeenCalled();
    expect(renderEmailMock).not.toHaveBeenCalled();
  });

  it("PDF input: sha256 equals hash of original buffer", async () => {
    const buf = await makeRealPdfBuffer(1);
    const expectedHash = createHash("sha256").update(buf).digest("hex");
    const result = await buildCanonicalPdf({ id: "doc-hash", fileType: "pdf" }, buf);
    expect(result.sha256).toBe(expectedHash);
  });

  it("DOCX input routes to LibreOffice branch, source='libreoffice'", async () => {
    const converted = await makeRealPdfBuffer(2);
    const original = Buffer.from("fake-docx-bytes");
    convertMock.mockResolvedValueOnce(converted);

    const result = await buildCanonicalPdf({ id: "doc-docx", fileType: "docx" }, original);

    expect(convertMock).toHaveBeenCalledWith(original, "docx");
    expect(result.source).toBe("libreoffice");
    expect(result.pdfBuffer).toBe(converted);
    expect(result.pageCount).toBe(2);
    expect(renderEmailMock).not.toHaveBeenCalled();
  });

  it("XLSX input also routes to LibreOffice", async () => {
    const converted = await makeRealPdfBuffer(1);
    convertMock.mockResolvedValueOnce(converted);
    const result = await buildCanonicalPdf({ id: "doc-xlsx", fileType: "xlsx" }, Buffer.from("x"));
    expect(convertMock).toHaveBeenCalledWith(expect.any(Buffer), "xlsx");
    expect(result.source).toBe("libreoffice");
  });

  it("EML input routes to email renderer, source='email-template'", async () => {
    const rendered = await makeRealPdfBuffer(1);
    const original = Buffer.from("fake-eml-bytes");
    renderEmailMock.mockResolvedValueOnce(rendered);

    const result = await buildCanonicalPdf({ id: "doc-eml", fileType: "eml" }, original);

    expect(renderEmailMock).toHaveBeenCalledWith(original, "eml");
    expect(result.source).toBe("email-template");
    expect(result.pdfBuffer).toBe(rendered);
    expect(convertMock).not.toHaveBeenCalled();
  });

  it("MSG input also routes to email renderer", async () => {
    const rendered = await makeRealPdfBuffer(1);
    renderEmailMock.mockResolvedValueOnce(rendered);
    const result = await buildCanonicalPdf({ id: "doc-msg", fileType: "msg" }, Buffer.from("x"));
    expect(renderEmailMock).toHaveBeenCalledWith(expect.any(Buffer), "msg");
    expect(result.source).toBe("email-template");
  });

  it("throws for unsupported fileType", async () => {
    await expect(
      buildCanonicalPdf({ id: "doc-unsupported", fileType: "xyz" }, Buffer.from("x")),
    ).rejects.toThrow(/unsupported fileType "\.xyz"/);
    expect(convertMock).not.toHaveBeenCalled();
    expect(renderEmailMock).not.toHaveBeenCalled();
  });

  it("pageCount via pdf-lib matches a 5-page input", async () => {
    const buf = await makeRealPdfBuffer(5);
    const result = await buildCanonicalPdf({ id: "doc-pages", fileType: "pdf" }, buf);
    expect(result.pageCount).toBe(5);
  });

  it("durationMs is a non-negative number", async () => {
    const buf = await makeRealPdfBuffer(1);
    const result = await buildCanonicalPdf({ id: "doc-time", fileType: "pdf" }, buf);
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(result.durationMs)).toBe(true);
  });

  it("isCanonicalPdfSupported returns true for every supported type and false otherwise", () => {
    expect(isCanonicalPdfSupported("pdf")).toBe(true);
    expect(isCanonicalPdfSupported("PDF")).toBe(true);
    expect(isCanonicalPdfSupported("docx")).toBe(true);
    expect(isCanonicalPdfSupported("xlsx")).toBe(true);
    expect(isCanonicalPdfSupported("pptx")).toBe(true);
    expect(isCanonicalPdfSupported("eml")).toBe(true);
    expect(isCanonicalPdfSupported("msg")).toBe(true);
    expect(isCanonicalPdfSupported("png")).toBe(false);
    expect(isCanonicalPdfSupported("jpg")).toBe(false);
    expect(isCanonicalPdfSupported("mp3")).toBe(false);
    expect(isCanonicalPdfSupported("mp4")).toBe(false);
    expect(isCanonicalPdfSupported("xyz")).toBe(false);
  });

  it("fileType matching is case-insensitive", async () => {
    const buf = await makeRealPdfBuffer(1);
    const upper = await buildCanonicalPdf({ id: "d-u", fileType: "PDF" }, buf);
    const lower = await buildCanonicalPdf({ id: "d-l", fileType: "pdf" }, buf);
    expect(upper.source).toBe("original");
    expect(lower.source).toBe("original");

    const converted = await makeRealPdfBuffer(1);
    convertMock.mockResolvedValueOnce(converted);
    const mixed = await buildCanonicalPdf({ id: "d-m", fileType: "DOCX" }, Buffer.from("x"));
    expect(mixed.source).toBe("libreoffice");
  });

  // Phase 3 prerequisite — regression guard: PDF input always produces a
  // result whose pdfBuffer is identical to the original. process.ts uses
  // this to decide whether to reuse originalPath as canonicalPdfPath
  // (avoiding a duplicate storage blob); if pdfBuffer ever drifts from
  // originalBuffer for source="original" the storage decision breaks.
  it("PDF input: pdfBuffer is byte-identical to original (Phase 3 storage-decision invariant)", async () => {
    const buf = await makeRealPdfBuffer(2);
    const result = await buildCanonicalPdf({ id: "doc-pdf-ident", fileType: "pdf" }, buf);
    expect(result.source).toBe("original");
    expect(result.pdfBuffer).toBe(buf); // reference equality, not just byte equality
  });
});

// --- isTextSelectable probe (Phase 3 prerequisite) -----------------------

describe("isTextSelectable", () => {
  it("returns true for a text-heavy PDF (existing canonical-PDF fixture)", async () => {
    // Use one of the dev DB's DOCX-derived canonicals as a known-good
    // text-heavy fixture. If the fixture isn't present the test is
    // skipped — keeps the test suite safe in CI environments that
    // don't carry the local uploads/ tree.
    const fixturePath = "uploads/req-001/cmo5enehy00002z6cicgod7np/canonical.pdf";
    let buf: Buffer;
    try {
      buf = readFileSync(fixturePath);
    } catch {
      console.warn(`isTextSelectable: text-heavy fixture not found at ${fixturePath}; skipping`);
      return;
    }
    const selectable = await isTextSelectable(buf);
    expect(selectable).toBe(true);
  }, 30_000);

  it("returns false for an image-only PDF (rasterised at runtime via PyMuPDF)", async () => {
    // Build a synthetic image-only PDF by rasterising a real text PDF
    // and rebuilding it from images. PyMuPDF (fitz) is already in the
    // toolchain via lib/pipeline/redact_pdf_pymupdf.py.
    const sourcePath = "uploads/req-001/cmo5enehy00002z6cicgod7np/canonical.pdf";
    let _src: Buffer;
    try {
      _src = readFileSync(sourcePath);
    } catch {
      console.warn(`isTextSelectable image-only test: source fixture not found; skipping`);
      return;
    }

    const tmp = mkdtempSync(join(tmpdir(), "is-text-selectable-"));
    const outPath = join(tmp, "scanned.pdf");
    try {
      execFileSync(
        "python3",
        [
          "-c",
          `
import sys, fitz
src = fitz.open(sys.argv[1])
dst = fitz.open()
for p in src:
    pix = p.get_pixmap(dpi=100)
    new_page = dst.new_page(width=p.rect.width, height=p.rect.height)
    new_page.insert_image(p.rect, pixmap=pix)
dst.save(sys.argv[2])
`.trim(),
          sourcePath,
          outPath,
        ],
        { stdio: "pipe" },
      );
    } catch (err) {
      console.warn(`isTextSelectable image-only test: PyMuPDF rasterise failed; skipping (${err instanceof Error ? err.message : err})`);
      rmSync(tmp, { recursive: true, force: true });
      return;
    }

    const scannedBuf = readFileSync(outPath);
    rmSync(tmp, { recursive: true, force: true });

    const selectable = await isTextSelectable(scannedBuf);
    expect(selectable).toBe(false);
  }, 60_000);

  it("returns false for a tiny synthetic PDF with no text", async () => {
    // Pure pdf-lib synthesis — no text drawn at all. Pages have area but
    // no text-layer items; isTextSelectable should report false.
    const blank = await makeRealPdfBuffer(2);
    // Sanity: writeFile to make the buffer real (not strictly necessary
    // since we pass it directly).
    void writeFileSync;
    const selectable = await isTextSelectable(blank);
    expect(selectable).toBe(false);
  }, 30_000);
});
