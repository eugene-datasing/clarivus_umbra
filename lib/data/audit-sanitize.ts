/**
 * PII sanitization utilities for audit log entries.
 *
 * Ensures that sensitive entity text (emails, phone numbers, names, etc.)
 * detected by the pipeline is never written verbatim into audit entries —
 * which are rendered in PDFs sent to requesters and the Ombudsman.
 */

import { createHash } from "crypto";

/**
 * Replace entity text with a deterministic, non-reversible token.
 *
 * The same input always produces the same mask, allowing cross-referencing
 * across audit entries without exposing the actual PII.
 *
 * @example
 *   maskEntityText("john@example.com", "email")
 *   // → "[email:sha:a1b2c3d4]"
 *
 *   maskEntityText("John Smith", "personal-name")
 *   // → "[personal-name:sha:e5f6a7b8]"
 */
export function maskEntityText(text: string, type?: string): string {
  const hash = createHash("sha256")
    .update(text.toLowerCase().trim())
    .digest("hex")
    .slice(0, 8);

  const label = type || "entity";
  return `[${label}:sha:${hash}]`;
}

// ---------------------------------------------------------------------------
// PII pattern regexes for NZ context
// ---------------------------------------------------------------------------

const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Email addresses
  {
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: "[redacted-email]",
  },
  // NZ phone numbers: +64 / 0x xxx xxxx or similar
  {
    pattern: /(?:\+?64|0)[\s-]?\d{1,4}[\s-]?\d{3,4}[\s-]?\d{3,4}/g,
    replacement: "[redacted-phone]",
  },
  // IRD numbers: XX-XXX-XXX or XXX-XXX-XXX
  {
    pattern: /\d{2,3}[-\s]\d{3}[-\s]\d{3}/g,
    replacement: "[redacted-id]",
  },
  // NHI numbers: 3 letters followed by 4 digits
  {
    pattern: /\b[A-Z]{3}\d{4}\b/g,
    replacement: "[redacted-nhi]",
  },
];

/**
 * Strip common PII patterns from free-text fields (e.g. reviewer reasons).
 *
 * Reviewers may quote detected PII when explaining rejection reasons.
 * This ensures those quotes don't leak into the immutable audit trail.
 */
export function stripPiiPatterns(text: string): string {
  let result = text;
  for (const { pattern, replacement } of PII_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacement);
  }
  return result;
}
