/**
 * Live-pipeline bench suite — runs each fixture through processDocument N
 * times, unions detections across runs to absorb AI non-determinism,
 * scores against the committed ground-truth JSON, and writes a suite of
 * baseline / report / per-run artefacts.
 *
 * Usage:
 *   npm run bench:suite -- --fixtures B1,B2,A,C1 --runs 3 \
 *     --output-dir docs/bench-baselines/baseline-2026-04-20
 *
 * Named fixture resolution:
 *   <name> → expected = test-fixtures/bench/<name>.expected.json
 *            source   = <fixtureSource> field (the source of truth is the
 *                       expected.json; we don't second-guess it here)
 *
 * Tranche 2b of docs/detection-coverage-plan-2026-04.md.
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { scoreFixture, type FixtureScore, type ActualDetection, type ExpectedFixture } from "../../lib/bench/scoring";
import { ALL_PATHWAYS } from "../../lib/bench/pathways";
import { invokeFixturePipeline, type InvokerResult } from "../../lib/bench/pipeline-invoker";

interface ParsedArgs {
  fixtures: string[];
  runs: number;
  outputDir: string;
  dryRun: boolean;
  help: boolean;
}

const DEFAULT_FIXTURES = ["B1", "B2", "A", "C1"];
const DEFAULT_RUNS = 3;
const BENCH_DIR = "test-fixtures/bench";

function printHelp(): void {
  console.log(`
Usage: npm run bench:suite -- [options]

Options:
  --fixtures <list>     Comma-separated fixture names. Default: ${DEFAULT_FIXTURES.join(",")}
  --runs <n>            Runs per fixture (unioned). Default: ${DEFAULT_RUNS}
  --output-dir <dir>    Where to write baselines + reports. Default: docs/bench-baselines/baseline-<YYYY-MM-DD>/
  --dry-run             Validate fixtures + planning only; no pipeline calls, no Azure spend.
  --help, -h            Print this help and exit.

Each fixture produces:
  <name>.baseline.json                (committable FixtureScore from unioned detections)
  <name>.report.md                    (human-readable report)
  <name>.report.json                  (machine-readable twin)
  <name>.run1.detections.json ... runN.detections.json   (per-run raw detections)
  <name>.union.detections.json        (union used for scoring)

And a top-level suite-summary.md covering all fixtures + aggregate totals.

Env:
  DATABASE_URL          Required. Defaults to postgresql://veil:veil_dev@localhost:5434/veil.
  AZURE_OPENAI_*        Required for AI detection.
  AZURE_DI_*            Required for OCR / layout extraction.

Exit codes:
  0   Suite completed; baselines + reports written.
  2   Argument error, fixture not found, or invoker hard failure.
`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    fixtures: [...DEFAULT_FIXTURES],
    runs: DEFAULT_RUNS,
    outputDir: "",
    dryRun: false,
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
      case "--fixtures": {
        const raw = take();
        args.fixtures = raw.split(",").map((s) => s.trim()).filter(Boolean);
        if (args.fixtures.length === 0) {
          throw new Error("--fixtures requires at least one name");
        }
        break;
      }
      case "--runs": {
        const n = parseInt(take(), 10);
        if (!Number.isFinite(n) || n <= 0) {
          throw new Error(`--runs requires a positive integer (got "${argv[i]}")`);
        }
        args.runs = n;
        break;
      }
      case "--output-dir":
        args.outputDir = take();
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.outputDir) {
    const today = new Date().toISOString().slice(0, 10);
    args.outputDir = `docs/bench-baselines/baseline-${today}`;
  }

  return args;
}

function commitSha(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

interface ResolvedFixture {
  name: string;
  expectedPath: string;
  expected: ExpectedFixture;
  sourcePath: string;
}

function resolveFixture(name: string): ResolvedFixture {
  const expectedPath = path.join(BENCH_DIR, `${name}.expected.json`);
  if (!fs.existsSync(expectedPath)) {
    throw new Error(`Expected file not found: ${expectedPath}`);
  }
  const expected = JSON.parse(fs.readFileSync(expectedPath, "utf-8")) as ExpectedFixture & {
    fixtureSource?: string;
  };
  const sourceRel = expected.fixtureSource;
  if (!sourceRel || typeof sourceRel !== "string") {
    throw new Error(`${expectedPath}: missing "fixtureSource" field`);
  }
  // Handle the "B2 fixtureSource references its own copy" note.
  const sourcePath = sourceRel.split(" ")[0];
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Fixture source not found: ${sourcePath}`);
  }
  return { name, expectedPath, expected, sourcePath };
}

/**
 * Union detections across N runs. Two detections are the same if their
 * normalised text + type + page agree. This mirrors the substring-match
 * tolerance of the scorer without being too loose: type agreement is
 * always required, page agreement is always required.
 */
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

interface FixtureSuiteResult {
  name: string;
  score: FixtureScore;
  perRunCounts: number[];
  unionCount: number;
  wallMs: number[];
  errors: (string | undefined)[];
  canonicalPdfPageCount: number | null;
  documentStatus: string;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function writeArtefacts(
  outputDir: string,
  name: string,
  runs: InvokerResult[],
  union: ActualDetection[],
  score: FixtureScore,
): void {
  fs.writeFileSync(
    path.join(outputDir, `${name}.baseline.json`),
    JSON.stringify(score, null, 2),
  );
  fs.writeFileSync(
    path.join(outputDir, `${name}.report.json`),
    JSON.stringify({ score, baselineDelta: null }, null, 2),
  );
  fs.writeFileSync(
    path.join(outputDir, `${name}.report.md`),
    renderFixtureReport(score),
  );
  fs.writeFileSync(
    path.join(outputDir, `${name}.union.detections.json`),
    JSON.stringify({ detections: union }, null, 2),
  );
  for (let i = 0; i < runs.length; i++) {
    fs.writeFileSync(
      path.join(outputDir, `${name}.run${i + 1}.detections.json`),
      JSON.stringify(
        {
          detections: runs[i].detections,
          wallMs: runs[i].wallMs,
          documentStatus: runs[i].documentStatus,
          canonicalPdfSource: runs[i].canonicalPdfSource,
          canonicalPdfPageCount: runs[i].canonicalPdfPageCount,
          error: runs[i].error ?? null,
        },
        null,
        2,
      ),
    );
  }
}

function renderFixtureReport(score: FixtureScore): string {
  const lines: string[] = [];
  lines.push(`# Bench report — \`${score.fixture}\``);
  lines.push("");
  lines.push("## Overall");
  lines.push("");
  lines.push("| precision | recall | F1 | TP/FP/FN |");
  lines.push("|---|---|---|---|");
  const o = score.overall;
  lines.push(`| ${pct(o.precision)} | ${pct(o.recall)} | ${o.f1.toFixed(3)} | ${o.tp}/${o.fp}/${o.fn} |`);
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
  return lines.join("\n");
}

function renderSuiteSummary(
  outputDir: string,
  runs: number,
  results: FixtureSuiteResult[],
  startedAt: string,
  sha: string,
): string {
  const lines: string[] = [];
  lines.push(`# Bench suite summary`);
  lines.push("");
  lines.push(`- **Started:** ${startedAt}`);
  lines.push(`- **Commit:** \`${sha}\``);
  lines.push(`- **Runs per fixture:** ${runs}`);
  lines.push(`- **Fixtures:** ${results.map((r) => r.name).join(", ")}`);
  lines.push("");
  lines.push("## Per-fixture overall");
  lines.push("");
  lines.push("| fixture | precision | recall | F1 | TP/FP/FN | union count | run counts | wall (s) | status |");
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    const o = r.score.overall;
    const runCounts = r.perRunCounts.join("/");
    const walls = r.wallMs.map((w) => (w / 1000).toFixed(1)).join("/");
    const errors = r.errors.filter((e) => e).length;
    const statusCell = errors > 0 ? `${r.documentStatus} (${errors} err)` : r.documentStatus;
    lines.push(
      `| ${r.name} | ${pct(o.precision)} | ${pct(o.recall)} | ${o.f1.toFixed(3)} | ${o.tp}/${o.fp}/${o.fn} | ${r.unionCount} | ${runCounts} | ${walls} | ${statusCell} |`,
    );
  }
  lines.push("");

  lines.push("## Per-pathway aggregates (all fixtures unioned)");
  lines.push("");
  lines.push("| pathway | precision | recall | F1 | TP/FP/FN |");
  lines.push("|---|---|---|---|---|");
  for (const p of ALL_PATHWAYS) {
    let tp = 0,
      fp = 0,
      fn = 0;
    for (const r of results) {
      tp += r.score.byPathway[p].tp;
      fp += r.score.byPathway[p].fp;
      fn += r.score.byPathway[p].fn;
    }
    const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
    const f1 =
      precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    lines.push(
      `| ${p} | ${pct(precision)} | ${pct(recall)} | ${f1.toFixed(3)} | ${tp}/${fp}/${fn} |`,
    );
  }
  lines.push("");

  let tpTot = 0,
    fpTot = 0,
    fnTot = 0;
  for (const r of results) {
    tpTot += r.score.overall.tp;
    fpTot += r.score.overall.fp;
    fnTot += r.score.overall.fn;
  }
  const pAll = tpTot + fpTot === 0 ? 1 : tpTot / (tpTot + fpTot);
  const rAll = tpTot + fnTot === 0 ? 1 : tpTot / (tpTot + fnTot);
  const f1All = pAll + rAll === 0 ? 0 : (2 * pAll * rAll) / (pAll + rAll);
  lines.push("## Suite totals");
  lines.push("");
  lines.push(
    `- **Overall:** P=${pct(pAll)} R=${pct(rAll)} F1=${f1All.toFixed(3)} (TP=${tpTot} FP=${fpTot} FN=${fnTot})`,
  );
  const totalWallS = results
    .flatMap((r) => r.wallMs)
    .reduce((a, b) => a + b, 0) / 1000;
  lines.push(`- **Total wall time:** ${totalWallS.toFixed(1)}s`);
  lines.push("");
  lines.push("## Artefacts");
  lines.push("");
  lines.push(`Written to \`${outputDir}\`:`);
  for (const r of results) {
    lines.push(`- \`${r.name}.baseline.json\` — committable baseline.`);
    lines.push(`- \`${r.name}.report.md\` / \`${r.name}.report.json\` — per-fixture report.`);
    lines.push(`- \`${r.name}.union.detections.json\` — unioned detections used for scoring.`);
    lines.push(`- \`${r.name}.run1..run${runs}.detections.json\` — per-run raw detections.`);
  }
  lines.push("");
  return lines.join("\n");
}

async function main(): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[bench-suite] ${err instanceof Error ? err.message : String(err)}`);
    printHelp();
    return 2;
  }

  if (args.help) {
    printHelp();
    return 0;
  }

  const startedAt = new Date().toISOString();
  const sha = commitSha();

  let resolved: ResolvedFixture[];
  try {
    resolved = args.fixtures.map(resolveFixture);
  } catch (err) {
    console.error(`[bench-suite] ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }

  console.log(`[bench-suite] commit ${sha.slice(0, 8)}  fixtures=${resolved.map((r) => r.name).join(",")}  runs=${args.runs}${args.dryRun ? "  (dry-run)" : ""}`);
  for (const r of resolved) {
    console.log(`[bench-suite]   ${r.name}: source=${r.sourcePath}  expected=${r.expected.expectedDetections.length} entries`);
  }

  if (args.dryRun) {
    console.log("[bench-suite] dry-run: skipping pipeline invocation");
    return 0;
  }

  fs.mkdirSync(args.outputDir, { recursive: true });

  const results: FixtureSuiteResult[] = [];
  for (const fx of resolved) {
    console.log(`[bench-suite] fixture: ${fx.name}`);
    const perRun: InvokerResult[] = [];
    for (let i = 1; i <= args.runs; i++) {
      const runLabel = `${fx.name}-r${i}-${Date.now().toString(36)}`;
      console.log(`[bench-suite]   run ${i}/${args.runs}: ${fx.name} (${runLabel})`);
      const result = await invokeFixturePipeline(fx.sourcePath, fx.name, { runLabel });
      if (result.error) {
        console.warn(`[bench-suite]     warn: processDocument error on ${fx.name}: ${result.error}`);
      }
      console.log(
        `[bench-suite]     ok: ${result.detections.length} detections, ${result.canonicalPdfPageCount ?? "?"} pages, ${(result.wallMs / 1000).toFixed(1)}s, status=${result.documentStatus}`,
      );
      perRun.push(result);
    }
    const unioned = unionDetections(perRun.map((r) => r.detections));
    const score = scoreFixture(fx.name, fx.expected, unioned);
    const summary: FixtureSuiteResult = {
      name: fx.name,
      score,
      perRunCounts: perRun.map((r) => r.detections.length),
      unionCount: unioned.length,
      wallMs: perRun.map((r) => r.wallMs),
      errors: perRun.map((r) => r.error),
      canonicalPdfPageCount: perRun[0]?.canonicalPdfPageCount ?? null,
      documentStatus: perRun[0]?.documentStatus ?? "unknown",
    };
    writeArtefacts(args.outputDir, fx.name, perRun, unioned, score);
    results.push(summary);
    console.log(
      `[bench-suite]   scored ${fx.name}: P=${pct(score.overall.precision)} R=${pct(score.overall.recall)} F1=${score.overall.f1.toFixed(3)} (TP=${score.overall.tp} FP=${score.overall.fp} FN=${score.overall.fn})`,
    );
  }

  const summaryMd = renderSuiteSummary(args.outputDir, args.runs, results, startedAt, sha);
  const summaryPath = path.join(args.outputDir, "suite-summary.md");
  fs.writeFileSync(summaryPath, summaryMd);
  console.log(`[bench-suite] summary: ${summaryPath}`);

  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("[bench-suite] uncaught:", err);
    process.exit(2);
  });
