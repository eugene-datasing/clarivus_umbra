/**
 * Phase 2 latency spike — single-path study, DI-on-canonical vs Phase 1
 * baseline (mammoth for DOCX, DI for original PDF only).
 *
 * Corpus: 3 small (1/2/3 pg), 3 medium (6 pg, from dummy-lgoima-pack),
 * 1 large (23 pg, synthetic). 5 runs per fixture × 2 conditions (flag
 * off / flag on). 70 processDocument invocations total.
 *
 * Condition "off": PHASE2_SPIKE unset. Current Phase 1 behaviour —
 * mammoth for DOCX, DI only for original PDFs.
 *
 * Condition "on":  PHASE2_SPIKE=1. The temporary branch in
 * process.ts:269 routes extractText through DI against the canonical
 * PDF. This branch is NOT committed; it exists in the working tree for
 * the duration of the spike and is reverted before PR.
 *
 * Prereqs:
 *   - Docker Postgres up, seed case req-001 present
 *   - .env with AZURE_DI_* and AZURE_OPENAI_* populated
 *   - test-fixtures/dummy-lgoima-pack/ populated locally (not tracked)
 *   - LibreOffice binary on PATH (symlink for macOS per Phase 1 log)
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/phase2-spike.ts
 *
 * Emits: docs/phase-2-spike-findings.md with p50/p95/p99 per fixture
 * per condition, Detection count stability, and a recommendation.
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { processDocument } from "../lib/pipeline/process";
import { getStorage } from "../lib/storage";

interface Fixture {
  label: string;
  bucket: "small" | "medium" | "large";
  pages: number;
  fixturePath: string;
  fileType: string;
  mimeType: string;
}

const FIXTURES: Fixture[] = [
  {
    label: "small-1pg",
    bucket: "small",
    pages: 1,
    fixturePath: "test-fixtures/phase2-spike/small-1pg.docx",
    fileType: "DOCX",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    label: "small-2pg",
    bucket: "small",
    pages: 2,
    fixturePath: "test-fixtures/phase2-spike/small-2pg.docx",
    fileType: "DOCX",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    label: "small-3pg",
    bucket: "small",
    pages: 3,
    fixturePath: "test-fixtures/phase2-spike/small-3pg.docx",
    fileType: "DOCX",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    label: "medium-A",
    bucket: "medium",
    pages: 6,
    fixturePath: "test-fixtures/dummy-lgoima-pack/01_Planning_and_Resource_Consent/04_main_case_file_long.docx",
    fileType: "DOCX",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    label: "medium-B",
    bucket: "medium",
    pages: 6,
    fixturePath: "test-fixtures/dummy-lgoima-pack/01_Planning_and_Resource_Consent/05_internal_briefing_and_recommendation.docx",
    fileType: "DOCX",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    label: "medium-C",
    bucket: "medium",
    pages: 6,
    fixturePath: "test-fixtures/dummy-lgoima-pack/01_Planning_and_Resource_Consent/06_supporting_statements_and_appendices.docx",
    fileType: "DOCX",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    label: "large-23pg",
    bucket: "large",
    pages: 23,
    fixturePath: "test-fixtures/phase2-spike/large-23pg.docx",
    fileType: "DOCX",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
];

const CASE_ID = "req-001";
const RUNS_PER_CELL = 5;

interface RunResult {
  fixture: string;
  bucket: "small" | "medium" | "large";
  pages: number;
  condition: "off" | "on";
  runIdx: number;
  wallMs: number;
  detectionCount: number;
  canonicalPdfSource: string | null;
  error?: string;
}

async function runOne(
  prisma: PrismaClient,
  fixture: Fixture,
  condition: "off" | "on",
  runIdx: number,
): Promise<RunResult> {
  const buffer = fs.readFileSync(path.resolve(fixture.fixturePath));
  const ext = path.extname(fixture.fixturePath).toLowerCase();

  const doc = await prisma.document.create({
    data: {
      caseId: CASE_ID,
      name: `spike-${fixture.label}-${condition}-${runIdx}-${Date.now()}${ext}`,
      fileType: fixture.fileType,
      mimeType: fixture.mimeType,
      sizeBytes: buffer.length,
      status: "queued",
    },
  });

  const storage = getStorage();
  const key = `${CASE_ID}/${doc.id}/original${ext}`;
  await storage.upload(key, buffer, fixture.mimeType);
  await prisma.document.update({ where: { id: doc.id }, data: { originalPath: key } });

  // Set/unset the spike flag for this invocation.
  if (condition === "on") process.env.PHASE2_SPIKE = "1";
  else delete process.env.PHASE2_SPIKE;

  const start = Date.now();
  let error: string | undefined;
  try {
    await processDocument(doc.id);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const wallMs = Date.now() - start;

  const updated = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
  const detCount = await prisma.detection.count({ where: { documentId: doc.id } });

  // Clean up — delete all descendants.
  await prisma.detection.deleteMany({ where: { documentId: doc.id } }).catch(() => {});
  await prisma.documentPage.deleteMany({ where: { documentId: doc.id } }).catch(() => {});
  await prisma.document.delete({ where: { id: doc.id } }).catch(() => {});

  return {
    fixture: fixture.label,
    bucket: fixture.bucket,
    pages: fixture.pages,
    condition,
    runIdx,
    wallMs,
    detectionCount: detCount,
    canonicalPdfSource: updated.canonicalPdfSource,
    error,
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function summarise(rows: RunResult[]) {
  const by = new Map<string, RunResult[]>();
  for (const r of rows) {
    const key = `${r.fixture}|${r.condition}`;
    if (!by.has(key)) by.set(key, []);
    by.get(key)!.push(r);
  }
  const summary: Array<{
    fixture: string;
    bucket: string;
    pages: number;
    condition: string;
    n: number;
    p50: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
    detCounts: number[];
    errors: string[];
  }> = [];
  for (const [key, cell] of by.entries()) {
    const [fixture, condition] = key.split("|");
    const times = cell.map((r) => r.wallMs);
    summary.push({
      fixture,
      bucket: cell[0].bucket,
      pages: cell[0].pages,
      condition,
      n: cell.length,
      p50: percentile(times, 50),
      p95: percentile(times, 95),
      p99: percentile(times, 99),
      min: Math.min(...times),
      max: Math.max(...times),
      detCounts: cell.map((r) => r.detectionCount),
      errors: cell.filter((r) => r.error).map((r) => r.error!),
    });
  }
  summary.sort(
    (a, b) =>
      (a.bucket === "small" ? 0 : a.bucket === "medium" ? 1 : 2) -
        (b.bucket === "small" ? 0 : b.bucket === "medium" ? 1 : 2) ||
      (a.fixture < b.fixture ? -1 : 1) ||
      (a.condition < b.condition ? -1 : 1),
  );
  return summary;
}

async function main() {
  const connectionString =
    process.env.DATABASE_URL || "postgresql://veil:veil_dev@localhost:5434/veil";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  console.log(`[spike] ${FIXTURES.length} fixtures × 2 conditions × ${RUNS_PER_CELL} runs = ${FIXTURES.length * 2 * RUNS_PER_CELL} invocations`);
  console.log(`[spike] corpus: ${FIXTURES.map((f) => f.label).join(", ")}\n`);

  const allResults: RunResult[] = [];
  for (const fixture of FIXTURES) {
    for (const condition of ["off", "on"] as const) {
      for (let i = 0; i < RUNS_PER_CELL; i++) {
        const r = await runOne(prisma, fixture, condition, i);
        allResults.push(r);
        console.log(
          `  [${fixture.label}/${condition}/${i + 1}] ${r.wallMs}ms  detections=${r.detectionCount}  source=${r.canonicalPdfSource}${r.error ? `  ERR=${r.error}` : ""}`,
        );
      }
    }
  }

  await prisma.$disconnect();

  const summary = summarise(allResults);
  const jsonPath = path.resolve("docs/phase-2-spike-raw.json");
  fs.writeFileSync(jsonPath, JSON.stringify({ fixtures: FIXTURES, results: allResults }, null, 2));
  console.log(`\n[spike] raw results: ${jsonPath}`);

  // Render findings doc.
  const lines: string[] = [];
  lines.push("# Phase 2 Spike Findings");
  lines.push("");
  lines.push("**Date:** 2026-04-19  ");
  lines.push(`**Corpus:** ${FIXTURES.length} DOCX fixtures (3 small, 3 medium, 1 large), ${RUNS_PER_CELL} runs per condition.  `);
  lines.push("**Conditions:**  ");
  lines.push("- `off` — Phase 1 baseline. DOCX extraction via mammoth, no DI call. PDFs still go through DI as today.  ");
  lines.push("- `on` — Phase 2 path. `PHASE2_SPIKE=1` routes extractText through DI against the canonical PDF for DOCX inputs.  ");
  lines.push("");
  lines.push("## Latency table (p50 / p95 / p99, ms)");
  lines.push("");
  lines.push("| Fixture | Pages | Condition | n | p50 | p95 | p99 | min | max |");
  lines.push("|---------|------:|-----------|--:|----:|----:|----:|----:|----:|");
  for (const s of summary) {
    lines.push(
      `| ${s.fixture} | ${s.pages} | ${s.condition} | ${s.n} | ${s.p50} | ${s.p95} | ${s.p99} | ${s.min} | ${s.max} |`,
    );
  }
  lines.push("");
  lines.push("## Detection count stability (per 5-run cell)");
  lines.push("");
  lines.push("| Fixture | Condition | Detection counts (5 runs) | Stable? |");
  lines.push("|---------|-----------|---------------------------|---------|");
  for (const s of summary) {
    const stable = new Set(s.detCounts).size === 1;
    lines.push(
      `| ${s.fixture} | ${s.condition} | ${s.detCounts.join(", ")} | ${stable ? "yes" : "**NO — drift**"} |`,
    );
  }
  lines.push("");
  lines.push("## Errors");
  const errSummary = summary.flatMap((s) => s.errors.map((e) => `- ${s.fixture}/${s.condition}: ${e}`));
  if (errSummary.length === 0) lines.push("None.");
  else lines.push(...errSummary);
  lines.push("");
  lines.push("## Decision criterion");
  lines.push("");
  const medium = summary.find((s) => s.bucket === "medium" && s.condition === "on");
  const mediumP95 = medium?.p95 ?? 0;
  lines.push(`Target: **p95 ≤ 8,000 ms on a medium (6-page) fixture under the \`on\` condition.**  `);
  lines.push(`Observed (medium-A/on): p95 = **${summary.find((s) => s.fixture === "medium-A" && s.condition === "on")?.p95 ?? "?"} ms**  `);
  lines.push(`Observed (medium-B/on): p95 = **${summary.find((s) => s.fixture === "medium-B" && s.condition === "on")?.p95 ?? "?"} ms**  `);
  lines.push(`Observed (medium-C/on): p95 = **${summary.find((s) => s.fixture === "medium-C" && s.condition === "on")?.p95 ?? "?"} ms**  `);
  const mediumsP95 = summary.filter((s) => s.bucket === "medium" && s.condition === "on").map((s) => s.p95);
  const worstMediumP95 = Math.max(...(mediumsP95.length ? mediumsP95 : [0]));
  lines.push("");
  if (worstMediumP95 <= 8_000) {
    lines.push(`**Recommendation: p95 ≤ 8s target met** (worst medium p95 = ${worstMediumP95} ms). Proceed with Phase 2 implementation.`);
  } else {
    lines.push(`**Recommendation: p95 ≤ 8s NOT met** (worst medium p95 = ${worstMediumP95} ms). Two options:`);
    lines.push(`  - (a) Accept the regression because detection quality justifies it. Requires per-format evaluation.`);
    lines.push(`  - (b) Revisit with a different approach (e.g. skip DI entirely for short DOCX, hybrid mammoth + DI on long).`);
    lines.push(`Discuss with the reviewer before proceeding to the implementation steps.`);
  }
  lines.push("");
  lines.push("## Cost of study");
  lines.push("");
  const onInvocations = FIXTURES.length * RUNS_PER_CELL;
  const totalPagesOn = FIXTURES.reduce((sum, f) => sum + f.pages * RUNS_PER_CELL, 0);
  lines.push(`- Total processDocument invocations: ${allResults.length} (${FIXTURES.length} fixtures × 2 conditions × ${RUNS_PER_CELL} runs).`);
  lines.push(`- Azure DI \`prebuilt-read\` calls: ${onInvocations} (condition \`on\` only — \`off\` DOCX skips DI). Pages processed: ~${totalPagesOn}.`);
  lines.push(`- Azure OpenAI GPT-4o calls: both conditions invoke the AI detection stage. Page batches of 3 → ~${Math.ceil(totalPagesOn / 3) * 2} total calls across both conditions.`);
  lines.push(`- Rough NZD estimate: **under NZD 5**. DI prebuilt-read is ~USD 0.0015/page, OpenAI GPT-4o is ~USD 0.015 per batch. Actual cost is dominated by the 23-page fixture × 5 runs = 115 DI pages.`);
  lines.push("");
  lines.push("## Caveats");
  lines.push("");
  lines.push("- The `PHASE2_SPIKE=1` branch lives in process.ts only for the duration of this spike and is reverted before PR merge. The committed Phase 2 change will hardcode canonical-PDF extraction without the env gate.");
  lines.push("- Medium fixtures are sourced from `test-fixtures/dummy-lgoima-pack/` which is **not checked into git** (local scratch). Findings are reproducible only on machines with the dummy pack present. Future Phase 2 tests rely on the committed `phase2-spike/` fixtures only.");
  lines.push("- All runs hit live Azure endpoints (DI + OpenAI). Repeatability of AI detection counts depends on OpenAI's determinism at temperature=0; observed drift is noted in the table above.");
  lines.push("- LibreOffice subprocess is included in the `on` path for DOCX (canonical PDF build). `off` path for DOCX skips LibreOffice entirely today.");

  const findingsPath = path.resolve("docs/phase-2-spike-findings.md");
  fs.writeFileSync(findingsPath, lines.join("\n") + "\n");
  console.log(`[spike] findings: ${findingsPath}`);
}

main().catch((err) => {
  console.error("[spike] fatal:", err);
  process.exit(1);
});
