/**
 * CLI wrapper for the benchmark runner.
 *
 * Usage:
 *   npm run bench:detection -- --expected <path> --actual <path> [--output <dir>] [--baseline <path>] [--threshold <number>]
 *
 * Exit codes:
 *   0 — scored successfully; baseline (if supplied) within threshold.
 *   1 — baseline regression beyond threshold.
 *   2 — argument error or load failure.
 */

import { runBench, type RunnerOptions } from "../../lib/bench/bench-runner";

interface ParsedArgs extends RunnerOptions {
  help: boolean;
}

function printHelp(): void {
  console.log(`
Usage: npm run bench:detection -- --expected <path> --actual <path> [options]

Required:
  --expected <path>     Path to <fixture>.expected.json (hand-authored ground truth).
  --actual <path>       Path to actual detections JSON (array or { detections: [...] }).

Options:
  --output <dir>        Where to write the report. Default: docs/bench-baselines/
  --baseline <path>     Optional baseline FixtureScore JSON to diff against.
  --threshold <n>       F1 regression tolerance. Default: 0.05
  --help, -h            Print this help and exit.

Exit codes:
  0   Success; if --baseline supplied, within threshold (or improved).
  1   Baseline regression beyond threshold.
  2   Argument / load error.
`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    expectedPath: "",
    actualPath: "",
    outputDir: "docs/bench-baselines/",
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
      case "--expected":
        args.expectedPath = take();
        break;
      case "--actual":
        args.actualPath = take();
        break;
      case "--output":
        args.outputDir = take();
        break;
      case "--baseline":
        args.baselinePath = take();
        break;
      case "--threshold": {
        const n = parseFloat(take());
        if (!Number.isFinite(n) || n < 0) {
          throw new Error(`--threshold requires a non-negative number (got "${argv[i]}")`);
        }
        args.thresholdPp = n;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

async function main(): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[bench] ${err instanceof Error ? err.message : String(err)}`);
    printHelp();
    return 2;
  }

  if (args.help) {
    printHelp();
    return 0;
  }
  if (!args.expectedPath || !args.actualPath) {
    console.error("[bench] --expected and --actual are required");
    printHelp();
    return 2;
  }

  try {
    const result = await runBench({
      expectedPath: args.expectedPath,
      actualPath: args.actualPath,
      outputDir: args.outputDir,
      baselinePath: args.baselinePath,
      thresholdPp: args.thresholdPp,
    });

    const o = result.score.overall;
    console.log(
      `[bench] ${result.score.fixture}: P=${pct(o.precision)} R=${pct(o.recall)} F1=${o.f1.toFixed(3)} (TP=${o.tp} FP=${o.fp} FN=${o.fn})`,
    );
    if (result.baselineDelta) {
      const d = result.baselineDelta;
      const sign = d.f1Delta >= 0 ? "+" : "";
      console.log(
        `[bench] baseline: F1 ${d.baselineF1.toFixed(3)} → ${d.currentF1.toFixed(3)} (${sign}${d.f1Delta.toFixed(3)}); within threshold ${d.thresholdPp}: ${d.within ? "YES" : "NO — regression"}`,
      );
    }
    console.log(`[bench] report: ${result.reportMdPath}`);
    console.log(`[bench] json:   ${result.reportJsonPath}`);

    if (result.baselineDelta && !result.baselineDelta.within) {
      return 1;
    }
    return 0;
  } catch (err) {
    console.error(`[bench] fatal: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("[bench] uncaught:", err);
    process.exit(2);
  });
