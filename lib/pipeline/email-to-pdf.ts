/**
 * Email-to-PDF renderer — turns a .eml or .msg buffer into a PDF transcript
 * suitable for use as a canonical PDF. Parses the email with existing helpers,
 * builds a plain structured HTML transcript (From/To/Cc/Subject/Date + body +
 * attachments listing — Decision (g) in the viewer-rework plan), and delegates
 * PDF conversion to the shared LibreOffice helper.
 *
 * The HTML template is deliberately minimal:
 *   - No <img>, <iframe>, <script>, <style> hide-tricks, <link href>, remote
 *     resources, or JavaScript. All string inputs are HTML-escaped.
 *   - Inline images (cid:) are NOT embedded as data URIs — attachment
 *     filenames are listed only.
 *   - Body is rendered as plain text inside <pre>; the original HTML body is
 *     only used as a fallback when simpleParser's .text field is empty.
 *
 * These constraints exist to prevent CSS hide-tricks and inline images from
 * obscuring PII from the text-search redaction path.
 */

import { simpleParser } from "mailparser";
import { convertToPdfWithLibreOffice } from "./redact-pdf";
import { extractMsg } from "./email-extract";

export interface EmailTranscriptData {
  from: string;
  to: string;
  cc: string | null;
  subject: string;
  date: string | null;
  body: string;
  attachments: Array<{ filename: string; sizeBytes: number }>;
}

export async function renderEmailAsPdf(
  buffer: Buffer,
  fileType: string,
): Promise<Buffer> {
  const ext = fileType.toLowerCase();
  let data: EmailTranscriptData;

  if (ext === "eml") {
    data = await parseEml(buffer);
  } else if (ext === "msg") {
    data = parseMsgForTranscript(buffer);
  } else {
    throw new Error(
      `renderEmailAsPdf: unsupported fileType ".${ext}" (expected "eml" or "msg")`,
    );
  }

  const html = renderTranscriptHtml(data);
  const htmlBuffer = Buffer.from(html, "utf-8");
  return await convertToPdfWithLibreOffice(htmlBuffer, "html");
}

async function parseEml(buffer: Buffer): Promise<EmailTranscriptData> {
  const parsed = await simpleParser(buffer);

  const from = parsed.from?.text?.trim() || "[unknown sender]";
  const to = Array.isArray(parsed.to)
    ? parsed.to.map((a) => a.text).filter(Boolean).join(", ")
    : parsed.to?.text?.trim() ?? "";
  const cc = Array.isArray(parsed.cc)
    ? parsed.cc.map((a) => a.text).filter(Boolean).join(", ") || null
    : parsed.cc?.text?.trim() || null;
  const subject = parsed.subject?.trim() || "[no subject]";
  const date = parsed.date ? parsed.date.toISOString() : null;

  let body = parsed.text?.trim() ?? "";
  if (!body && parsed.html) {
    body = htmlToPlainText(parsed.html);
  }
  if (!body) body = "[empty body]";

  const attachments = (parsed.attachments ?? [])
    .filter((a) => a.filename)
    .map((a) => ({
      filename: a.filename!,
      sizeBytes: a.size ?? a.content?.length ?? 0,
    }));

  return {
    from,
    to: to || "[no recipients]",
    cc,
    subject,
    date,
    body,
    attachments,
  };
}

function parseMsgForTranscript(buffer: Buffer): EmailTranscriptData {
  const email = extractMsg(buffer);
  let body = email.textBody?.trim() ?? "";
  if (!body && email.htmlBody) body = htmlToPlainText(email.htmlBody);
  if (!body) body = "[empty body]";

  return {
    from: email.from?.trim() || "[unknown sender]",
    to: email.to?.trim() || "[no recipients]",
    cc: email.cc?.trim() || null,
    subject: email.subject?.trim() || "[no subject]",
    date: email.date || null,
    body,
    attachments: email.attachments.map((a) => ({
      filename: a.filename,
      sizeBytes: a.size,
    })),
  };
}

export function renderTranscriptHtml(data: EmailTranscriptData): string {
  const rows: string[] = [];
  rows.push(`<div><dt>From:</dt><dd>${escapeHtml(data.from)}</dd></div>`);
  rows.push(`<div><dt>To:</dt><dd>${escapeHtml(data.to)}</dd></div>`);
  if (data.cc) {
    rows.push(`<div><dt>Cc:</dt><dd>${escapeHtml(data.cc)}</dd></div>`);
  }
  rows.push(`<div><dt>Subject:</dt><dd>${escapeHtml(data.subject)}</dd></div>`);
  if (data.date) {
    rows.push(`<div><dt>Date:</dt><dd>${escapeHtml(data.date)}</dd></div>`);
  }

  const attachmentsBlock =
    data.attachments.length > 0
      ? `<div class="attachments"><h2>Attachments</h2><ul>${data.attachments
          .map(
            (a) =>
              `<li>${escapeHtml(a.filename)} (${escapeHtml(formatBytes(a.sizeBytes))})</li>`,
          )
          .join("")}</ul></div>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Email transcript</title>
<style>
body { font-family: "Noto Sans", sans-serif; font-size: 11pt; padding: 24pt; color: #111; }
h1 { font-size: 14pt; margin: 0 0 12pt 0; }
h2 { font-size: 12pt; margin: 0 0 6pt 0; }
dl { margin: 0 0 18pt 0; }
dl > div { margin-bottom: 4pt; }
dt { font-weight: bold; display: inline-block; width: 72pt; }
dd { display: inline; margin: 0; }
pre.body { font-family: "Noto Sans", sans-serif; font-size: 11pt; white-space: pre-wrap; word-wrap: break-word; border-top: 1pt solid #999; padding-top: 12pt; margin: 0 0 18pt 0; }
.attachments { border-top: 1pt solid #999; padding-top: 12pt; }
.attachments ul { margin: 0; padding-left: 18pt; }
</style>
</head>
<body>
<h1>Email transcript</h1>
<dl>${rows.join("")}</dl>
<pre class="body">${escapeHtml(data.body)}</pre>
${attachmentsBlock}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}
