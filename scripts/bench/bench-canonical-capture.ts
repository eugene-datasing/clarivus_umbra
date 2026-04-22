/**
 * Canonical baseline capture — N samples × union-of-3 per fixture.
 *
 * Produces a stable regression-guard reference from multiple independent
 * suite samples. Addresses issue #27: the single-run canonical at
 * `baseline-2026-04-21-5fixtures/` was a point estimate at the top of
 * each fixture's distribution; observed B2 variance was 15.1pp, which
 * forced the per-fixture CI threshold up to 16pp in PR #26.
 *
 * Method:
 *   For each of N samples (default 10):
 *     For each fixture:
 *       Run processDocument 3 times.
 *       Union the 3 raw detection sets (same key as bench-suite.ts).
 *       Score the union against the committed .expected.json.
 *       Persist the per-sample FixtureScore to samples/sample{NN}/<fix>.baseline.json.
 *
 *   Then aggregate: take the per-fixture MEDIAN F1 across the N samples,
 *   with accompanying median TP/FP/FN/precision/recall and per-pathway
 *   medians. The aggregate is written in the same FixtureScore shape as
 *   existing canonical baselines so compare-baseline.ts consumes it with
 *   zero change.
 *
 * Why union-of-3 per sample (rather than single-run sampling):
 *   The deployed bench-suite.ts runs with --runs 3 and unions before
 *   scoring. The canonical must match that same output shape or CI would
 *   consistently score higher than canonical (union always has
 *   more-or-equal TPs than any single run). Each sample here is one
 *   union-of-3 "observation" of what a typical bench-suite invocation
 *   would produce.
 *
 * Idempotency:
 *   Samples that already have a <fixture>.baseline.json on disk are
 *   skipped. Useful for resuming after a mid-capture interruption.
 *
 * Usage:
 *   npm run bench:canonical -- --samples 10 --output-dir docs/bench-baselines/baseline-YYYY-MM-DD-median-N10
 *
 * Flags:
 *   --samples <n>         Number of sample-runs (default 10)
 *   --runs-per-sample <n> Internal runs unioned per sample (default 3; match bench-suite.ts)
 *   --fixtures <list>     Comma-separated (default B1,B2,A,C1,B3)
 *   --output-dir <dir>    Target directory (default docs/bench-baselines/baseline-<date>-median-N<samples>)
 *   --only-aggregate      Skip sampling; re-aggregate from an existing samples/ directory.
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { scoreFixture, type ActualDetection, type ExpectedFixture, type FixtureScore, type Metrics } from "../../lib/bench/scoring";
import { ALL_PATHWAYS, type Pathway } from "../../lib/bench/pathways";
import { invokeFixturePipeline } from "../../lib/bench/pipeline-invoker";

const BENCH_DIR = "test-fixtures/bench";
const DEFAULT_FIXTURES = ["B1", "B2", "A", "C1", "B3"];

interface ParsedArgs {
  samples: number;
  runsPerSample: number;
  fixtures: string[];
  outputDir: string;
  onlyAggregate: boolean;
  help: boolean;
}

function printHelp(): void {
  console.log(`
Usage: npm run bench:canonical -- [options]

Options:
  --samples <n>           Number of sample observations. Default 10.
  --runs-per-sample <n>   Internal unioned runs per sample. Default 3 (matches bench-suite.ts).
  --fixtures <list>       Comma-separated fixture names. Default: ${DEFAULT_FIXTURES.join(",")}
  --output-dir <dir>      Target directory. Default: docs/bench-baselines/baseline-<date>-median-N<samples>
  --only-aggregate        Re-aggregate from an existing samples/ directory without re-running.
  --help, -h              Print this help.

Output:
  <output-dir>/samples/sample01..sampleNN/<fixture>.baseline.json  (per-sample FixtureScore)
  <output-dir>/<fixture>.baseline.json                             (median-aggregated FixtureScore — the canonical)
  <output-dir>/variance-stats.md                                   (per-fixture distribution stats)
  <output-dir>/suite-summary.md                                    (median aggregate summary)
  <output-dir>/capture-log.json                                    (per-sample wall time + error flag)
`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    samples: 10,
    runsPerSample: 3,
    fixtures: [...DEFAULT_FIXTURES],
    outputDir: "",
    onlyAggregate: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const take = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} requires a value`);
      return v;
    };
    switch (arg) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--samples": {
        const n = parseInt(take(), 10);
        if (!Number.isFinite(n) || n <= 0) throw new Error("--samples must be a positive integer");
        args.samples = n;
        break;
      }
      case "--runs-per-sample": {
        const n = parseInt(take(), 10);
        if (!Number.isFinite(n) || n <= 0) throw new Error("--runs-per-sample must be a positive integer");
        args.runsPerSample = n;
        break;
      }
      case "--fixtures": {
        args.fixtures = take().split(",").map((s) => s.trim()).filter(Boolean);
        if (args.fixtures.length === 0) throw new Error("--fixtures needs at least one name");
        break;
      }
      case "--output-dir":
        args.outputDir = take();
        break;
      case "--only-aggregate":
        args.onlyAggregate = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.outputDir) {
    const today = new Date().toISOString().slice(0, 10);
    args.outputDir = `docs/bench-baselines/baseline-${today}-median-N${args.samples}`;
  }
  return args;
}

interface ResolvedFixture {
  name: string;
  expectedPath: string;
  expected: ExpectedFixture;
  sourcePath: string;
}

function resolveFixture(name: string): ResolvedFixture {
  const expectedPath = path.join(BENCH_DIR, `${name}.expected.json`);
  if (!fs.existsSync(expectedPath)) throw new Error(`Expected file not found: ${expectedPath}`);
  const expected = JSON.parse(fs.readFileSync(expectedPath, "utf-8")) as ExpectedFixture & { fixtureSource?: string };
  const sourceRel = expected.fixtureSource;
  if (!sourceRel || typeof sourceRel !== "string") throw new Error(`${expectedPath}: missing "fixtureSource"`);
  const sourcePath = sourceRel.split(" ")[0];
  if (!fs.existsSync(sourcePath)) throw new Error(`Fixture source not found: ${sourcePath}`);
  return { name, expectedPath, expected, sourcePath };
}

function unionDetections(perRun: ActualDetection[][]): ActualDetection[] {
  const seen = new Map<string, ActualDetection>();
  for (const run of perRun) {
    for (const d of run) {
      const key = `${d.type}|${d.page}|${d.text.toLowerCase().replace(/\s+/g, " ").trim()}`;
      if (!seen.has(key)) seen.set(key, d);
    }
  }
  return [...seen.values()];
}

function sampleDir(outputDir: string, sampleIdx: number): string {
  return path.join(outputDir, "samples", `sample${String(sampleIdx).padStart(2, "0")}`);
}

async function runSample(
  sampleIdx: number,
  args: ParsedArgs,
  resolved: ResolvedFixture[],
): Promise<Record<string, FixtureScore>> {
  const dir = sampleDir(args.outputDir, sampleIdx);
  fs.mkdirSync(dir, { recursive: true });
  const scores: Record<string, FixtureScore> = {};
  for (const fx of resolved) {
    const outPath = path.join(dir, `${fx.name}.baseline.json`);
    if (fs.existsSync(outPath)) {
      scores[fx.name] = JSON.parse(fs.readFileSync(outPath, "utf-8")) as FixtureScore;
      console.log(`[canonical]   sample${sampleIdx} ${fx.name}: cached from disk`);
      continue;
    }
    const runs: ActualDetection[][] = [];
    const start = Date.now();
    for (let i = 1; i <= args.runsPerSample; i++) {
      const label = `canon-s${sampleIdx}-r${i}-${Date.now().toString(36)}`;
      const result = await invokeFixturePipeline(fx.sourcePath, fx.name, { runLabel: label });
      if (result.error) {
        console.warn(`[canonical]     warn: s${sampleIdx} ${fx.name} r${i} pipeline error: ${result.error}`);
      }
      runs.push(result.detections);
    }
    const unioned = unionDetections(runs);
    const score = scoreFixture(fx.name, fx.expected, unioned);
    scores[fx.name] = score;
    fs.writeFileSync(outPath, JSON.stringify(score, null, 2));
    const wallS = (Date.now() - start) / 1000;
    console.log(
      `[canonical]   sample${sampleIdx} ${fx.name}: F1=${score.overall.f1.toFixed(3)} (TP=${score.overall.tp} FP=${score.overall.fp} FN=${score.overall.fn}), ${wallS.toFixed(1)}s`,
    );
  }
  return scores;
}

// ---------------------------------------------------------------------------
// Median aggregation
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function minMax(values: number[]): { min: number; max: number } {
  return { min: Math.min(...values), max: Math.max(...values) };
}

function medianMetrics(scores: FixtureScore[]): Metrics {
  const tp = median(scores.map((s) => s.overall.tp));
  const fp = median(scores.map((s) => s.overall.fp));
  const fn = median(scores.map((s) => s.overall.fn));
  // Take median F1 directly rather than recomputing from median TP/FP/FN,
  // because the latter can give results outside the observed range when
  // runs have correlated TP/FP trade-offs.
  const precision = median(scores.map((s) => s.overall.precision));
  const recall = median(scores.map((s) => s.overall.recall));
  const f1 = median(scores.map((s) => s.overall.f1));
  return { precision, recall, f1, tp, fp, fn };
}

function medianPathway(scores: FixtureScore[], p: Pathway): Metrics {
  const metrics = scores.map((s) => s.byPathway[p]);
  const tp = median(metrics.map((m) => m.tp));
  const fp = median(metrics.map((m) => m.fp));
  const fn = median(metrics.map((m) => m.fn));
  const precision = median(metrics.map((m) => m.precision));
  const recall = median(metrics.map((m) => m.recall));
  const f1 = median(metrics.map((m) => m.f1));
  return { precision, recall, f1, tp, fp, fn };
}

function aggregateFixture(
  name: string,
  samples: FixtureScore[],
): FixtureScore {
  const overall = medianMetrics(samples);
  const byPathway = {} as Record<Pathway, Metrics>;
  for (const p of ALL_PATHWAYS) byPathway[p] = medianPathway(samples, p);
  // missing/unexpected are illustrative — pick one representative sample
  // (the first) rather than attempting to median string lists.
  return {
    fixture: name,
    overall,
    byPathway,
    missing: samples[0]?.missing ?? [],
    unexpected: samples[0]?.unexpected ?? [],
  };
}

function renderVarianceStats(
  args: ParsedArgs,
  resolved: ResolvedFixture[],
  perFixtureSamples: Record<string, FixtureScore[]>,
): string {
  const lines: string[] = [];
  lines.push(`# Canonical-capture variance stats`);
  lines.push("");
  lines.push(`- **Samples:** ${args.samples}`);
  lines.push(`- **Runs per sample (unioned):** ${args.runsPerSample}`);
  lines.push(`- **Fixtures:** ${resolved.map((r) => r.name).join(", ")}`);
  lines.push("");
  lines.push("## Per-fixture F1 distribution");
  lines.push("");
  lines.push("| fixture | min | median | max | range | stddev | samples (F1 sorted) |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const fx of resolved) {
    const f1s = perFixtureSamples[fx.name].map((s) => s.overall.f1);
    const { min, max } = minMax(f1s);
    const med = median(f1s);
    const sd = stddev(f1s);
    const sorted = [...f1s].sort((a, b) => a - b).map((f) => f.toFixed(3));
    lines.push(
      `| ${fx.name} | ${min.toFixed(3)} | **${med.toFixed(3)}** | ${max.toFixed(3)} | ${(max - min).toFixed(3)} | ${sd.toFixed(3)} | ${sorted.join(", ")} |`,
    );
  }
  lines.push("");
  lines.push("## Per-fixture TP/FP/FN distribution (median across samples)");
  lines.push("");
  lines.push("| fixture | TP (med) | TP range | FP (med) | FP range | FN (med) | FN range |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const fx of resolved) {
    const ss = perFixtureSamples[fx.name];
    const tps = ss.map((s) => s.overall.tp);
    const fps = ss.map((s) => s.overall.fp);
    const fns = ss.map((s) => s.overall.fn);
    lines.push(
      `| ${fx.name} | ${median(tps)} | ${Math.min(...tps)}-${Math.max(...tps)} | ${median(fps)} | ${Math.min(...fps)}-${Math.max(...fps)} | ${median(fns)} | ${Math.min(...fns)}-${Math.max(...fns)} |`,
    );
  }
  lines.push("");
  lines.push("## Threshold recommendation");
  lines.push("");
  const maxStddev = Math.max(...resolved.map((fx) => stddev(perFixtureSamples[fx.name].map((s) => s.overall.f1))));
  const maxRange = Math.max(...resolved.map((fx) => {
    const f1s = perFixtureSamples[fx.name].map((s) => s.overall.f1);
    return Math.max(...f1s) - Math.min(...f1s);
  }));
  lines.push(
    `- Max per-fixture F1 stddev across 10 samples: **${maxStddev.toFixed(3)}** (${(maxStddev * 100).toFixed(1)}pp).`,
  );
  lines.push(
    `- Max per-fixture F1 range across 10 samples: **${maxRange.toFixed(3)}** (${(maxRange * 100).toFixed(1)}pp).`,
  );
  lines.push(
    `- With the canonical anchored at the median rather than a single-run top-of-range, expect one-sided (canonical → fresh CI run) deviation of roughly ±${(maxRange / 2 * 100).toFixed(1)}pp.`,
  );
  lines.push(
    `- Proposed per-fixture CI threshold: **${Math.ceil((maxRange / 2 + 0.02) * 100) / 100 < 0.12 ? "0.12 (12pp)" : "keep 0.16 (16pp) pending a further data point"}**. See PR discussion for the final call.`,
  );
  return lines.join("\n");
}

function renderSummary(
  args: ParsedArgs,
  resolved: ResolvedFixture[],
  canonicalScores: Record<string, FixtureScore>,
): string {
  const lines: string[] = [];
  lines.push(`# Canonical bench summary — median of N=${args.samples}`);
  lines.push("");
  lines.push(`- **Captured:** ${new Date().toISOString()}`);
  lines.push(`- **Runs per sample (unioned):** ${args.runsPerSample}`);
  lines.push(`- **Total pipeline invocations:** ${args.samples * args.runsPerSample * resolved.length}`);
  lines.push("");
  lines.push("## Per-fixture (median)");
  lines.push("");
  lines.push("| fixture | precision | recall | F1 | TP/FP/FN |");
  lines.push("|---|---|---|---|---|");
  for (const fx of resolved) {
    const s = canonicalScores[fx.name];
    const o = s.overall;
    lines.push(
      `| ${fx.name} | ${(o.precision * 100).toFixed(1)}% | ${(o.recall * 100).toFixed(1)}% | ${o.f1.toFixed(3)} | ${o.tp}/${o.fp}/${o.fn} |`,
    );
  }
  lines.push("");
  lines.push("## Per-pathway (median across fixtures + samples)");
  lines.push("");
  lines.push("| pathway | precision | recall | F1 | TP/FP/FN |");
  lines.push("|---|---|---|---|---|");
  for (const p of ALL_PATHWAYS) {
    let tp = 0, fp = 0, fn = 0;
    for (const fx of resolved) {
      const m = canonicalScores[fx.name].byPathway[p];
      tp += m.tp;
      fp += m.fp;
      fn += m.fn;
    }
    const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    lines.push(
      `| ${p} | ${(precision * 100).toFixed(1)}% | ${(recall * 100).toFixed(1)}% | ${f1.toFixed(3)} | ${tp}/${fp}/${fn} |`,
    );
  }
  lines.push("");
  lines.push("## Suite aggregate (from per-fixture medians)");
  lines.push("");
  let tp = 0, fp = 0, fn = 0;
  for (const fx of resolved) {
    tp += canonicalScores[fx.name].overall.tp;
    fp += canonicalScores[fx.name].overall.fp;
    fn += canonicalScores[fx.name].overall.fn;
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  lines.push(
    `- **Overall:** P=${(precision * 100).toFixed(1)}% R=${(recall * 100).toFixed(1)}% F1=${f1.toFixed(3)} (TP=${tp} FP=${fp} FN=${fn})`,
  );
  lines.push("");
  lines.push("See `variance-stats.md` for distribution details.");
  return lines.join("\n");
}

function readExistingSamples(
  args: ParsedArgs,
  resolved: ResolvedFixture[],
): Record<string, FixtureScore[]> {
  const bucket: Record<string, FixtureScore[]> = {};
  for (const fx of resolved) bucket[fx.name] = [];
  for (let i = 1; i <= args.samples; i++) {
    const dir = sampleDir(args.outputDir, i);
    if (!fs.existsSync(dir)) continue;
    for (const fx of resolved) {
      const p = path.join(dir, `${fx.name}.baseline.json`);
      if (fs.existsSync(p)) {
        bucket[fx.name].push(JSON.parse(fs.readFileSync(p, "utf-8")) as FixtureScore);
      }
    }
  }
  return bucket;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[canonical] ${err instanceof Error ? err.message : String(err)}`);
    printHelp();
    return 2;
  }
  if (args.help) {
    printHelp();
    return 0;
  }

  let resolved: ResolvedFixture[];
  try {
    resolved = args.fixtures.map(resolveFixture);
  } catch (err) {
    console.error(`[canonical] ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }

  fs.mkdirSync(args.outputDir, { recursive: true });
  console.log(
    `[canonical] output ${args.outputDir}  samples=${args.samples}  runs/sample=${args.runsPerSample}  fixtures=${resolved.map((r) => r.name).join(",")}`,
  );

  const perFixtureSamples: Record<string, FixtureScore[]> = Object.fromEntries(
    resolved.map((fx) => [fx.name, []]),
  );

  if (!args.onlyAggregate) {
    for (let sampleIdx = 1; sampleIdx <= args.samples; sampleIdx++) {
      console.log(`[canonical] sample ${sampleIdx}/${args.samples}`);
      const scores = await runSample(sampleIdx, args, resolved);
      for (const fx of resolved) perFixtureSamples[fx.name].push(scores[fx.name]);
    }
  } else {
    const loaded = readExistingSamples(args, resolved);
    for (const fx of resolved) perFixtureSamples[fx.name] = loaded[fx.name];
  }

  // Sanity: every fixture should have N samples now.
  for (const fx of resolved) {
    const n = perFixtureSamples[fx.name].length;
    if (n !== args.samples) {
      console.error(`[canonical] fixture ${fx.name} has ${n} samples, expected ${args.samples}`);
      return 2;
    }
  }

  // Aggregate
  const canonicalScores: Record<string, FixtureScore> = {};
  for (const fx of resolved) {
    canonicalScores[fx.name] = aggregateFixture(fx.name, perFixtureSamples[fx.name]);
    fs.writeFileSync(
      path.join(args.outputDir, `${fx.name}.baseline.json`),
      JSON.stringify(canonicalScores[fx.name], null, 2),
    );
  }

  fs.writeFileSync(
    path.join(args.outputDir, "variance-stats.md"),
    renderVarianceStats(args, resolved, perFixtureSamples),
  );
  fs.writeFileSync(
    path.join(args.outputDir, "suite-summary.md"),
    renderSummary(args, resolved, canonicalScores),
  );

  console.log(`[canonical] aggregate written to ${args.outputDir}/`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("[canonical] uncaught:", err);
    process.exit(2);
  });
