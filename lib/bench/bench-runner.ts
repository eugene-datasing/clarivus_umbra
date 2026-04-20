/**
 * Reusable benchmark runner skeleton for the detection-coverage harness.
 *
 * Loads expected and actual detection JSON from disk, scores them via
 * lib/bench/scoring, emits a markdown + JSON report pair, and optionally
 * compares the current F1 against a committed baseline to flag
 * regressions. Does NOT invoke any pipeline — actual detections are
 * read from disk. Tranche 2 of Phase 2 wires this to processDocument.
 */

import fs from "fs/promises";
import path from "path";
import {
  scoreFixture,
  type ActualDetection,
  type ExpectedFixture,
  type FixtureScore,
  type Metrics,
} from "./scoring";
import { ALL_PATHWAYS, type Pathway } from "./pathways";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RunnerOptions {
  expectedPath: string;
  actualPath: string;
  outputDir: string;
  baselinePath?: string;
  /** F1 tolerance for baseline regression. Default 0.05. */
  thresholdPp?: number;
}

export interface BaselineDelta {
  baselineF1: number;
  currentF1: number;
  f1Delta: number;
  thresholdPp: number;
  within: boolean;
}

export interface RunnerResult {
  score: FixtureScore;
  baselineDelta?: BaselineDelta;
  reportMdPath: string;
  reportJsonPath: string;
}

// ---------------------------------------------------------------------------
// Loader helpers
// ---------------------------------------------------------------------------

/**
 * Accept either `{ detections: [...] }` (the spike-runner shape) or a
 * bare `[...]` array at the top level as the actual-detections file.
 * Also accepts a single FixtureScore-like shape with a `.score.detections`
 * (future compatibility with per-run tranche 2 outputs).
 */
function parseActualDetections(raw: unknown): ActualDetection[] {
  if (Array.isArray(raw)) return raw as ActualDetection[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.detections)) return obj.detections as ActualDetection[];
  }
  throw new Error(
    "actual-detections file must be a JSON array or { detections: [...] } object",
  );
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtMetrics(m: Metrics): string {
  return `| ${pct(m.precision)} | ${pct(m.recall)} | ${m.f1.toFixed(3)} | ${m.tp}/${m.fp}/${m.fn} |`;
}

function renderMarkdown(
  score: FixtureScore,
  baselineDelta?: BaselineDelta,
): string {
  const lines: string[] = [];
  lines.push(`# Bench report — \`${score.fixture}\``);
  lines.push("");
  lines.push("## Overall");
  lines.push("");
  lines.push("| precision | recall | F1 | TP/FP/FN |");
  lines.push("|---|---|---|---|");
  lines.push(fmtMetrics(score.overall));
  lines.push("");

  lines.push("## By pathway");
  lines.push("");
  lines.push("| pathway | precision | recall | F1 | TP/FP/FN |");
  lines.push("|---|---|---|---|---|");
  for (const p of ALL_PATHWAYS) {
    const m = score.byPathway[p];
    lines.push(
      `| ${p} | ${pct(m.precision)} | ${pct(m.recall)} | ${m.f1.toFixed(3)} | ${m.tp}/${m.fp}/${m.fn} |`,
    );
  }
  lines.push("");

  lines.push(`## Missing (${score.missing.length})`);
  lines.push("");
  if (score.missing.length === 0) {
    lines.push("_None — every expected detection was matched._");
  } else {
    for (const m of score.missing) {
      const page = m.page !== undefined ? ` (page ${m.page})` : "";
      lines.push(`- \`${m.type}\`${page}: "${m.text}"`);
    }
  }
  lines.push("");

  lines.push(`## Unexpected (${score.unexpected.length})`);
  lines.push("");
  if (score.unexpected.length === 0) {
    lines.push("_None — every actual detection was expected._");
  } else {
    for (const u of score.unexpected) {
      lines.push(`- \`${u.type}\` (page ${u.page}): "${u.text}"`);
    }
  }
  lines.push("");

  if (baselineDelta) {
    lines.push("## Baseline comparison");
    lines.push("");
    lines.push("| metric | baseline | current | delta |");
    lines.push("|---|---|---|---|");
    lines.push(
      `| F1 | ${baselineDelta.baselineF1.toFixed(3)} | ${baselineDelta.currentF1.toFixed(3)} | ${baselineDelta.f1Delta >= 0 ? "+" : ""}${baselineDelta.f1Delta.toFixed(3)} |`,
    );
    lines.push("");
    lines.push(
      `**Threshold:** ±${baselineDelta.thresholdPp.toFixed(3)} F1. **Regression:** ${baselineDelta.within ? "no" : "**YES**"}.`,
    );
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function extractBaselineF1(raw: unknown): number {
  if (!raw || typeof raw !== "object") {
    throw new Error("baseline file must be a JSON object (FixtureScore shape)");
  }
  const baseline = raw as Partial<FixtureScore>;
  const f1 = baseline.overall?.f1;
  if (typeof f1 !== "number") {
    throw new Error("baseline file missing overall.f1 (not a FixtureScore?)");
  }
  return f1;
}

function fixtureLabelFrom(expectedPath: string): string {
  const base = path.basename(expectedPath);
  // Strip `.expected.json` if present, else `.json`
  if (base.endsWith(".expected.json")) return base.slice(0, -".expected.json".length);
  if (base.endsWith(".json")) return base.slice(0, -".json".length);
  return base;
}

export async function runBench(options: RunnerOptions): Promise<RunnerResult> {
  const expectedRaw = await fs.readFile(options.expectedPath, "utf-8");
  const expected = JSON.parse(expectedRaw) as ExpectedFixture;

  const actualRaw = await fs.readFile(options.actualPath, "utf-8");
  const actual = parseActualDetections(JSON.parse(actualRaw));

  const fixtureLabel = fixtureLabelFrom(options.expectedPath);
  const score = scoreFixture(fixtureLabel, expected, actual);

  let baselineDelta: BaselineDelta | undefined;
  if (options.baselinePath) {
    const baselineRaw = await fs.readFile(options.baselinePath, "utf-8");
    const baselineF1 = extractBaselineF1(JSON.parse(baselineRaw));
    const thresholdPp = options.thresholdPp ?? 0.05;
    const f1Delta = score.overall.f1 - baselineF1;
    // Regression = F1 dropped by more than the threshold. Improvements
    // always pass. Treat equality-at-threshold as still-within.
    const within = f1Delta >= -thresholdPp;
    baselineDelta = {
      baselineF1,
      currentF1: score.overall.f1,
      f1Delta,
      thresholdPp,
      within,
    };
  }

  await fs.mkdir(options.outputDir, { recursive: true });
  const reportMdPath = path.join(options.outputDir, `${fixtureLabel}.report.md`);
  const reportJsonPath = path.join(options.outputDir, `${fixtureLabel}.report.json`);

  await fs.writeFile(reportMdPath, renderMarkdown(score, baselineDelta));
  await fs.writeFile(
    reportJsonPath,
    JSON.stringify({ score, baselineDelta: baselineDelta ?? null }, null, 2),
  );

  return { score, baselineDelta, reportMdPath, reportJsonPath };
}

// Re-export the Pathway type for CLI consumers that want to format
// pathway output without importing scoring.
export type { Pathway };
