/**
 * Phase 1 canonical PDF integration test — real pipeline, real DB,
 * real Azure DI + OpenAI.
 *
 * Gated behind RUN_INTEGRATION_TESTS=1 so the default `npm run test`
 * run does NOT invoke Azure services. Run locally with:
 *
 *   npm run test:integration:canonical
 *
 * which sets RUN_INTEGRATION_TESTS=1 and preloads .env for DATABASE_URL
 * + AZURE_DI_* + AZURE_OPENAI_* via NODE_OPTIONS="--env-file=.env".
 *
 * Prereqs:
 *   - Docker Postgres up on localhost:5434
 *   - Seed case req-001 present (npx prisma db seed)
 *   - LibreOffice on PATH (symlink on macOS: see Implementation log entry)
 *
 * The test runs each of { pdf, docx, eml } fixtures through
 * processDocument and asserts the canonical_pdf_* columns + the stored
 * canonical PDF bytes are internally consistent.
 */
import { config as loadDotenv } from "dotenv";
loadDotenv();

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const RUN = process.env.RUN_INTEGRATION_TESTS === "1";

const FIXTURES = [
  {
    label: "pdf",
    fixturePath: "test-fixtures/dummy-lgoima-pack/01_Planning_and_Resource_Consent/07_formal_report.pdf",
    fileType: "PDF",
    mimeType: "application/pdf",
    expectedSource: "original" as const,
  },
  {
    label: "docx",
    fixturePath: "test-fixtures/dummy-lgoima-pack/01_Planning_and_Resource_Consent/04_main_case_file_long.docx",
    fileType: "DOCX",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    expectedSource: "libreoffice" as const,
  },
  {
    label: "eml",
    fixturePath: "test-fixtures/dummy-lgoima-pack/01_Planning_and_Resource_Consent/01_internal_working_email.eml",
    fileType: "EML",
    mimeType: "message/rfc822",
    expectedSource: "email-template" as const,
  },
];

const CASE_ID = "req-001";

describe.skipIf(!RUN)("Phase 1 canonical PDF — real pipeline", () => {
  let prisma: PrismaClient;
  const createdDocIds: string[] = [];

  beforeAll(() => {
    const connectionString =
      process.env.DATABASE_URL || "postgresql://veil:veil_dev@localhost:5434/veil";
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  });

  afterAll(async () => {
    for (const id of createdDocIds) {
      await prisma.detection.deleteMany({ where: { documentId: id } }).catch(() => {});
      await prisma.documentPage.deleteMany({ where: { documentId: id } }).catch(() => {});
      await prisma.document.delete({ where: { id } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  for (const fixture of FIXTURES) {
    it(
      `processes a ${fixture.label.toUpperCase()} end-to-end and populates all canonical_pdf_* columns consistently`,
      async () => {
        // Dynamic import: processDocument and its transitive deps read env vars at
        // module init; importing them here means nothing touches Azure when the
        // suite is skipped.
        const { processDocument } = await import("../process");
        const { getStorage } = await import("../../storage");

        const absolute = path.resolve(fixture.fixturePath);
        expect(fs.existsSync(absolute), `fixture missing: ${absolute}`).toBe(true);
        const originalBuffer = fs.readFileSync(absolute);
        const ext = path.extname(fixture.fixturePath).toLowerCase();

        const doc = await prisma.document.create({
          data: {
            caseId: CASE_ID,
            name: `integration-${fixture.label}-${Date.now()}${ext}`,
            fileType: fixture.fileType,
            mimeType: fixture.mimeType,
            sizeBytes: originalBuffer.length,
            status: "queued",
          },
        });
        createdDocIds.push(doc.id);

        const storage = getStorage();
        const originalKey = `${CASE_ID}/${doc.id}/original${ext}`;
        await storage.upload(originalKey, originalBuffer, fixture.mimeType);
        await prisma.document.update({
          where: { id: doc.id },
          data: { originalPath: originalKey },
        });

        await processDocument(doc.id);

        const updated = await prisma.document.findUniqueOrThrow({
          where: { id: doc.id },
        });

        // Assertions on the five canonical_pdf_* columns.
        expect(updated.canonicalPdfPath).not.toBeNull();
        expect(updated.canonicalPdfSha256).not.toBeNull();
        expect(updated.canonicalPdfSource).toBe(fixture.expectedSource);
        expect(updated.canonicalPdfPageCount ?? 0).toBeGreaterThan(0);
        expect(updated.canonicalPdfBuildMs ?? 0).toBeGreaterThan(0);

        // Fetch the stored canonical PDF and verify header + sha256.
        const canonicalBuffer = await storage.download(updated.canonicalPdfPath!);
        expect(canonicalBuffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
        const actualSha = createHash("sha256").update(canonicalBuffer).digest("hex");
        expect(actualSha).toBe(updated.canonicalPdfSha256);
      },
      // 60-second timeout per test — Azure DI for a scanned PDF can be slow.
      120_000,
    );
  }
});
