/**
 * Pipeline invoker — single-run wrapper around processDocument for the
 * benchmark suite.
 *
 * Each call seeds a dedicated Case + Document row, uploads the fixture
 * buffer to storage, runs processDocument, queries the resulting
 * detections, and cleans up (Detections, DocumentPages, Document, Case,
 * original + canonical storage blobs). Idempotent on partial failure —
 * cleanup runs in a finally block and swallows per-step errors so a
 * bench failure does not orphan rows.
 *
 * Not a test of the pipeline itself — just the plumbing the orchestrator
 * needs. Tranche 2b of docs/detection-coverage-plan-2026-04.md.
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { processDocument } from "../pipeline/process";
import { getStorage, type StorageProvider } from "../storage";
import type { ActualDetection } from "./scoring";

export interface InvokerResult {
  detections: ActualDetection[];
  wallMs: number;
  canonicalPdfSource: string | null;
  canonicalPdfPageCount: number | null;
  documentStatus: string;
  error?: string;
}

export interface InvokerOptions {
  prisma?: PrismaClient;
  storage?: StorageProvider;
  runLabel?: string;
}

const EXT_TO_FILETYPE: Record<string, { fileType: string; mimeType: string }> = {
  pdf: { fileType: "PDF", mimeType: "application/pdf" },
  docx: {
    fileType: "DOCX",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  xlsx: {
    fileType: "XLSX",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  eml: { fileType: "EML", mimeType: "message/rfc822" },
  msg: { fileType: "MSG", mimeType: "application/vnd.ms-outlook" },
  txt: { fileType: "TXT", mimeType: "text/plain" },
};

function resolveFileType(extension: string): {
  fileType: string;
  mimeType: string;
} {
  const ext = extension.replace(/^\./, "").toLowerCase();
  const entry = EXT_TO_FILETYPE[ext];
  if (!entry) {
    throw new Error(`Unsupported fixture extension: .${ext}`);
  }
  return entry;
}

export async function invokeFixturePipeline(
  fixturePath: string,
  fixtureName: string,
  options: InvokerOptions = {},
): Promise<InvokerResult> {
  const prisma =
    options.prisma ??
    new PrismaClient({
      adapter: new PrismaPg({
        connectionString:
          process.env.DATABASE_URL ||
          "postgresql://veil:veil_dev@localhost:5434/veil",
      }),
    });
  const ownsPrisma = !options.prisma;
  const storage = options.storage ?? getStorage();

  const buffer = fs.readFileSync(path.resolve(fixturePath));
  const ext = path.extname(fixturePath);
  const { fileType, mimeType } = resolveFileType(ext);
  const runLabel =
    options.runLabel ?? `${fixtureName}-${Date.now().toString(36)}`;

  // Isolate from prod seed data: one case per invocation.
  const bench = `bench-${runLabel}`;
  const testCase = await prisma.case.create({
    data: {
      reference: `BENCH-${runLabel}`.slice(0, 100),
      requesterName: "Bench Suite",
      requesterType: "internal-bench",
      dateReceived: new Date(),
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      departments: ["bench"],
      description: `Bench fixture run: ${fixtureName}`,
      status: "draft",
    },
  });

  let docId: string | null = null;
  let originalKey: string | null = null;
  let canonicalKey: string | null = null;
  let result: InvokerResult;
  const startedAt = Date.now();

  try {
    const doc = await prisma.document.create({
      data: {
        caseId: testCase.id,
        name: `${bench}${ext}`,
        fileType,
        mimeType,
        sizeBytes: buffer.length,
        status: "queued",
      },
    });
    docId = doc.id;
    originalKey = `${testCase.id}/${doc.id}/original${ext}`;
    canonicalKey = `${testCase.id}/${doc.id}/canonical.pdf`;

    await storage.upload(originalKey, buffer, mimeType);
    await prisma.document.update({
      where: { id: doc.id },
      data: { originalPath: originalKey },
    });

    let error: string | undefined;
    try {
      await processDocument(doc.id);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const wallMs = Date.now() - startedAt;
    const updated = await prisma.document.findUniqueOrThrow({
      where: { id: doc.id },
    });
    const detectionRows = await prisma.detection.findMany({
      where: { documentId: doc.id },
      orderBy: [{ page: "asc" }, { posY: "asc" }],
      select: {
        text: true,
        type: true,
        page: true,
        confidence: true,
      },
    });

    const detections: ActualDetection[] = detectionRows.map((d) => ({
      text: d.text,
      type: d.type,
      page: d.page,
      confidence: d.confidence,
    }));

    result = {
      detections,
      wallMs,
      canonicalPdfSource: updated.canonicalPdfSource,
      canonicalPdfPageCount: updated.canonicalPdfPageCount,
      documentStatus: updated.status,
      error,
    };
  } finally {
    // Cleanup — swallow per-step errors so a partial failure doesn't
    // orphan rows or leave blobs behind.
    if (docId) {
      await prisma.detection
        .deleteMany({ where: { documentId: docId } })
        .catch(() => {});
      await prisma.documentPage
        .deleteMany({ where: { documentId: docId } })
        .catch(() => {});
      await prisma.document.delete({ where: { id: docId } }).catch(() => {});
    }
    await prisma.case.delete({ where: { id: testCase.id } }).catch(() => {});
    if (originalKey) await storage.delete(originalKey).catch(() => {});
    if (canonicalKey) await storage.delete(canonicalKey).catch(() => {});
    if (ownsPrisma) await prisma.$disconnect().catch(() => {});
  }

  return result;
}
