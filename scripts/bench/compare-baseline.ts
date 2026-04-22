/**
 * Baseline comparator for the Phase 2 detection bench CI guard.
 *
 * Reads two directories of per-fixture FixtureScore JSONs (committed
 * canonical baseline + fresh run) and emits:
 *   - A GitHub-PR-friendly markdown delta table on stdout (or --output).
 *   - Exit 0 if every fixture stays within the per-fixture F1 threshold
 *     AND the suite aggregate F1 stays within the suite threshold.
 *   - Exit 1 if any of those tripwires fires.
 *
 * The comparator does NOT re-run the bench. It consumes artefacts
 * produced by `scripts/bench/bench-suite.ts`, shape `FixtureScore` from
 * `lib/bench/scoring.ts`. Pathway deltas are reported but not gated —
 * pathway movement is expected noise on a small corpus and the suite
 * aggregate catches any pathway-only regressions that matter.
 *
 * Usage:
 *   npm run bench:compare -- --canonical-dir <path> --new-dir <path> \
 *     [--output comment.md] [--threshold-fixture 0.08] \
 *     [--threshold-suite 0.05] [--marker <html-comment>]
 *
 * Exit codes:
 *   0 — no regression beyond thresholds.
 *   1 — at least one fixture or the suite F1 regressed past its threshold.
 *   2 — argument error or missing/unreadable inputs.
 */

import fs from "fs";
import path from "path";

interface Metrics {
  precision: number;
  recall: number;
  f1: number;
  tp: number;
  fp: number;
  fn: number;
}

interface FixtureScore {
  fixture: string;
  overall: Metrics;
  byPathway: Record<string, Metrics>;
}

const PATHWAYS = ["personal", "commercial", "governance", "enforcement"] as const;
type Pathway = (typeof PATHWAYS)[number];

interface Args {
  canonicalDir: string;
  newDir: string;
  output?: string;
  thresholdFixture: number;
  thresholdSuite: number;
  marker: string;
  help: boolean;
}

const DEFAULT_MARKER = "<!-- bench-detection-comment -->";

function printHelp(): void {
  console.log(`
Usage: npm run bench:compare -- --canonical-dir <path> --new-dir <path> [options]

Required:
  --canonical-dir <path>       Directory with committed baseline (*.baseline.json).
  --new-dir <path>             Directory with fresh bench-suite output.

Options:
  --output <path>              Write markdown comment to a file (default: stdout).
  --threshold-fixture <n>      Per-fixture F1 regression limit. Default 0.16.
  --threshold-suite <n>        Suite aggregate F1 regression limit. Default 0.05.
  --marker <html-comment>      HTML comment marker for PR upsert. Default:
                               ${DEFAULT_MARKER}
  --help, -h                   Print this help.

Exit codes:
  0   No regression beyond threshold.
  1   Regression detected — CI should fail.
  2   Argument or file-load error.
`);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    canonicalDir: "",
    newDir: "",
    // Raised from 12pp after observed B2 single-fixture variance reached
    // 15.1pp across identical-code runs on 2026-04-22 (see PR #26
    // discussion and issue #27). 16pp gives ~1pp headroom over the
    // current observed maximum. Proper fix is issue #27 — rebaseline
    // canonical from N=5 or N=10 runs with per-fixture medians so the
    // reference is stable and the threshold can drop back to ~10pp.
    // Suite aggregate stays tight at 5pp because run-to-run noise
    // averages out across fixtures.
    thresholdFixture: 0.16,
    thresholdSuite: 0.05,
    marker: DEFAULT_MARKER,
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
      case "--canonical-dir":
        args.canonicalDir = take();
        break;
      case "--new-dir":
        args.newDir = take();
        break;
      case "--output":
        args.output = take();
        break;
      case "--threshold-fixture": {
        const n = parseFloat(take());
        if (!Number.isFinite(n) || n < 0) {
          throw new Error("--threshold-fixture must be a non-negative number");
        }
        args.thresholdFixture = n;
        break;
      }
      case "--threshold-suite": {
        const n = parseFloat(take());
        if (!Number.isFinite(n) || n < 0) {
          throw new Error("--threshold-suite must be a non-negative number");
        }
        args.thresholdSuite = n;
        break;
      }
      case "--marker":
        args.marker = take();
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function loadFixtureScores(dir: string): Map<string, FixtureScore> {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`Baseline directory not found: ${dir}`);
  }
  const scores = new Map<string, FixtureScore>();
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith(".baseline.json")) continue;
    const name = entry.slice(0, -".baseline.json".length);
    const raw = fs.readFileSync(path.join(dir, entry), "utf-8");
    scores.set(name, JSON.parse(raw) as FixtureScore);
  }
  if (scores.size === 0) {
    throw new Error(`No *.baseline.json files found in: ${dir}`);
  }
  return scores;
}

function computeSuiteMetrics(scores: Map<string, FixtureScore>): Metrics {
  let tp = 0,
    fp = 0,
    fn = 0;
  for (const s of scores.values()) {
    tp += s.overall.tp;
    fp += s.overall.fp;
    fn += s.overall.fn;
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1, tp, fp, fn };
}

function computeSuitePathway(scores: Map<string, FixtureScore>, p: Pathway): Metrics {
  let tp = 0,
    fp = 0,
    fn = 0;
  for (const s of scores.values()) {
    const m = s.byPathway[p];
    if (!m) continue;
    tp += m.tp;
    fp += m.fp;
    fn += m.fn;
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1, tp, fp, fn };
}

function fmtDelta(n: number): string {
  const s = n >= 0 ? "+" : "";
  return `${s}${n.toFixed(3)}`;
}

function renderComment(
  args: Args,
  canonical: Map<string, FixtureScore>,
  fresh: Map<string, FixtureScore>,
  regressions: string[],
): string {
  const lines: string[] = [];
  lines.push(args.marker);
  lines.push(`## Detection bench — regression guard`);
  lines.push("");
  lines.push(
    regressions.length === 0
      ? `**Status:** :white_check_mark: within thresholds (fixture ≤${args.thresholdFixture.toFixed(3)} F1, suite ≤${args.thresholdSuite.toFixed(3)} F1).`
      : `**Status:** :x: **regression detected** — ${regressions.length} tripwire${regressions.length > 1 ? "s" : ""} fired.`,
  );
  lines.push("");

  // Per-fixture block
  lines.push("### Per fixture");
  lines.push("");
  lines.push("| fixture | baseline F1 | new F1 | ΔF1 | baseline TP/FP/FN | new TP/FP/FN |");
  lines.push("|---|---|---|---|---|---|");
  const allFixtures = new Set([...canonical.keys(), ...fresh.keys()]);
  for (const name of [...allFixtures].sort()) {
    const base = canonical.get(name);
    const now = fresh.get(name);
    if (!base && now) {
      lines.push(
        `| ${name} (new) | — | ${now.overall.f1.toFixed(3)} | n/a | — | ${now.overall.tp}/${now.overall.fp}/${now.overall.fn} |`,
      );
      continue;
    }
    if (base && !now) {
      lines.push(
        `| ${name} **missing from new** | ${base.overall.f1.toFixed(3)} | — | — | ${base.overall.tp}/${base.overall.fp}/${base.overall.fn} | — |`,
      );
      continue;
    }
    if (!base || !now) continue;
    const delta = now.overall.f1 - base.overall.f1;
    const emoji = delta < -args.thresholdFixture ? " :x:" : delta < 0 ? " :warning:" : "";
    lines.push(
      `| ${name}${emoji} | ${base.overall.f1.toFixed(3)} | ${now.overall.f1.toFixed(3)} | ${fmtDelta(delta)} | ${base.overall.tp}/${base.overall.fp}/${base.overall.fn} | ${now.overall.tp}/${now.overall.fp}/${now.overall.fn} |`,
    );
  }
  lines.push("");

  // Suite totals
  const baseSuite = computeSuiteMetrics(canonical);
  const newSuite = computeSuiteMetrics(fresh);
  const suiteDelta = newSuite.f1 - baseSuite.f1;
  const suiteEmoji =
    suiteDelta < -args.thresholdSuite ? " :x:" : suiteDelta < 0 ? " :warning:" : "";
  lines.push("### Suite aggregate");
  lines.push("");
  lines.push(
    `| baseline F1 | new F1 | ΔF1${suiteEmoji} | baseline TP/FP/FN | new TP/FP/FN |`,
  );
  lines.push("|---|---|---|---|---|");
  lines.push(
    `| ${baseSuite.f1.toFixed(3)} | ${newSuite.f1.toFixed(3)} | ${fmtDelta(suiteDelta)} | ${baseSuite.tp}/${baseSuite.fp}/${baseSuite.fn} | ${newSuite.tp}/${newSuite.fp}/${newSuite.fn} |`,
  );
  lines.push("");

  // Per-pathway (report only, no gate)
  lines.push("### Per pathway (report-only, no gate)");
  lines.push("");
  lines.push("| pathway | baseline F1 | new F1 | ΔF1 |");
  lines.push("|---|---|---|---|");
  for (const p of PATHWAYS) {
    const b = computeSuitePathway(canonical, p);
    const n = computeSuitePathway(fresh, p);
    lines.push(`| ${p} | ${b.f1.toFixed(3)} | ${n.f1.toFixed(3)} | ${fmtDelta(n.f1 - b.f1)} |`);
  }
  lines.push("");

  if (regressions.length > 0) {
    lines.push("### Regressions");
    lines.push("");
    for (const r of regressions) lines.push(`- ${r}`);
    lines.push("");
    lines.push(
      `Fix the regression OR, if it is intentional, update \`docs/bench-baselines/CANONICAL\` to point at a new baseline directory (captured via \`npm run bench:suite\`) in the same PR.`,
    );
    lines.push("");
  }

  lines.push(
    `_Thresholds: per-fixture ≤${args.thresholdFixture.toFixed(3)} F1 drop, suite ≤${args.thresholdSuite.toFixed(3)} F1 drop. See docs/bench-baselines/README.md for how to update the canonical baseline._`,
  );
  return lines.join("\n");
}

async function main(): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[bench-compare] ${err instanceof Error ? err.message : String(err)}`);
    printHelp();
    return 2;
  }
  if (args.help) {
    printHelp();
    return 0;
  }
  if (!args.canonicalDir || !args.newDir) {
    console.error("[bench-compare] --canonical-dir and --new-dir are required");
    printHelp();
    return 2;
  }

  let canonical: Map<string, FixtureScore>;
  let fresh: Map<string, FixtureScore>;
  try {
    canonical = loadFixtureScores(args.canonicalDir);
    fresh = loadFixtureScores(args.newDir);
  } catch (err) {
    console.error(`[bench-compare] ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }

  const regressions: string[] = [];
  for (const [name, base] of canonical) {
    const now = fresh.get(name);
    if (!now) {
      regressions.push(
        `\`${name}\` is in canonical baseline but missing from new run — check that the suite included every fixture.`,
      );
      continue;
    }
    const delta = now.overall.f1 - base.overall.f1;
    if (delta < -args.thresholdFixture) {
      regressions.push(
        `\`${name}\` F1 dropped by ${Math.abs(delta).toFixed(3)} (threshold ${args.thresholdFixture.toFixed(3)}): ${base.overall.f1.toFixed(3)} → ${now.overall.f1.toFixed(3)}.`,
      );
    }
  }
  const baseSuite = computeSuiteMetrics(canonical);
  const newSuite = computeSuiteMetrics(fresh);
  const suiteDelta = newSuite.f1 - baseSuite.f1;
  if (suiteDelta < -args.thresholdSuite) {
    regressions.push(
      `Suite aggregate F1 dropped by ${Math.abs(suiteDelta).toFixed(3)} (threshold ${args.thresholdSuite.toFixed(3)}): ${baseSuite.f1.toFixed(3)} → ${newSuite.f1.toFixed(3)}.`,
    );
  }

  const comment = renderComment(args, canonical, fresh, regressions);
  if (args.output) {
    fs.writeFileSync(args.output, comment);
    console.log(`[bench-compare] wrote ${args.output}`);
  } else {
    process.stdout.write(comment + "\n");
  }

  if (regressions.length > 0) {
    console.error(`[bench-compare] ${regressions.length} regression(s) detected`);
    return 1;
  }
  console.log(`[bench-compare] within thresholds`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("[bench-compare] uncaught:", err);
    process.exit(2);
  });
