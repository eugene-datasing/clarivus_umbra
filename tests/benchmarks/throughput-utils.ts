/**
 * Throughput benchmark utilities for Veil performance tests.
 *
 * Provides synthetic data generators and timing helpers used by the
 * performance benchmark test suite to validate RFP requirements:
 *   - 5,000 pages in 4 hours
 *   - 10,000 document duplicate detection in 1 hour
 *   - 5 concurrent reviewers without lag
 */

import type { ExtractedPage } from "@/lib/pipeline/extract";

// ---------------------------------------------------------------------------
// Vocabulary for realistic synthetic content
// ---------------------------------------------------------------------------

const WORDS = [
  "the", "council", "request", "information", "report", "public",
  "meeting", "decision", "document", "committee", "property", "plan",
  "policy", "resource", "consent", "application", "review", "section",
  "disclosure", "assessment", "environmental", "district", "community",
  "development", "infrastructure", "building", "consultation", "compliance",
  "regulation", "management", "governance", "financial", "budget",
  "expenditure", "contract", "procurement", "submission", "correspondence",
  "memorandum", "briefing", "advice", "recommendation", "resolution",
  "amendment", "bylaw", "statute", "legislation", "obligation",
  "requirement", "standard", "guideline", "procedure", "protocol",
  "framework", "strategy", "objective", "outcome", "performance",
  "indicator", "benchmark", "target", "milestone", "schedule",
  "timeline", "deadline", "notification", "acknowledgement", "response",
  "investigation", "complaint", "appeal", "hearing", "determination",
  "Auckland", "Wellington", "Christchurch", "Hamilton", "Taranaki",
  "New Plymouth", "Stratford", "Inglewood", "Waitara", "Oakura",
  "pursuant", "notwithstanding", "whereas", "herein", "thereof",
  "accordingly", "furthermore", "additionally", "specifically", "generally",
  "approximately", "significantly", "substantially", "effectively",
  "efficiently", "appropriately", "reasonably", "sufficiently",
];

/**
 * Generate a synthetic page with realistic text content.
 *
 * Each page contains approximately 500 words of plausible local government
 * document text, sprinkled with occasional PII-like patterns to exercise
 * the detection pipeline.
 */
export function generateSyntheticPage(pageNumber: number): ExtractedPage {
  // Use absolute value to handle negative seeds from hash wrapping
  const pn = Math.abs(pageNumber) || 1;
  const wordCount = 480 + (pn % 40); // ~480-520 words per page
  const sentences: string[] = [];
  let currentWordCount = 0;

  while (currentWordCount < wordCount) {
    const sentenceLen = 8 + (pn * 7 + currentWordCount) % 12; // 8-19 words
    const sentenceWords: string[] = [];

    for (let w = 0; w < sentenceLen && currentWordCount < wordCount; w++) {
      const idx =
        (pn * 31 + currentWordCount * 17 + w * 13) % WORDS.length;
      sentenceWords.push(WORDS[idx]);
      currentWordCount++;
    }

    // Capitalise first word
    if (sentenceWords.length > 0) {
      sentenceWords[0] =
        sentenceWords[0].charAt(0).toUpperCase() + sentenceWords[0].slice(1);
    }

    sentences.push(sentenceWords.join(" ") + ".");
  }

  // Inject occasional PII-like patterns for realism (every 5th page)
  if (pn % 5 === 0) {
    sentences.push(`Contact: person${pn}@example.govt.nz`);
    sentences.push(`Phone: 06 ${100 + (pn % 900)} ${1000 + (pn % 9000)}`);
  }

  const text = sentences.join(" ");

  return {
    pageNumber,
    text,
    words: [],
  };
}

/**
 * Generate a synthetic document with the given number of pages.
 *
 * Returns both individual pages and the combined full text, suitable for
 * both extraction pipeline and duplicate detection benchmarks.
 */
export function generateSyntheticDocument(
  docId: string,
  pageCount: number,
): { pages: ExtractedPage[]; totalText: string } {
  // Use docId hash to create deterministic but varied content
  let seed = 0;
  for (let i = 0; i < docId.length; i++) {
    seed = (seed * 31 + docId.charCodeAt(i)) | 0;
  }

  const pages: ExtractedPage[] = [];
  const textParts: string[] = [];

  for (let p = 1; p <= pageCount; p++) {
    const page = generateSyntheticPage(seed + p);
    // Override the page number to be sequential within this document
    const adjustedPage: ExtractedPage = { ...page, pageNumber: p };
    pages.push(adjustedPage);
    textParts.push(adjustedPage.text);
  }

  return {
    pages,
    totalText: textParts.join("\n\n"),
  };
}

/**
 * Measure the wall-clock duration of an async operation.
 *
 * Returns the operation result alongside timing information for
 * throughput analysis.
 */
export async function measureThroughput<T>(
  fn: () => Promise<T>,
  label: string,
): Promise<{ result: T; durationMs: number; label: string }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = performance.now() - start;

  return { result, durationMs, label };
}
