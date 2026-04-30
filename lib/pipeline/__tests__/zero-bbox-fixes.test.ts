/**
 * Source-parse regression guards for the zero-bbox-AI-long-narrative
 * fix bundle (2026-04-30).
 *
 * Diagnosis (B2_Witness_Statement_Torres.pdf, prod doc
 * cmohtlmnx000l01od32fpmgcr): AI emissions > 80 chars were stored with
 * (0,0,0,0) bbox via the LONG_NARRATIVE_THRESHOLD short-circuit in
 * process.ts. That bbox state then leaked into:
 *   - canvas overlay components (filtered out by `posW===0 && posH===0`),
 *   - click-to-scroll (refs only populated for rendered overlays),
 *   - Tier 1 redaction (filtered by `posW > 0 && posH > 0`), with no
 *     Tier 2 fallback because Tier 2 only ran when EVERY accepted
 *     detection was zero-bbox.
 *
 * Three coordinated fixes:
 *   A — process.ts: treat AI as a literal-capture source for bbox
 *       resolution (use skipLongTextGuard:true), with a fallback to
 *       (0,0,0,0) only when no match is found, preserving the prior
 *       sidebar-visibility contract for paraphrases that don't match.
 *   B — redact-pdf.ts: chain Tier 2 text-search after a successful
 *       Tier 1 specifically for the zero-bbox subset, on top of the
 *       Tier-1-output PDF (no extra storage download).
 *   C — review-client.tsx: a "No anchor" sidebar badge for zero-bbox
 *       rows so the reviewer understands why the canvas highlight is
 *       missing. Tested in app/requests/.../__tests__/sidebar-zero-bbox-badge.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROCESS_PATH = join(process.cwd(), "lib/pipeline/process.ts");
const REDACT_PATH = join(process.cwd(), "lib/pipeline/redact-pdf.ts");

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("Fix A — process.ts wires AI source as literal-capture for bbox", () => {
  const src = stripComments(readFileSync(PROCESS_PATH, "utf-8"));

  it("isLiteralCapture includes BOTH section-marker AND ai", () => {
    // Pre-fix this was just `det.source === "section-marker"`, leaving
    // every AI long-narrative emission to fall through the
    // LONG_NARRATIVE_THRESHOLD branch and land at (0,0,0,0).
    expect(src).toMatch(
      /const\s+isLiteralCapture\s*=\s*[\s\S]*?det\.source\s*===\s*"section-marker"[\s\S]*?det\.source\s*===\s*"ai"/,
    );
  });

  it("calculateBBoxAll receives skipLongTextGuard:true for literal-capture sources", () => {
    expect(src).toMatch(
      /isLiteralCapture\s*\?\s*\{\s*skipLongTextGuard:\s*true\s*\}\s*:\s*undefined/,
    );
  });

  it("falls back to placeholder bbox only when AI long-text bbox match returns empty", () => {
    // The fallback is scoped: source must be "ai" AND text length must
    // exceed LONG_NARRATIVE_THRESHOLD. Section-marker keeps its prior
    // silent-drop behaviour on no-match (confirmed-literal capture).
    // Pattern, label-adjacent, custom-rule, manual stay on existing
    // paths.
    expect(src).toMatch(
      /if\s*\(\s*bboxes\.length\s*===\s*0\s*&&\s*det\.source\s*===\s*"ai"\s*&&\s*det\.text\.length\s*>\s*LONG_NARRATIVE_THRESHOLD\s*\)/,
    );
  });

  it("LONG_NARRATIVE_THRESHOLD remains 80 (matches calculateBBoxAll's 80-char guard)", () => {
    expect(src).toMatch(/LONG_NARRATIVE_THRESHOLD\s*=\s*80\s*;/);
  });
});

describe("Fix B — redact-pdf.ts chains text-search on zero-bbox after Tier 1", () => {
  const src = stripComments(readFileSync(REDACT_PATH, "utf-8"));

  it("computes a separate zeroBboxDetections subset alongside usableBboxes", () => {
    // The pre-fix path computed only `usableBboxes`; zero-bbox rows
    // were unaccounted-for in the success path.
    expect(src).toMatch(
      /const\s+zeroBboxDetections\s*=\s*acceptedDetections\.filter\(\s*\(d\)\s*=>\s*d\.posW\s*===\s*0\s*\|\|\s*d\.posH\s*===\s*0\s*,?\s*\)/,
    );
  });

  it("after a successful Tier 1, runs text-search on zero-bbox detections with skipLongTextGuard:true", () => {
    // Pattern: capture the result of redactOriginalPdf as tier1Result,
    // then conditionally chain redactByTextSearch over it. The chain
    // gates on zeroBboxDetections.length > 0 to avoid subprocess
    // overhead when there are none.
    //
    // skipLongTextGuard:true is load-bearing: the chain pass's whole
    // purpose is to redact LONG zero-bbox detections (their length is
    // exactly why they ended up zero-bbox). Without the option, the
    // 80-char filter inside dedupeTextSearchRedactions would drop them
    // and the chain would no-op.
    expect(src).toMatch(/const\s+tier1Result\s*=\s*await\s+redactOriginalPdf/);
    expect(src).toMatch(/if\s*\(\s*zeroBboxDetections\.length\s*>\s*0\s*\)/);
    expect(src).toMatch(
      /redactByTextSearch\(\s*tier1Buffer\s*,\s*zeroBboxDetections\s*,[\s\S]*?skipLongTextGuard:\s*true[\s\S]*?\)/,
    );
  });

  it("feeds the Tier 1 output buffer (Buffer.from) — no extra storage download for the chain", () => {
    expect(src).toMatch(/const\s+tier1Buffer\s*=\s*Buffer\.from\(\s*tier1Result\.pdfBytes\s*\)/);
  });

  it("aggregates the redactionCount across both passes; pageCount comes from the chained output", () => {
    // The chained PDF inherits Tier 1's page count (text-search doesn't
    // alter page count), so use the chained result's pageCount which
    // re-reads it from the final PDF.
    expect(src).toMatch(
      /redactionCount:\s*[\s\S]{0,100}tier1Result\.redactionCount\s*\+\s*chainedResult\.redactionCount/,
    );
    expect(src).toMatch(/pageCount:\s*chainedResult\.pageCount/);
  });

  it("falls back to Tier 1 result on chain failure (does not fail the export)", () => {
    // The chain is best-effort; if PyMuPDF text-search throws on the
    // chained pass, we'd rather export the Tier 1 result without the
    // zero-bbox redactions than crash the user's export action.
    expect(src).toMatch(
      /catch\s*\(\s*chainErr\s*\)\s*\{[\s\S]*?\[redact-pdf\][\s\S]*?Tier 2 chain[\s\S]*?\}/,
    );
    // After the catch falls through, the function returns tier1Result
    // (the un-chained Tier 1 output). Match the literal `return tier1Result;`.
    expect(src).toMatch(/return\s+tier1Result\s*;/);
  });

  it("Tier 1 still filters by posW > 0 && posH > 0 (chain doesn't remove this)", () => {
    // The chain operates on the COMPLEMENT of the usable-bbox set;
    // the existing Tier 1 filter is what produces that complement.
    expect(src).toMatch(/d\.posW\s*>\s*0\s*&&\s*d\.posH\s*>\s*0/);
  });

  it("standalone Tier 2 (when Tier 1 produced no usable bboxes) is unchanged", () => {
    // Confirm we still have the storage.download → redactByTextSearch
    // path used when usableBboxes.length === 0 or Tier 1 itself errors.
    // This path uses the canonicalBuffer download, not tier1Result.
    expect(src).toMatch(/const\s+canonicalBuffer\s*=\s*await\s+storage\.download\(\s*doc\.canonicalPdfPath\s*\)/);
    expect(src).toMatch(/return\s+await\s+redactByTextSearch\(\s*canonicalBuffer\s*,\s*acceptedDetections\s*\)/);
  });
});
