/**
 * Email extraction module for the Veil document processing pipeline.
 *
 * Provides MSG (Outlook binary format) extraction using @kenjiuno/msgreader.
 *
 * EML extraction is handled directly in extract.ts using mailparser.
 * PST archives are rejected at upload time with guidance to export as
 * individual EML/MSG files.
 */

import MsgReader from "@kenjiuno/msgreader";
import type { FieldsData, AttachmentData } from "@kenjiuno/msgreader";
import type { ExtractedPage, ExtractionAttachment, ExtractionResult } from "./extract";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Structured representation of an extracted email. */
export interface EmailContent {
  subject: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  messageId: string;
  textBody: string;
  htmlBody: string;
  attachments: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
    size: number;
  }>;
}

// ---------------------------------------------------------------------------
// MSG extraction
// ---------------------------------------------------------------------------

/**
 * Derive a best-effort SMTP address from the MSG sender fields.
 *
 * MSG files store the sender in several properties depending on whether
 * the message was sent through Exchange (EX address type) or direct SMTP.
 * We try multiple fields in order of reliability.
 */
function resolveSenderAddress(data: FieldsData): string {
  // Prefer explicit SMTP addresses
  if (data.senderSmtpAddress) return data.senderSmtpAddress;
  if (data.creatorSMTPAddress) return data.creatorSMTPAddress;
  if (data.sentRepresentingSmtpAddress) return data.sentRepresentingSmtpAddress;

  // If the address type is SMTP, the senderEmail is already an email address
  if (data.senderAddressType === "SMTP" && data.senderEmail) {
    return data.senderEmail;
  }

  // Fall back to inetAcctName or email1EmailAddress (contact-style)
  if (data.inetAcctName) return data.inetAcctName;
  if (data.email1EmailAddress) return data.email1EmailAddress;

  // Last resort: senderEmail (may be an X500 path for Exchange)
  return data.senderEmail ?? "";
}

/**
 * Build a formatted sender string ("Display Name <email@example.com>").
 */
function formatSender(data: FieldsData): string {
  const email = resolveSenderAddress(data);
  const name = data.senderName ?? "";

  if (name && email) return `${name} <${email}>`;
  if (email) return email;
  if (name) return name;
  return "(unknown sender)";
}

/**
 * Build a formatted recipient list from MSG FieldsData.recipients[].
 */
function formatRecipients(
  recipients: FieldsData[] | undefined,
  type: "to" | "cc" | "bcc",
): string {
  if (!recipients) return "";

  return recipients
    .filter((r) => r.recipType === type)
    .map((r) => {
      const email = r.smtpAddress ?? r.email ?? "";
      const name = r.name ?? "";
      if (name && email && name !== email) return `${name} <${email}>`;
      return email || name || "(unknown)";
    })
    .join(", ");
}

/**
 * Guess MIME type from a file extension.
 */
function mimeFromExtension(ext: string): string {
  const map: Record<string, string> = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".doc": "application/msword",
    ".xls": "application/vnd.ms-excel",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".html": "text/html",
    ".htm": "text/html",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
    ".eml": "message/rfc822",
    ".msg": "application/vnd.ms-outlook",
    ".zip": "application/zip",
    ".rtf": "application/rtf",
  };
  return map[ext.toLowerCase()] ?? "application/octet-stream";
}

/**
 * Extract an Outlook MSG file into structured email content.
 *
 * Uses @kenjiuno/msgreader to parse the Compound File Binary Format (CFBF)
 * that Outlook uses for MSG files, extracting headers, body, and attachments.
 */
export function extractMsg(buffer: Buffer): EmailContent {
  // MsgReader accepts ArrayBuffer -- copy the buffer to ensure we have a
  // clean ArrayBuffer (Buffer.buffer may be a SharedArrayBuffer or offset)
  const arrayBuffer = new Uint8Array(buffer).buffer;
  const reader = new MsgReader(arrayBuffer);

  const data = reader.getFileData();

  if (data.error) {
    throw new Error(`MSG parse error: ${data.error}`);
  }

  // -- Headers --
  const subject = data.subject ?? "(No subject)";
  const from = formatSender(data);
  const to = formatRecipients(data.recipients, "to");
  const cc = formatRecipients(data.recipients, "cc");

  // Date: prefer clientSubmitTime, then messageDeliveryTime, then creationTime
  const dateStr = data.clientSubmitTime ?? data.messageDeliveryTime ?? data.creationTime ?? "";
  const messageId = data.messageId ?? "";

  // -- Body --
  const textBody = data.body ?? "";

  // HTML body: try bodyHtml string first, then raw html bytes
  let htmlBody = data.bodyHtml ?? "";
  if (!htmlBody && data.html) {
    try {
      htmlBody = Buffer.from(data.html).toString("utf-8");
    } catch {
      // Ignore decode errors
    }
  }

  // -- Attachments --
  const attachments: EmailContent["attachments"] = [];

  if (data.attachments) {
    for (const att of data.attachments) {
      // Skip hidden attachments (inline images referenced in HTML, etc.)
      if (att.attachmentHidden) continue;
      // Skip embedded MSG sub-messages (innerMsgContent) for now
      if (att.innerMsgContent) continue;

      // Skip attachments without a data reference
      if (att.dataId === undefined && att.contentLength === undefined) continue;

      try {
        const attData: AttachmentData = reader.getAttachment(att);
        const filename = att.fileName ?? att.fileNameShort ?? att.name ?? "attachment";
        const ext = att.extension ?? (filename.includes(".") ? "" : ".bin");
        const contentType = att.attachMimeTag ?? mimeFromExtension(ext || extractExtFromFilename(filename));
        const content = Buffer.from(attData.content);

        attachments.push({
          filename: attData.fileName || filename,
          content,
          contentType,
          size: content.length,
        });
      } catch (attErr) {
        console.warn(
          `[email-extract] Failed to extract MSG attachment "${att.fileName ?? att.name}":`,
          attErr,
        );
      }
    }
  }

  return {
    subject,
    from,
    to,
    cc,
    date: dateStr,
    messageId,
    textBody,
    htmlBody,
    attachments,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract file extension from a filename string.
 */
function extractExtFromFilename(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex === -1 || dotIndex === filename.length - 1) return "";
  return filename.slice(dotIndex);
}

/**
 * Strip HTML tags and decode common entities to produce plain text.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Conversion to pipeline page format
// ---------------------------------------------------------------------------

/**
 * Convert structured EmailContent into the ExtractedPage[] / ExtractionResult
 * format consumed by the rest of the Veil pipeline.
 *
 * Page layout:
 *   Page 1: Email headers (From, To, CC, Date, Subject, Message-ID)
 *   Page 2: Plain-text body (or HTML-stripped body if no plain text)
 *
 * Attachments are returned in ExtractionResult.attachments for process.ts
 * to create child documents.
 */
export function emailContentToExtractionResult(email: EmailContent): ExtractionResult {
  const pages: ExtractedPage[] = [];
  const textParts: string[] = [];

  // -- Page 1: Headers --
  const headers: string[] = [];
  if (email.from) headers.push(`From: ${email.from}`);
  if (email.to) headers.push(`To: ${email.to}`);
  if (email.cc) headers.push(`CC: ${email.cc}`);
  if (email.date) headers.push(`Date: ${email.date}`);
  if (email.subject) headers.push(`Subject: ${email.subject}`);
  if (email.messageId) headers.push(`Message-ID: ${email.messageId}`);

  const headerText = headers.join("\n");
  pages.push({ pageNumber: 1, text: `[Email Headers]\n${headerText}` });
  textParts.push(headerText);

  // -- Page 2: Body --
  if (email.textBody) {
    pages.push({ pageNumber: 2, text: email.textBody });
    textParts.push(email.textBody);
  } else if (email.htmlBody) {
    const stripped = stripHtml(email.htmlBody);
    if (stripped.length > 0) {
      pages.push({ pageNumber: 2, text: stripped });
      textParts.push(stripped);
    }
  }

  // If no body at all, add a stub
  if (pages.length === 1) {
    pages.push({ pageNumber: 2, text: "(No message body)" });
  }

  // -- Attachments --
  const attachments: ExtractionAttachment[] = email.attachments.map((att) => ({
    filename: att.filename,
    contentType: att.contentType,
    content: att.content,
    size: att.size,
  }));

  const totalText = textParts.join("\n\n");

  return {
    pages,
    totalText,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}
