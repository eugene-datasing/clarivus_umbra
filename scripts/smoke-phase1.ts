/**
 * Phase 1 smoke test — end-to-end verification of the canonical PDF flow.
 *
 * For each fixture format (PDF / DOCX / EML):
 *   1. Copy fixture to storage
 *   2. Create a fresh Document row pointing at it
 *   3. Call processDocument(docId) — runs the full pipeline, including the
 *      Step-6 canonical PDF build + persist
 *   4. Re-read the Document; assert all five canonical_pdf_* columns populated
 *   5. Download the canonical PDF from storage; verify header starts with %PDF-
 *   6. Compute SHA-256 of the downloaded bytes; confirm match against
 *      canonicalPdfSha256 column
 *   7. Clean up the Document row
 *
 * Prereqs:
 *   - Docker Postgres running on localhost:5434 (docker compose up -d)
 *   - Seed data loaded (npx prisma db seed) so case req-001 exists
 *   - .env with AZURE_DI_* and AZURE_OPENAI_* set (extractText + AI detection
 *     run as part of processDocument)
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/smoke-phase1.ts
 *
 * The -r dotenv/config flag preloads .env BEFORE any other imports, so
 * lib/db/prisma and Azure SDK clients see DATABASE_URL / AZURE_* vars when
 * their modules initialise. Without it the script crashes with "User was
 * denied access on the database (not available)" because ES import ordering
 * evaluates prisma client setup before top-level dotenv.config() runs.
 *
 * Exit 0 if all three formats pass; exit 1 otherwise.
 *
 * This script incurs Azure DI (PDFs only) and Azure OpenAI costs on the order
 * of 5–10 small requests total. Safe to run against dev; DO NOT run against
 * production without scrubbing.
 */
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { processDocument } from "../lib/pipeline/process";
import { getStorage } from "../lib/storage";

interface Fixture {
  label: string;
  fixturePath: string;
  fileType: string;
  mimeType: string;
  expectedSource: "original" | "libreoffice" | "email-template";
}

const FIXTURES: Fixture[] = [
  {
    label: "pdf",
    fixturePath: "test-fixtures/dummy-lgoima-pack/01_Planning_and_Resource_Consent/07_formal_report.pdf",
    fileType: "PDF",
    mimeType: "application/pdf",
    expectedSource: "original",
  },
  {
    label: "docx",
    fixturePath: "test-fixtures/dummy-lgoima-pack/01_Planning_and_Resource_Consent/04_main_case_file_long.docx",
    fileType: "DOCX",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    expectedSource: "libreoffice",
  },
  {
    label: "eml",
    fixturePath: "test-fixtures/dummy-lgoima-pack/01_Planning_and_Resource_Consent/01_internal_working_email.eml",
    fileType: "EML",
    mimeType: "message/rfc822",
    expectedSource: "email-template",
  },
];

const CASE_ID = "req-001";

interface Result {
  label: string;
  passed: boolean;
  checks: string[];
  fails: string[];
}

async function runOne(
  prisma: PrismaClient,
  fixture: Fixture,
): Promise<Result> {
  const checks: string[] = [];
  const fails: string[] = [];
  const absolutePath = path.resolve(fixture.fixturePath);

  if (!fs.existsSync(absolutePath)) {
    return {
      label: fixture.label,
      passed: false,
      checks,
      fails: [`fixture missing at ${absolutePath}`],
    };
  }

  const buffer = fs.readFileSync(absolutePath);
  const ext = path.extname(fixture.fixturePath).toLowerCase();

  const doc = await prisma.document.create({
    data: {
      caseId: CASE_ID,
      name: `smoke-${fixture.label}-${Date.now()}${ext}`,
      fileType: fixture.fileType,
      mimeType: fixture.mimeType,
      sizeBytes: buffer.length,
      status: "queued",
    },
  });

  const storage = getStorage();
  const originalKey = `${CASE_ID}/${doc.id}/original${ext}`;
  await storage.upload(originalKey, buffer, fixture.mimeType);
  await prisma.document.update({
    where: { id: doc.id },
    data: { originalPath: originalKey },
  });

  console.log(`  [${fixture.label}] Document ${doc.id} created, running pipeline…`);
  const start = Date.now();
  try {
    await processDocument(doc.id);
  } catch (err) {
    fails.push(
      `processDocument threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    await safeDelete(prisma, doc.id);
    return { label: fixture.label, passed: false, checks, fails };
  }
  const elapsed = Date.now() - start;
  checks.push(`processDocument completed in ${(elapsed / 1000).toFixed(1)}s`);

  const updated = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });

  if (updated.canonicalPdfPath) checks.push(`canonicalPdfPath=${updated.canonicalPdfPath}`);
  else fails.push("canonicalPdfPath is null");

  if (updated.canonicalPdfSha256) {
    checks.push(`canonicalPdfSha256=${updated.canonicalPdfSha256.slice(0, 16)}…`);
  } else {
    fails.push("canonicalPdfSha256 is null");
  }

  if (typeof updated.canonicalPdfPageCount === "number") {
    checks.push(`canonicalPdfPageCount=${updated.canonicalPdfPageCount}`);
  } else {
    fails.push("canonicalPdfPageCount is null");
  }

  if (updated.canonicalPdfSource) {
    checks.push(`canonicalPdfSource=${updated.canonicalPdfSource}`);
  } else {
    fails.push("canonicalPdfSource is null");
  }

  if (updated.canonicalPdfSource !== fixture.expectedSource) {
    fails.push(
      `source mismatch: expected "${fixture.expectedSource}", got "${updated.canonicalPdfSource}"`,
    );
  } else {
    checks.push(`source matches expected "${fixture.expectedSource}"`);
  }

  if (updated.canonicalPdfPath) {
    try {
      const pdfBuf = await storage.download(updated.canonicalPdfPath);
      const header = pdfBuf.subarray(0, 5).toString("utf-8");
      if (header === "%PDF-") {
        checks.push(`canonical PDF header valid (${header})`);
      } else {
        fails.push(`canonical PDF has invalid header "${header}"`);
      }
      const actualHash = createHash("sha256").update(pdfBuf).digest("hex");
      if (actualHash === updated.canonicalPdfSha256) {
        checks.push(`sha256 of stored PDF matches DB column`);
      } else {
        fails.push(
          `sha256 mismatch: DB=${updated.canonicalPdfSha256?.slice(0, 16)}, actual=${actualHash.slice(0, 16)}`,
        );
      }
    } catch (err) {
      fails.push(
        `failed to download canonical PDF: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  await safeDelete(prisma, doc.id);
  return { label: fixture.label, passed: fails.length === 0, checks, fails };
}

async function safeDelete(prisma: PrismaClient, docId: string): Promise<void> {
  try {
    // Remove dependents in the right order — Detection, DocumentPage, etc.
    await prisma.detection.deleteMany({ where: { documentId: docId } });
    await prisma.documentPage.deleteMany({ where: { documentId: docId } });
    await prisma.document.delete({ where: { id: docId } });
  } catch (err) {
    console.warn(
      `  [cleanup] best-effort delete failed for ${docId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function main() {
  const connectionString =
    process.env.DATABASE_URL || "postgresql://veil:veil_dev@localhost:5434/veil";
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  console.log("=== Phase 1 smoke test ===");
  console.log(`Case: ${CASE_ID}`);
  console.log(`Fixtures: ${FIXTURES.length}\n`);

  const results: Result[] = [];
  for (const fixture of FIXTURES) {
    const r = await runOne(prisma, fixture);
    results.push(r);
    const tag = r.passed ? "PASS" : "FAIL";
    console.log(`\n${tag} — ${fixture.label}`);
    for (const c of r.checks) console.log(`    ✓ ${c}`);
    for (const f of r.fails) console.log(`    ✗ ${f}`);
  }

  await prisma.$disconnect();

  console.log("\n=== Summary ===");
  for (const r of results) {
    console.log(`  ${r.passed ? "PASS" : "FAIL"}  ${r.label}`);
  }
  const allPassed = results.every((r) => r.passed);
  console.log(`\n${allPassed ? "ALL PASSED" : "FAILURES PRESENT"}`);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("Smoke test harness crashed:", err);
  process.exit(1);
});
