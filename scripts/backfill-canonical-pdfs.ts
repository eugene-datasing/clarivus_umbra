/**
 * Backfill canonical PDFs for documents that predate Phase 1, and probe
 * text-selectability for any canonical PDF whose flag is unset.
 *
 * Two-phase operation:
 *
 * Phase A — canonicalPdfPath. Finds Document rows where canonicalPdfPath
 * IS NULL AND status is one of the three terminal-success states (ready
 * / reviewed / signed-off), loads each original from storage, invokes
 * buildCanonicalPdf, persists the canonical (PDF inputs reuse
 * originalPath; non-PDFs upload a fresh canonical.pdf blob — see Phase 3
 * prerequisites PR for the storage-decision rationale), and writes the
 * canonical_pdf_* columns.
 *
 * Phase B — canonicalPdfTextSelectable. Finds rows where canonicalPdfPath
 * IS NOT NULL AND canonicalPdfTextSelectable IS NULL (covers both legacy
 * rows freshly built in Phase A and pre-existing rows that have a
 * canonical but were processed before the probe column existed). Loads
 * the canonical PDF buffer from storage and runs isTextSelectable() to
 * populate the column. Phase 3's UI uses this flag to route text-less
 * scanned canonicals to the HTML fallback view.
 *
 * Excluded statuses (Phase A only):
 *   - processing  → live pipeline may be writing the row; race hazard.
 *   - in-review   → reviewer is actively triaging; not a terminal success.
 *   - queued      → not yet processed; canonical is built during first
 *                   processDocument, not here.
 *   - error       → failed upstream; do not force-canonicalise without
 *                   admin review via POST /api/documents/[docId]/rebuild-canonical.
 *
 * Phase B has no status filter — any row with a canonical and a NULL flag
 * is in scope. The probe is read-only against storage and cheap (typically
 * a few hundred ms per document).
 *
 * Usage (requires dotenv for DB + Azure credentials):
 *   npx tsx -r dotenv/config scripts/backfill-canonical-pdfs.ts --dry-run
 *   npx tsx -r dotenv/config scripts/backfill-canonical-pdfs.ts
 *   npx tsx -r dotenv/config scripts/backfill-canonical-pdfs.ts --max-concurrent=4
 *
 * Read-only modes:
 *   --dry-run   Enumerate candidates for both phases. No writes.
 *   --help      Print usage and exit.
 *
 * Safety defaults:
 *   - --max-concurrent defaults to 2 (LibreOffice + DI throttle for
 *     Phase A; pdf.js text-content extraction for Phase B is light).
 *   - Oldest documents first (ORDER BY createdAt ASC) so progress is
 *     predictable across multi-run sessions.
 *   - On any single-document failure the batch continues; the failure
 *     is logged and counted in the per-phase summary.
 */
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildCanonicalPdf, isCanonicalPdfSupported, isTextSelectable } from "../lib/pipeline/canonical-pdf";
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

interface BuildMetrics {
  attempted: number;
  built: number;
  reused: number;
  failed: number;
  skippedUnsupported: number;
}

interface ProbeMetrics {
  attempted: number;
  selectable: number;
  notSelectable: number;
  failed: number;
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

  // ─── Phase A: build / assign canonicalPdfPath for NULL rows ──────────
  const buildCandidates = await prisma.document.findMany({
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

  // ─── Phase B: probe text-selectability for SET-but-unprobed rows ─────
  const probeCandidates = await prisma.document.findMany({
    where: {
      canonicalPdfPath: { not: null },
      canonicalPdfTextSelectable: null,
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      caseId: true,
      name: true,
      fileType: true,
      canonicalPdfPath: true,
      createdAt: true,
    },
  });

  console.log(`[backfill] ${opts.dryRun ? "DRY RUN — " : ""}phase A: ${buildCandidates.length} documents with canonicalPdfPath IS NULL and status in ${JSON.stringify(TERMINAL_SUCCESS_STATUSES)}`);
  console.log(`[backfill] ${opts.dryRun ? "DRY RUN — " : ""}phase B: ${probeCandidates.length} documents with canonicalPdfPath SET and canonicalPdfTextSelectable IS NULL`);
  console.log(`[backfill] ordered: oldest createdAt first`);
  console.log(`[backfill] max-concurrent: ${opts.maxConcurrent}`);

  if (opts.dryRun) {
    if (buildCandidates.length > 0) {
      console.log(`[backfill] phase A sample (up to 10):`);
      for (const c of buildCandidates.slice(0, 10)) {
        console.log(`  ${c.id}  fileType=${c.fileType}  status=${c.status}  createdAt=${c.createdAt.toISOString()}  name=${c.name}`);
      }
    }
    if (probeCandidates.length > 0) {
      console.log(`[backfill] phase B sample (up to 10):`);
      for (const c of probeCandidates.slice(0, 10)) {
        console.log(`  ${c.id}  fileType=${c.fileType}  canonicalPdfPath=${c.canonicalPdfPath}  name=${c.name}`);
      }
    }
    await prisma.$disconnect();
    return 0;
  }

  const storage = getStorage();
  const buildMetrics: BuildMetrics = { attempted: 0, built: 0, reused: 0, failed: 0, skippedUnsupported: 0 };

  // ─── Phase A: build canonicals ───────────────────────────────────────
  if (buildCandidates.length > 0) {
    const N = buildCandidates.length;
    console.log(`\n[backfill] phase A — building canonicals (${N} candidates)`);
    await runPool(buildCandidates, opts.maxConcurrent, async (doc, idx) => {
      const tag = `[A ${idx + 1}/${N}] ${doc.id}`;
      buildMetrics.attempted++;

      if (!isCanonicalPdfSupported(doc.fileType)) {
        buildMetrics.skippedUnsupported++;
        console.log(`${tag}: SKIPPED unsupported fileType=${doc.fileType}`);
        return;
      }
      if (!doc.originalPath) {
        buildMetrics.failed++;
        console.log(`${tag}: FAILED no originalPath`);
        return;
      }

      try {
        const originalBuffer = await storage.download(doc.originalPath);
        const result = await buildCanonicalPdf(
          { id: doc.id, fileType: doc.fileType },
          originalBuffer,
        );
        // PDF-as-own-canonical: reuse originalPath rather than upload a
        // duplicate blob. Matches the process.ts decision (Phase 3 prereq).
        let canonicalKey: string;
        let reused = false;
        if (result.source === "original" && doc.originalPath) {
          canonicalKey = doc.originalPath;
          reused = true;
        } else {
          canonicalKey = `${doc.caseId}/${doc.id}/canonical.pdf`;
          await storage.upload(canonicalKey, result.pdfBuffer, "application/pdf");
        }
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
        if (reused) buildMetrics.reused++; else buildMetrics.built++;
        console.log(`${tag}: ${reused ? "reused-original" : "built"} (source=${result.source}, pages=${result.pageCount}, sha256=${result.sha256.slice(0, 16)}…, ${result.durationMs}ms)`);
      } catch (err) {
        buildMetrics.failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`${tag}: FAILED ${msg}`);
      }
    });
    console.log(`[backfill] phase A summary: attempted=${buildMetrics.attempted} built=${buildMetrics.built} reused-original=${buildMetrics.reused} failed=${buildMetrics.failed} skipped-unsupported=${buildMetrics.skippedUnsupported}`);
  } else {
    console.log(`[backfill] phase A — nothing to do`);
  }

  // ─── Phase B: probe text-selectability ──────────────────────────────
  // Re-query so that any rows just built in Phase A are included in the
  // Phase B candidate set without us having to track them in-memory.
  const probeCandidatesFinal = await prisma.document.findMany({
    where: {
      canonicalPdfPath: { not: null },
      canonicalPdfTextSelectable: null,
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      caseId: true,
      name: true,
      fileType: true,
      canonicalPdfPath: true,
    },
  });

  const probeMetrics: ProbeMetrics = { attempted: 0, selectable: 0, notSelectable: 0, failed: 0 };

  if (probeCandidatesFinal.length > 0) {
    const N = probeCandidatesFinal.length;
    console.log(`\n[backfill] phase B — probing text-selectability (${N} candidates after phase A)`);
    await runPool(probeCandidatesFinal, opts.maxConcurrent, async (doc, idx) => {
      const tag = `[B ${idx + 1}/${N}] ${doc.id}`;
      probeMetrics.attempted++;
      try {
        if (!doc.canonicalPdfPath) {
          probeMetrics.failed++;
          console.log(`${tag}: FAILED canonicalPdfPath unexpectedly null`);
          return;
        }
        const buf = await storage.download(doc.canonicalPdfPath);
        const selectable = await isTextSelectable(buf);
        await prisma.document.update({
          where: { id: doc.id },
          data: { canonicalPdfTextSelectable: selectable },
        });
        if (selectable) probeMetrics.selectable++; else probeMetrics.notSelectable++;
        console.log(`${tag}: probed selectable=${selectable}  fileType=${doc.fileType}  name=${doc.name}`);
      } catch (err) {
        probeMetrics.failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`${tag}: FAILED ${msg}`);
      }
    });
    console.log(`[backfill] phase B summary: attempted=${probeMetrics.attempted} selectable=${probeMetrics.selectable} not-selectable=${probeMetrics.notSelectable} failed=${probeMetrics.failed}`);
  } else {
    console.log(`[backfill] phase B — nothing to do`);
  }

  console.log(`\n[backfill] overall: phase-A built=${buildMetrics.built} reused=${buildMetrics.reused} failed=${buildMetrics.failed}; phase-B selectable=${probeMetrics.selectable} not-selectable=${probeMetrics.notSelectable} failed=${probeMetrics.failed}`);
  await prisma.$disconnect();
  return buildMetrics.failed + probeMetrics.failed === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("[backfill] fatal:", err);
    process.exit(1);
  });
