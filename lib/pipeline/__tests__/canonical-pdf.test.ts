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

import { buildCanonicalPdf } from "../canonical-pdf";
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
});
