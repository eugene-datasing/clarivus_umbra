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

describe.skipIf(!RUN)("Phase 2 DOCX detection coverage", () => {
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

  // Helper: process a fixture end-to-end, return the created document id.
  async function processFixture(fixturePath: string, fileType: string, mimeType: string): Promise<string> {
    const { processDocument } = await import("../process");
    const { getStorage } = await import("../../storage");

    const absolute = path.resolve(fixturePath);
    expect(fs.existsSync(absolute), `fixture missing: ${absolute}`).toBe(true);
    const originalBuffer = fs.readFileSync(absolute);
    const ext = path.extname(fixturePath).toLowerCase();

    const doc = await prisma.document.create({
      data: {
        caseId: CASE_ID,
        name: `phase2-integration-${Date.now()}${ext}`,
        fileType,
        mimeType,
        sizeBytes: originalBuffer.length,
        status: "queued",
      },
    });
    createdDocIds.push(doc.id);

    const storage = getStorage();
    const key = `${CASE_ID}/${doc.id}/original${ext}`;
    await storage.upload(key, originalBuffer, mimeType);
    await prisma.document.update({
      where: { id: doc.id },
      data: { originalPath: key },
    });

    await processDocument(doc.id);
    return doc.id;
  }

  it(
    "produces per-occurrence bboxes for a DOCX with repeated PII",
    async () => {
      const docId = await processFixture(
        "test-fixtures/dummy-lgoima-pack/01_Planning_and_Resource_Consent/04_main_case_file_long.docx",
        "DOCX",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );

      const dets = await prisma.detection.findMany({ where: { documentId: docId } });
      expect(dets.length).toBeGreaterThan(20);

      // Every detection has non-zero bbox (the Phase-2 shortcut-removal
      // invariant — no phantom (0,0,0,0) rows in Detection output).
      const zeroRows = dets.filter((d) => d.posW === 0 && d.posH === 0);
      expect(zeroRows.length).toBe(0);

      // Find a detection text that repeats 3+ times. All its rows must
      // have distinct posY (the Phase-1 B2 per-occurrence invariant,
      // now extended to DOCX by Phase 2).
      const byText = new Map<string, typeof dets>();
      for (const d of dets) {
        const key = `${d.page}|${d.type}|${d.text.toLowerCase().trim()}`;
        if (!byText.has(key)) byText.set(key, []);
        byText.get(key)!.push(d);
      }
      const repeated = Array.from(byText.values()).filter((rows) => rows.length >= 3);
      expect(
        repeated.length,
        "expected at least one (page, type, text) tuple to repeat 3+ times in this DOCX fixture",
      ).toBeGreaterThan(0);

      for (const rows of repeated) {
        const posYs = new Set(rows.map((r) => Math.round(r.posY * 10) / 10));
        expect(
          posYs.size,
          `detection "${rows[0].text}" on page ${rows[0].page} repeats ${rows.length}× but has only ${posYs.size} distinct posY`,
        ).toBeGreaterThanOrEqual(rows.length);
      }
    },
    180_000,
  );

  it(
    "bboxes are percentages of canonical PDF dimensions",
    async () => {
      const docId = await processFixture(
        "test-fixtures/dummy-lgoima-pack/01_Planning_and_Resource_Consent/05_internal_briefing_and_recommendation.docx",
        "DOCX",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );

      const updated = await prisma.document.findUniqueOrThrow({ where: { id: docId } });
      expect(updated.canonicalPdfPageCount ?? 0).toBeGreaterThan(0);

      const dets = await prisma.detection.findMany({ where: { documentId: docId } });
      expect(dets.length).toBeGreaterThan(0);

      for (const d of dets) {
        expect(d.posX).toBeGreaterThanOrEqual(0);
        expect(d.posX).toBeLessThanOrEqual(100);
        expect(d.posY).toBeGreaterThanOrEqual(0);
        expect(d.posY).toBeLessThanOrEqual(100);
        expect(d.posW).toBeGreaterThanOrEqual(0);
        expect(d.posW).toBeLessThanOrEqual(100);
        expect(d.posH).toBeGreaterThanOrEqual(0);
        expect(d.posH).toBeLessThanOrEqual(100);
        expect(d.page).toBeGreaterThan(0);
        expect(d.page).toBeLessThanOrEqual(updated.canonicalPdfPageCount!);
      }
    },
    180_000,
  );

  it(
    "PDF input path remains unchanged (detections present, bboxes populated)",
    async () => {
      const docId = await processFixture(
        "test-fixtures/dummy-lgoima-pack/01_Planning_and_Resource_Consent/07_formal_report.pdf",
        "PDF",
        "application/pdf",
      );

      const updated = await prisma.document.findUniqueOrThrow({ where: { id: docId } });
      expect(updated.canonicalPdfSource).toBe("original");

      const dets = await prisma.detection.findMany({ where: { documentId: docId } });
      // PDF fixture historically produces ~60 detections (Phase 1 regression
      // test saw 61; Step 4 regression saw 63). Assert the order of magnitude
      // rather than an exact count to absorb AI variance.
      expect(dets.length).toBeGreaterThan(30);
      expect(dets.length).toBeLessThan(200);

      const zeroBbox = dets.filter((d) => d.posW === 0 && d.posH === 0);
      expect(zeroBbox.length).toBe(0);
    },
    120_000,
  );
});

describe.skipIf(!RUN)("Phase 2 detection-coverage follow-up", () => {
  // Regression coverage for the two gaps surfaced in live Phase 2 testing:
  //   1. NZ driver licence "HM847219" — was missed entirely (no regex for
  //      DL + AI didn't flag). Fixed by a new driver-licence pattern with a
  //      context-word guard ("licence" | "license" | "driver" | "DL").
  //   2. Dates of birth in month-name form — AI was not instructed to flag
  //      them. Fixed by updating the personal-name prompt + adding a worked
  //      example for "22 September 1986".
  //
  // AI variance is real on this fixture — assertions are deliberately loose:
  // substring/type-only, no total counts, no posY.
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

  async function processB2(): Promise<string> {
    const { processDocument } = await import("../process");
    const { getStorage } = await import("../../storage");

    const fixturePath = "test-fixtures/dummy-lgoima-pack/B2_Witness_Statement_Torres.pdf";
    const absolute = path.resolve(fixturePath);
    expect(fs.existsSync(absolute), `fixture missing: ${absolute}`).toBe(true);
    const originalBuffer = fs.readFileSync(absolute);

    const doc = await prisma.document.create({
      data: {
        caseId: CASE_ID,
        name: `detection-coverage-${Date.now()}.pdf`,
        fileType: "PDF",
        mimeType: "application/pdf",
        sizeBytes: originalBuffer.length,
        status: "queued",
      },
    });
    createdDocIds.push(doc.id);

    const storage = getStorage();
    const key = `${CASE_ID}/${doc.id}/original.pdf`;
    await storage.upload(key, originalBuffer, "application/pdf");
    await prisma.document.update({
      where: { id: doc.id },
      data: { originalPath: key },
    });

    await processDocument(doc.id);
    return doc.id;
  }

  it(
    "populates driver-licence detection with HM847219 present in context",
    async () => {
      const docId = await processB2();
      const dets = await prisma.detection.findMany({ where: { documentId: docId } });

      const dlHits = dets.filter(
        (d) => d.type === "driver-licence" && d.text.includes("HM847219"),
      );
      expect(
        dlHits.length,
        `expected >=1 driver-licence detection containing "HM847219"; got types=${JSON.stringify(dets.map((d) => d.type))} texts=${JSON.stringify(dets.map((d) => d.text))}`,
      ).toBeGreaterThanOrEqual(1);
    },
    180_000,
  );

  it(
    "populates personal-name DOB detection for '22 September 1986'",
    async () => {
      // AI variance is real on this fixture: the prompt asks GPT-4o to
      // include "DOB" in aiExplanation, but compliance varies run to run
      // (observed ~50% on Phase 2 spike reruns). The detection itself
      // (type + text) is the load-bearing assertion; aiExplanation
      // wording is tracked separately and not asserted here.
      const docId = await processB2();
      const dets = await prisma.detection.findMany({ where: { documentId: docId } });

      const dobHits = dets.filter(
        (d) =>
          d.type === "personal-name" &&
          (d.text.includes("22 September 1986") || d.text.includes("September 1986")),
      );
      expect(
        dobHits.length,
        `expected >=1 personal-name detection containing "September 1986"; got ${JSON.stringify(
          dets
            .filter((d) => d.text.toLowerCase().includes("september"))
            .map((d) => ({ type: d.type, text: d.text })),
        )}`,
      ).toBeGreaterThanOrEqual(1);
    },
    180_000,
  );
});
