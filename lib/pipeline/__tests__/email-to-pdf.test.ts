import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock LibreOffice subprocess — exactly the pattern from canonical-pdf.test.ts.
vi.mock("../redact-pdf", () => ({
  LIBREOFFICE_CONVERTIBLE: new Set([
    "docx", "doc", "xlsx", "xls", "pptx", "ppt", "odt", "ods", "odp",
    "rtf", "txt", "csv", "html", "htm",
  ]),
  convertToPdfWithLibreOffice: vi.fn(),
}));

import {
  renderEmailAsPdf,
  renderTranscriptHtml,
  type EmailTranscriptData,
} from "../email-to-pdf";
import { convertToPdfWithLibreOffice } from "../redact-pdf";

const convertMock = vi.mocked(convertToPdfWithLibreOffice);

const baseData: EmailTranscriptData = {
  from: "Sarah Mitchell <s.mitchell@pncc.govt.nz>",
  to: "David Kowalski <d.kowalski@pncc.govt.nz>",
  cc: "Legal Team <legal@pncc.govt.nz>",
  subject: "LGOIMA request — Featherston Street",
  date: "2026-04-14T09:00:00.000Z",
  body: "Hi David,\n\nPlease process LGOIMA-2026-014.\nIRD 123-456-789, mobile 021 555 1234.\n\nRegards,\nSarah",
  attachments: [{ filename: "request.pdf", sizeBytes: 12_345 }],
};

describe("renderTranscriptHtml", () => {
  it("renders all five header fields when present", () => {
    const html = renderTranscriptHtml(baseData);
    expect(html).toContain("From:");
    expect(html).toContain("s.mitchell@pncc.govt.nz");
    expect(html).toContain("To:");
    expect(html).toContain("d.kowalski@pncc.govt.nz");
    expect(html).toContain("Cc:");
    expect(html).toContain("legal@pncc.govt.nz");
    expect(html).toContain("Subject:");
    expect(html).toContain("LGOIMA request");
    expect(html).toContain("Date:");
    expect(html).toContain("2026-04-14");
  });

  it("round-trips the body text verbatim into the HTML", () => {
    const html = renderTranscriptHtml(baseData);
    expect(html).toContain("Hi David,");
    expect(html).toContain("Please process LGOIMA-2026-014.");
    expect(html).toContain("IRD 123-456-789, mobile 021 555 1234.");
    expect(html).toContain("Regards,");
    expect(html).toContain("Sarah");
  });

  it("renders attachment filenames with size", () => {
    const html = renderTranscriptHtml({
      ...baseData,
      attachments: [
        { filename: "request.pdf", sizeBytes: 12_345 },
        { filename: "spreadsheet.xlsx", sizeBytes: 2_000_000 },
      ],
    });
    expect(html).toContain("request.pdf");
    expect(html).toContain("12.1 KB");
    expect(html).toContain("spreadsheet.xlsx");
    expect(html).toContain("1.9 MB");
  });

  it("omits Cc row when cc is null", () => {
    const html = renderTranscriptHtml({ ...baseData, cc: null });
    expect(html).not.toMatch(/<dt>Cc:<\/dt>/);
  });

  it("omits Date row when date is null", () => {
    const html = renderTranscriptHtml({ ...baseData, date: null });
    expect(html).not.toMatch(/<dt>Date:<\/dt>/);
  });

  it("omits attachments section entirely when there are no attachments", () => {
    const html = renderTranscriptHtml({ ...baseData, attachments: [] });
    expect(html).not.toContain("Attachments");
    expect(html).not.toContain("<ul>");
  });

  it("uses '[no subject]' when subject is the placeholder", () => {
    const html = renderTranscriptHtml({ ...baseData, subject: "[no subject]" });
    expect(html).toContain("[no subject]");
  });

  it("uses '[empty body]' for an empty body", () => {
    const html = renderTranscriptHtml({ ...baseData, body: "[empty body]" });
    expect(html).toContain("[empty body]");
  });

  it("HTML-escapes hostile content in every field", () => {
    const html = renderTranscriptHtml({
      from: "<script>alert(1)</script>",
      to: "a<img src=x>b",
      cc: "cc<iframe>",
      subject: "<style>body{display:none}</style>",
      date: "2026",
      body: "<script>steal()</script>",
      attachments: [{ filename: "evil<img>.pdf", sizeBytes: 10 }],
    });
    expect(html).not.toMatch(/<script>alert/);
    expect(html).not.toMatch(/<img\s+src=x>/);
    expect(html).not.toMatch(/<iframe>cc/);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img src=x&gt;");
    expect(html).toContain("&lt;iframe&gt;");
  });

  it("contains no <img>, <script>, <iframe>, <object>, <embed>, or <link href> tags (regex sweep)", () => {
    const html = renderTranscriptHtml({
      ...baseData,
      body: "Harmless body with <b>markup</b> that should be escaped",
      attachments: [{ filename: "image.png", sizeBytes: 100 }],
    });
    expect(html).not.toMatch(/<img\b/i);
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/<iframe\b/i);
    expect(html).not.toMatch(/<object\b/i);
    expect(html).not.toMatch(/<embed\b/i);
    expect(html).not.toMatch(/<link\s+[^>]*href/i);
    // The only <style> block is the transcript's typography — assert no hide-tricks.
    expect(html).not.toMatch(/display\s*:\s*none/i);
    expect(html).not.toMatch(/visibility\s*:\s*hidden/i);
    expect(html).not.toMatch(/font-size\s*:\s*0/i);
  });

  it("does not include cid: inline image references", () => {
    const html = renderTranscriptHtml({
      ...baseData,
      body: "See inline image [cid:signature@pncc]",
    });
    // cid: can appear literally as escaped text, but must not be in an img src
    expect(html).not.toMatch(/src=["']cid:/i);
  });
});

describe("renderEmailAsPdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    convertMock.mockResolvedValue(Buffer.from("%PDF-1.4 fake"));
  });

  it("throws for an unsupported fileType", async () => {
    await expect(
      renderEmailAsPdf(Buffer.from("x"), "pdf"),
    ).rejects.toThrow(/unsupported fileType/);
  });

  it("parses a minimal EML and invokes LibreOffice with the HTML buffer exactly once", async () => {
    const eml = Buffer.from(
      [
        "From: Sarah Mitchell <s.mitchell@pncc.govt.nz>",
        "To: David Kowalski <d.kowalski@pncc.govt.nz>",
        "Cc: Legal Team <legal@pncc.govt.nz>",
        "Subject: LGOIMA-2026-014",
        "Date: Mon, 14 Apr 2026 09:00:00 +1200",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "Hi David, IRD 123-456-789, mobile 021 555 1234.",
        "",
      ].join("\r\n"),
    );

    const pdf = await renderEmailAsPdf(eml, "eml");

    expect(convertMock).toHaveBeenCalledTimes(1);
    const [htmlBuffer, fileType] = convertMock.mock.calls[0];
    expect(fileType).toBe("html");
    expect(Buffer.isBuffer(htmlBuffer)).toBe(true);

    const html = (htmlBuffer as Buffer).toString("utf-8");
    expect(html).toContain("Sarah Mitchell");
    expect(html).toContain("d.kowalski@pncc.govt.nz");
    expect(html).toContain("legal@pncc.govt.nz");
    expect(html).toContain("LGOIMA-2026-014");
    expect(html).toContain("IRD 123-456-789");
    expect(html).toContain("021 555 1234");
    // No hostile tags leaked from the parser:
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/<img\b/i);

    expect(pdf).toEqual(Buffer.from("%PDF-1.4 fake"));
  });

  it("handles an EML with no Cc and no attachments gracefully", async () => {
    const eml = Buffer.from(
      [
        "From: a@x.test",
        "To: b@x.test",
        "Subject: plain note",
        "Date: Mon, 14 Apr 2026 09:00:00 +1200",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "body",
        "",
      ].join("\r\n"),
    );
    await renderEmailAsPdf(eml, "eml");

    const html = (convertMock.mock.calls[0][0] as Buffer).toString("utf-8");
    expect(html).not.toMatch(/<dt>Cc:<\/dt>/);
    expect(html).not.toContain("Attachments");
  });

  it("substitutes '[no subject]' when the Subject header is absent", async () => {
    const eml = Buffer.from(
      [
        "From: a@x.test",
        "To: b@x.test",
        "Date: Mon, 14 Apr 2026 09:00:00 +1200",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "body",
        "",
      ].join("\r\n"),
    );
    await renderEmailAsPdf(eml, "eml");

    const html = (convertMock.mock.calls[0][0] as Buffer).toString("utf-8");
    expect(html).toContain("[no subject]");
  });

  it("substitutes '[empty body]' when the body is blank", async () => {
    const eml = Buffer.from(
      [
        "From: a@x.test",
        "To: b@x.test",
        "Subject: blank",
        "Date: Mon, 14 Apr 2026 09:00:00 +1200",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "",
      ].join("\r\n"),
    );
    await renderEmailAsPdf(eml, "eml");

    const html = (convertMock.mock.calls[0][0] as Buffer).toString("utf-8");
    expect(html).toContain("[empty body]");
  });
});
