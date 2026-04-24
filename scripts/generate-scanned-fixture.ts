/**
 * Generate an image-only PDF fixture for Phase 3 Option C (viewer rework,
 * April 2026) and seed it into the dev DB as a real document attached to
 * an existing case. The resulting `Document` row has
 * `canonicalPdfTextSelectable = false`, which is what the Option C UI
 * routing conditional (scanned canonical → HTML fallback view) branches
 * on. The dev DB has no naturally-occurring text-less canonical before
 * this script runs.
 *
 * Fixture-management decision: commit this generator, not the binary
 * output. The rasterised PDF lives under `uploads/` (gitignored) and the
 * DB row references it. Committing a generator rather than a binary
 * matches `scripts/generate-bench-fixtures.ts` and keeps the repo small
 * and reproducible.
 *
 * Pipeline:
 *   1. Read a text-selectable source canonical PDF from storage.
 *   2. Rasterise it page-by-page at 150 DPI via PyMuPDF (python3 -c),
 *      producing an image-only PDF — every page becomes a single
 *      embedded PNG inside a PDF page of the same dimensions, with NO
 *      text layer.
 *   3. Create a new Document row in the target case.
 *   4. Upload the rasterised buffer to storage at `{caseId}/{docId}/original.pdf`.
 *   5. Invoke `processDocument(docId)` — same entrypoint the upload API
 *      hands off to — which runs the full pipeline: canonical build,
 *      isTextSelectable probe, DI extract, detection, redaction-prep.
 *      For a PDF input, buildCanonicalPdf returns source="original"
 *      and the storage-decision reuses `originalPath` as
 *      `canonicalPdfPath` (no duplicate blob). The
 *      `isTextSelectable` probe should return false against the
 *      rasterised buffer.
 *   6. Read back the Document row and print the verification query.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/generate-scanned-fixture.ts
 *   npx tsx -r dotenv/config scripts/generate-scanned-fixture.ts --dry-run
 *   npx tsx -r dotenv/config scripts/generate-scanned-fixture.ts \
 *     --source uploads/req-001/cmo5enehy00002z6cicgod7np/canonical.pdf \
 *     --case req-002 \
 *     --name "Scanned-Simulation-For-Option-C.pdf"
 *
 * Safety:
 *   --dry-run  Rasterise only; print byte counts. No DB, no storage, no pipeline.
 *   --help     Print usage and exit.
 *
 * The script is idempotent in the sense that re-running creates a NEW
 * Document row (with a new CUID) rather than overwriting. If the target
 * case already contains a fixture of the given name the script still
 * proceeds; de-duplicate manually if that matters.
 */
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getStorage } from "../lib/storage";
import { processDocument } from "../lib/pipeline/process";

const DEFAULTS = {
  source: "uploads/req-001/cmo5enehy00002z6cicgod7np/canonical.pdf",
  caseId: "req-002",
  name: "Scanned-Simulation-For-Option-C.pdf",
  dpi: 150,
};

interface Options {
  source: string;
  caseId: string;
  name: string;
  dpi: number;
  dryRun: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    source: DEFAULTS.source,
    caseId: DEFAULTS.caseId,
    name: DEFAULTS.name,
    dpi: DEFAULTS.dpi,
    dryRun: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--source") opts.source = argv[++i] ?? "";
    else if (a.startsWith("--source=")) opts.source = a.slice("--source=".length);
    else if (a === "--case") opts.caseId = argv[++i] ?? "";
    else if (a.startsWith("--case=")) opts.caseId = a.slice("--case=".length);
    else if (a === "--name") opts.name = argv[++i] ?? "";
    else if (a.startsWith("--name=")) opts.name = a.slice("--name=".length);
    else if (a === "--dpi") {
      const n = parseInt(argv[++i] ?? "", 10);
      if (!Number.isFinite(n) || n < 72) throw new Error(`--dpi requires an integer >= 72 (got "${argv[i]}")`);
      opts.dpi = n;
    } else if (a.startsWith("--dpi=")) {
      const n = parseInt(a.slice("--dpi=".length), 10);
      if (!Number.isFinite(n) || n < 72) throw new Error(`--dpi= requires an integer >= 72 (got "${a}")`);
      opts.dpi = n;
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return opts;
}

function printHelp(): void {
  console.log(`
Usage: npx tsx -r dotenv/config scripts/generate-scanned-fixture.ts [options]

Produce an image-only PDF from an existing text-selectable canonical and
seed it into the dev DB so Phase 3's Option C routing (canonicalPdfTextSelectable=false
→ HTML fallback view) can be validated in the UI.

Options:
  --source PATH   Filesystem path to a text-selectable source PDF.
                  Default: ${DEFAULTS.source}
  --case ID       Case id to attach the new Document to.
                  Default: ${DEFAULTS.caseId}
  --name NAME     Filename for the new Document row.
                  Default: ${DEFAULTS.name}
  --dpi N         Raster DPI (higher = larger file, sharper image).
                  Default: ${DEFAULTS.dpi}
  --dry-run       Rasterise and report sizes without touching DB or storage.
  --help, -h      Print this help and exit.

Exit codes:
  0   Fixture created (or dry-run completed) and flag verified as false.
  1   Pipeline succeeded but flag is not false. Investigate probe wiring.
  2   Invalid arguments or source missing.
  3   Upstream pipeline / DB error.
`);
}

/**
 * Rasterise a PDF at a given DPI and rebuild an image-only PDF.
 *
 * Each source page is rendered to a raster pixmap at `dpi` and inserted
 * into a new blank page of the same dimensions as the source. No text
 * is drawn; the resulting PDF has an empty text layer on every page,
 * which is exactly what `isTextSelectable` should classify as false.
 */
function rasteriseToImageOnlyPdf(sourcePath: string, dpi: number): Buffer {
  const tmp = mkdtempSync(join(tmpdir(), "option-c-fixture-"));
  const outPath = join(tmp, "scanned.pdf");
  try {
    execFileSync(
      "python3",
      [
        "-c",
        `
import sys, fitz
src_path, out_path, dpi_arg = sys.argv[1], sys.argv[2], int(sys.argv[3])
src = fitz.open(src_path)
dst = fitz.open()
for p in src:
    pix = p.get_pixmap(dpi=dpi_arg)
    new_page = dst.new_page(width=p.rect.width, height=p.rect.height)
    new_page.insert_image(p.rect, pixmap=pix)
dst.save(out_path)
`.trim(),
        sourcePath,
        outPath,
        String(dpi),
      ],
      { stdio: "pipe" },
    );
    return readFileSync(outPath);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
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

  // --- 1. Rasterise source --------------------------------------------
  let sourceBuf: Buffer;
  try {
    sourceBuf = readFileSync(opts.source);
  } catch (err) {
    console.error(`Source not readable at ${opts.source}: ${err instanceof Error ? err.message : err}`);
    return 2;
  }
  console.log(`[1/5] Rasterising ${opts.source} (${sourceBuf.length} bytes) at ${opts.dpi} DPI…`);

  let imageOnlyBuf: Buffer;
  try {
    imageOnlyBuf = rasteriseToImageOnlyPdf(opts.source, opts.dpi);
  } catch (err) {
    console.error(`PyMuPDF rasterise failed: ${err instanceof Error ? err.message : err}`);
    console.error("Ensure python3 is on PATH and PyMuPDF is installed (pip install pymupdf).");
    return 3;
  }
  console.log(`[1/5] ✓ Produced image-only PDF (${imageOnlyBuf.length} bytes, ${(imageOnlyBuf.length / 1024 / 1024).toFixed(2)} MB)`);

  if (opts.dryRun) {
    // Write to a predictable tmp path so the caller can inspect it
    const dryOut = join(tmpdir(), "scanned-simulation-dry-run.pdf");
    writeFileSync(dryOut, imageOnlyBuf);
    console.log(`[dry-run] Wrote fixture to ${dryOut}. No DB/storage changes.`);
    return 0;
  }

  // --- 2. Create Document row -----------------------------------------
  const connectionString =
    process.env.DATABASE_URL || "postgresql://veil:veil_dev@localhost:5434/veil";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const targetCase = await prisma.case.findUnique({
      where: { id: opts.caseId },
      select: { id: true, reference: true, description: true, status: true },
    });
    if (!targetCase) {
      console.error(`Case not found: ${opts.caseId}`);
      await prisma.$disconnect();
      return 2;
    }
    console.log(`[2/5] Target case: ${targetCase.id} (${targetCase.reference}, status=${targetCase.status})`);

    const doc = await prisma.document.create({
      data: {
        caseId: opts.caseId,
        name: opts.name,
        fileType: "PDF",
        mimeType: "application/pdf",
        sizeBytes: imageOnlyBuf.length,
        status: "queued",
      },
    });
    console.log(`[2/5] ✓ Created Document ${doc.id}`);

    // --- 3. Upload to storage -----------------------------------------
    const storage = getStorage();
    const storageKey = `${opts.caseId}/${doc.id}/original.pdf`;
    await storage.upload(storageKey, imageOnlyBuf, "application/pdf");
    await prisma.document.update({
      where: { id: doc.id },
      data: { originalPath: storageKey },
    });
    console.log(`[3/5] ✓ Uploaded to storage (${storageKey})`);

    // --- 4. Run full processing pipeline ------------------------------
    console.log(`[4/5] Running processDocument(${doc.id}) — canonical build + probe + DI extract + detect…`);
    await processDocument(doc.id);
    console.log(`[4/5] ✓ Pipeline complete`);

    // --- 5. Verify flag state -----------------------------------------
    const final = await prisma.document.findUnique({
      where: { id: doc.id },
      select: {
        id: true,
        name: true,
        caseId: true,
        status: true,
        fileType: true,
        canonicalPdfPath: true,
        canonicalPdfTextSelectable: true,
        canonicalPdfSource: true,
        canonicalPdfPageCount: true,
        processingError: true,
      },
    });

    console.log(`\n[5/5] Verification query result:`);
    console.log(JSON.stringify(final, null, 2));

    await prisma.$disconnect();

    if (!final) {
      console.error("\nDocument disappeared after processing — unexpected.");
      return 3;
    }
    if (final.canonicalPdfPath === null) {
      console.error(`\nFAIL: canonicalPdfPath is null. Pipeline error: ${final.processingError ?? "none"}`);
      return 1;
    }
    if (final.canonicalPdfTextSelectable !== false) {
      console.error(
        `\nFAIL: canonicalPdfTextSelectable = ${final.canonicalPdfTextSelectable} (expected false). ` +
          `The rasterised fixture should have no text layer; investigate the probe wiring.`,
      );
      return 1;
    }
    console.log(
      `\n✓ SUCCESS: document ${final.id} attached to case ${final.caseId} with ` +
        `canonicalPdfTextSelectable=false. Option C routing can now be exercised in the UI.`,
    );
    return 0;
  } catch (err) {
    console.error(`Pipeline error: ${err instanceof Error ? err.stack ?? err.message : err}`);
    await prisma.$disconnect();
    return 3;
  }
}

main().then((code) => process.exit(code));
