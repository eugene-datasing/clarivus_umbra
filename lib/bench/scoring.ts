/**
 * Benchmark scoring — precision / recall / F1 for a single fixture
 * against a hand-authored ground-truth set.
 *
 * Matching semantics are tight by design:
 *   - Type agreement required (an actual `personal-name` detection
 *     cannot satisfy an expected `confidential` entry, even with
 *     identical text).
 *   - Exact mustMatch = case-insensitive, whitespace-collapsed equality.
 *   - Substring mustMatch = normalised actual.text contains normalised
 *     expected.text.
 *   - Page constraint optional: when expected.page is set, actual.page
 *     must match; when absent, page is ignored.
 *   - First-match-wins: each actual detection can satisfy at most one
 *     expected entry. Surplus actuals count as false positives.
 *
 * Per-pathway aggregates are computed alongside the overall score so
 * callers can detect pathway-specific regressions without decoding the
 * missing/unexpected lists by hand.
 */

import { ALL_PATHWAYS, pathwayFor, type Pathway } from "./pathways";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ExpectedDetection {
  text: string;
  type: string;
  mustMatch: "exact" | "substring";
  page?: number;
  pathway?: Pathway;
  rationale?: string;
}

export interface ActualDetection {
  text: string;
  type: string;
  page: number;
  confidence?: number;
}

export interface ExpectedFixture {
  fixtureSha256?: string;
  documentType: string;
  expectedDetections: ExpectedDetection[];
}

export interface Metrics {
  precision: number;
  recall: number;
  f1: number;
  tp: number;
  fp: number;
  fn: number;
}

export interface FixtureScore {
  fixture: string;
  overall: Metrics;
  byPathway: Record<Pathway, Metrics>;
  missing: ExpectedDetection[];
  unexpected: ActualDetection[];
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Case-insensitive, whitespace-collapsed text normalisation. */
function normalise(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Does a single actual satisfy a single expected entry? */
function matches(actual: ActualDetection, expected: ExpectedDetection): boolean {
  if (actual.type !== expected.type) return false;
  if (expected.page !== undefined && actual.page !== expected.page) return false;
  const a = normalise(actual.text);
  const e = normalise(expected.text);
  if (!a || !e) return false;
  return expected.mustMatch === "exact" ? a === e : a.includes(e);
}

/**
 * Precision / recall / F1 from raw counts. 0/0 is treated as vacuously
 * perfect (1.0) — if there is nothing to predict, any prediction set is
 * trivially correct in that dimension. F1 drops to 0 when either factor
 * is 0.
 */
function metricsFrom(tp: number, fp: number, fn: number): Metrics {
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 =
    precision + recall === 0
      ? 0
      : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1, tp, fp, fn };
}

function emptyPathwayCounts(): Record<Pathway, { tp: number; fp: number; fn: number }> {
  const out = {} as Record<Pathway, { tp: number; fp: number; fn: number }>;
  for (const p of ALL_PATHWAYS) {
    out[p] = { tp: 0, fp: 0, fn: 0 };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public scorer
// ---------------------------------------------------------------------------

export function scoreFixture(
  fixtureLabel: string,
  expected: ExpectedFixture,
  actual: ActualDetection[],
): FixtureScore {
  const pathway = emptyPathwayCounts();
  const missing: ExpectedDetection[] = [];
  const claimed = new Set<number>();

  for (const exp of expected.expectedDetections) {
    const expPathway = exp.pathway ?? pathwayFor(exp.type);
    let found = false;
    for (let i = 0; i < actual.length; i++) {
      if (claimed.has(i)) continue;
      if (matches(actual[i], exp)) {
        claimed.add(i);
        if (expPathway) pathway[expPathway].tp++;
        found = true;
        break;
      }
    }
    if (!found) {
      missing.push(exp);
      if (expPathway) pathway[expPathway].fn++;
    }
  }

  const unexpected: ActualDetection[] = [];
  for (let i = 0; i < actual.length; i++) {
    if (claimed.has(i)) continue;
    unexpected.push(actual[i]);
    const actualPathway = pathwayFor(actual[i].type);
    if (actualPathway) pathway[actualPathway].fp++;
  }

  const tp = expected.expectedDetections.length - missing.length;
  const fp = unexpected.length;
  const fn = missing.length;

  const byPathway = {} as Record<Pathway, Metrics>;
  for (const p of ALL_PATHWAYS) {
    const { tp: ptp, fp: pfp, fn: pfn } = pathway[p];
    byPathway[p] = metricsFrom(ptp, pfp, pfn);
  }

  return {
    fixture: fixtureLabel,
    overall: metricsFrom(tp, fp, fn),
    byPathway,
    missing,
    unexpected,
  };
}
