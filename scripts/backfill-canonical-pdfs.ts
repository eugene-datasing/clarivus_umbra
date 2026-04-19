/**
 * Backfill canonical PDFs for documents that predate Phase 1.
 *
 * Finds Document rows where canonicalPdfPath IS NULL AND status is one of
 * the three terminal-success states (ready / reviewed / signed-off), loads
 * each original from storage, invokes buildCanonicalPdf, persists the
 * canonical PDF, and writes the five canonical_pdf_* columns. Runs with a
 * hard default of 2 concurrent workers to prevent LibreOffice CPU
 * saturation and Azure DI quota spikes — do NOT raise without explicit
 * capacity review.
 *
 * Excluded states:
 *   - processing  → live pipeline may be writing the row; race hazard.
 *   - in-review   → reviewer is actively triaging; not a terminal success.
 *   - queued      → not yet processed; canonical is built during first
 *                   processDocument, not here.
 *   - error       → failed upstream; do not force-canonicalise without
 *                   admin review via POST /api/documents/[docId]/rebuild-canonical.
 *
 * Usage (requires dotenv for DB + Azure credentials):
 *   npx tsx -r dotenv/config scripts/backfill-canonical-pdfs.ts --dry-run
 *   npx tsx -r dotenv/config scripts/backfill-canonical-pdfs.ts
 *   npx tsx -r dotenv/config scripts/backfill-canonical-pdfs.ts --max-concurrent=4
 *
 * Read-only modes:
 *   --dry-run   Enumerate candidates and print sample IDs. No writes.
 *   --help      Print usage and exit.
 *
 * Safety defaults:
 *   - --max-concurrent defaults to 2 (LibreOffice + DI throttle).
 *   - Oldest documents first (ORDER BY createdAt ASC) so progress is
 *     predictable across multi-run sessions.
 *   - On any single-document buildCanonicalPdf failure the batch
 *     continues; the failure is logged and counted in the summary.
 */
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildCanonicalPdf, isCanonicalPdfSupported } from "../lib/pipeline/canonical-pdf";
import { getStorage } from "../lib/storage";

const DEFAULT_MAX_CONCURRENT = 2;
const TERMINAL_SUCCESS_STATUSES = ["ready", "reviewed", "signed-off"] as const;

interface Options {
  dryRun: boolean;
  maxConcurrent: number;
  help: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { dryRun: false, maxConcurrent: DEFAULT_MAX_CONCURRENT, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--max-concurrent") {
      const n = parseInt(argv[++i] ?? "", 10);
      if (!Number.isFinite(n) || n < 1) throw new Error(`--max-concurrent requires a positive integer (got "${argv[i]}")`);
      opts.maxConcurrent = n;
    } else if (a.startsWith("--max-concurrent=")) {
      const n = parseInt(a.slice("--max-concurrent=".length), 10);
      if (!Number.isFinite(n) || n < 1) throw new Error(`--max-concurrent= requires a positive integer (got "${a}")`);
      opts.maxConcurrent = n;
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return opts;
}

function printHelp(): void {
  console.log(`
Usage: npx tsx -r dotenv/config scripts/backfill-canonical-pdfs.ts [options]

Populate canonical PDF columns for Document rows that predate Phase 1.

Options:
  --dry-run                 Enumerate candidates and print sample IDs; no writes.
  --max-concurrent N        Worker concurrency. Default: ${DEFAULT_MAX_CONCURRENT}.
                            Default is deliberately low to prevent LibreOffice
                            CPU saturation and Azure DI quota spikes. Do not
                            raise without explicit capacity review.
  --help, -h                Print this help and exit.

Query:
  where canonicalPdfPath IS NULL AND status IN (${TERMINAL_SUCCESS_STATUSES.map((s) => `'${s}'`).join(", ")})
  ORDER BY createdAt ASC

Exit codes:
  0   All attempted documents built successfully (or dry-run completed).
  1   One or more documents failed; see per-doc logs and the summary line.
  2   Invalid arguments.
`);
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  async function consumer() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, consumer));
}

interface Metrics {
  attempted: number;
  built: number;
  failed: number;
  skippedUnsupported: number;
}

async function main(): Promise<number> {
  let opts: Options;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    printHelp();
    return 2;
  }
  if (opts.help) {
    printHelp();
    return 0;
  }

  const connectionString =
    process.env.DATABASE_URL || "postgresql://veil:veil_dev@localhost:5434/veil";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  const candidates = await prisma.document.findMany({
    where: {
      canonicalPdfPath: null,
      status: { in: [...TERMINAL_SUCCESS_STATUSES] },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      caseId: true,
      name: true,
      fileType: true,
      originalPath: true,
      status: true,
      createdAt: true,
    },
  });

  console.log(`[backfill] ${opts.dryRun ? "DRY RUN — " : ""}found ${candidates.length} documents with canonicalPdfPath IS NULL and status in ${JSON.stringify(TERMINAL_SUCCESS_STATUSES)}`);
  console.log(`[backfill] ordered: oldest createdAt first`);
  console.log(`[backfill] max-concurrent: ${opts.maxConcurrent}`);

  if (opts.dryRun) {
    const sample = candidates.slice(0, 10);
    console.log(`[backfill] sample (up to 10):`);
    for (const c of sample) {
      console.log(`  ${c.id}  fileType=${c.fileType}  status=${c.status}  createdAt=${c.createdAt.toISOString()}  name=${c.name}`);
    }
    await prisma.$disconnect();
    return 0;
  }

  if (candidates.length === 0) {
    console.log(`[backfill] nothing to do`);
    await prisma.$disconnect();
    return 0;
  }

  const storage = getStorage();
  const metrics: Metrics = { attempted: 0, built: 0, failed: 0, skippedUnsupported: 0 };
  const N = candidates.length;

  await runPool(candidates, opts.maxConcurrent, async (doc, idx) => {
    const tag = `[${idx + 1}/${N}] ${doc.id}`;
    metrics.attempted++;

    if (!isCanonicalPdfSupported(doc.fileType)) {
      metrics.skippedUnsupported++;
      console.log(`${tag}: SKIPPED unsupported fileType=${doc.fileType}`);
      return;
    }
    if (!doc.originalPath) {
      metrics.failed++;
      console.log(`${tag}: FAILED no originalPath`);
      return;
    }

    try {
      const originalBuffer = await storage.download(doc.originalPath);
      const result = await buildCanonicalPdf(
        { id: doc.id, fileType: doc.fileType },
        originalBuffer,
      );
      const canonicalKey = `${doc.caseId}/${doc.id}/canonical.pdf`;
      await storage.upload(canonicalKey, result.pdfBuffer, "application/pdf");
      await prisma.document.update({
        where: { id: doc.id },
        data: {
          canonicalPdfPath: canonicalKey,
          canonicalPdfSha256: result.sha256,
          canonicalPdfPageCount: result.pageCount,
          canonicalPdfBuildMs: result.durationMs,
          canonicalPdfSource: result.source,
        },
      });
      metrics.built++;
      console.log(`${tag}: built (source=${result.source}, pages=${result.pageCount}, sha256=${result.sha256.slice(0, 16)}…, ${result.durationMs}ms)`);
    } catch (err) {
      metrics.failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`${tag}: FAILED ${msg}`);
    }
  });

  console.log(`\n[backfill] summary: attempted=${metrics.attempted} built=${metrics.built} failed=${metrics.failed} skipped-unsupported=${metrics.skippedUnsupported}`);
  await prisma.$disconnect();
  return metrics.failed === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("[backfill] fatal:", err);
    process.exit(1);
  });
