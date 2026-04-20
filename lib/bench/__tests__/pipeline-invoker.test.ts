import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { ActualDetection } from "../scoring";
import type { PrismaClient } from "../../generated/prisma/client";

const processDocumentMock = vi.fn<(docId: string) => Promise<void>>();
vi.mock("../../pipeline/process", () => ({
  processDocument: processDocumentMock,
}));

// Lazy import AFTER the mock so the spy wires up.
async function load() {
  return await import("../pipeline-invoker");
}

/**
 * Helper: build a mock PrismaClient with the exact surface area the
 * invoker touches. Each mock operation resolves deterministically so we
 * can assert call counts without worrying about async fallout.
 */
function buildMockPrisma(overrides: {
  detections?: Array<Pick<ActualDetection, "text" | "type" | "page"> & { confidence?: number }>;
  documentStatus?: string;
  canonicalPdfSource?: string | null;
  canonicalPdfPageCount?: number | null;
} = {}) {
  const calls = {
    caseCreate: 0,
    documentCreate: 0,
    documentUpdate: 0,
    documentFind: 0,
    detectionFindMany: 0,
    detectionDeleteMany: 0,
    documentPageDeleteMany: 0,
    documentDelete: 0,
    caseDelete: 0,
    disconnect: 0,
  };

  const mock = {
    case: {
      create: vi.fn(async () => {
        calls.caseCreate++;
        return { id: "case-123" };
      }),
      delete: vi.fn(async () => {
        calls.caseDelete++;
        return {};
      }),
    },
    document: {
      create: vi.fn(async () => {
        calls.documentCreate++;
        return { id: "doc-456" };
      }),
      update: vi.fn(async () => {
        calls.documentUpdate++;
        return {};
      }),
      findUniqueOrThrow: vi.fn(async () => {
        calls.documentFind++;
        return {
          id: "doc-456",
          status: overrides.documentStatus ?? "ready",
          canonicalPdfSource: overrides.canonicalPdfSource ?? "docker-libreoffice",
          canonicalPdfPageCount: overrides.canonicalPdfPageCount ?? 3,
        };
      }),
      delete: vi.fn(async () => {
        calls.documentDelete++;
        return {};
      }),
    },
    detection: {
      findMany: vi.fn(async () => {
        calls.detectionFindMany++;
        return (overrides.detections ?? []).map((d) => ({
          text: d.text,
          type: d.type,
          page: d.page,
          confidence: d.confidence ?? 0.9,
        }));
      }),
      deleteMany: vi.fn(async () => {
        calls.detectionDeleteMany++;
        return { count: 0 };
      }),
    },
    documentPage: {
      deleteMany: vi.fn(async () => {
        calls.documentPageDeleteMany++;
        return { count: 0 };
      }),
    },
    $disconnect: vi.fn(async () => {
      calls.disconnect++;
    }),
  } as const;

  return { mock, calls };
}

function buildMockStorage() {
  const calls = { upload: 0, delete: 0 };
  const storage = {
    upload: vi.fn(async () => {
      calls.upload++;
    }),
    download: vi.fn(async () => Buffer.alloc(0)),
    getUrl: vi.fn(() => ""),
    delete: vi.fn(async () => {
      calls.delete++;
    }),
    exists: vi.fn(async () => true),
  };
  return { storage, calls };
}

function writeTempFixture(ext: string = ".pdf", content = Buffer.from("%PDF-1.4\n%fake\n")): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "invoker-"));
  const file = path.join(dir, `fixture${ext}`);
  fs.writeFileSync(file, content);
  return file;
}

describe("invokeFixturePipeline", () => {
  beforeEach(() => {
    processDocumentMock.mockReset();
  });

  it("happy path: seeds case+document, runs pipeline, returns detections, cleans up", async () => {
    const { invokeFixturePipeline } = await load();
    processDocumentMock.mockResolvedValueOnce();
    const fixturePath = writeTempFixture(".pdf");
    const { mock: prisma, calls } = buildMockPrisma({
      detections: [{ text: "John Smith", type: "personal-name", page: 1, confidence: 0.92 }],
      documentStatus: "ready",
      canonicalPdfPageCount: 2,
    });
    const { storage, calls: storageCalls } = buildMockStorage();

    const result = await invokeFixturePipeline(fixturePath, "fixture-test", {
      prisma: prisma as unknown as PrismaClient,
      storage,
      runLabel: "unit-1",
    });

    expect(processDocumentMock).toHaveBeenCalledWith("doc-456");
    expect(result.detections).toEqual([
      { text: "John Smith", type: "personal-name", page: 1, confidence: 0.92 },
    ]);
    expect(result.documentStatus).toBe("ready");
    expect(result.canonicalPdfPageCount).toBe(2);
    expect(result.error).toBeUndefined();
    expect(result.wallMs).toBeGreaterThanOrEqual(0);

    // Seed
    expect(calls.caseCreate).toBe(1);
    expect(calls.documentCreate).toBe(1);
    expect(calls.documentUpdate).toBe(1);
    expect(storageCalls.upload).toBe(1);
    // Query + cleanup
    expect(calls.documentFind).toBe(1);
    expect(calls.detectionFindMany).toBe(1);
    expect(calls.detectionDeleteMany).toBe(1);
    expect(calls.documentPageDeleteMany).toBe(1);
    expect(calls.documentDelete).toBe(1);
    expect(calls.caseDelete).toBe(1);
    expect(storageCalls.delete).toBe(2); // original + canonical
    // options.prisma supplied → no $disconnect
    expect(calls.disconnect).toBe(0);
  });

  it("pipeline throws → error captured on result, cleanup still runs in finally", async () => {
    const { invokeFixturePipeline } = await load();
    processDocumentMock.mockRejectedValueOnce(new Error("OCR unavailable"));
    const fixturePath = writeTempFixture(".docx");
    const { mock: prisma, calls } = buildMockPrisma({
      detections: [],
      documentStatus: "failed",
      canonicalPdfPageCount: null,
    });
    const { storage, calls: storageCalls } = buildMockStorage();

    const result = await invokeFixturePipeline(fixturePath, "fixture-err", {
      prisma: prisma as unknown as PrismaClient,
      storage,
      runLabel: "unit-err",
    });

    expect(result.error).toBe("OCR unavailable");
    expect(result.detections).toEqual([]);
    expect(result.documentStatus).toBe("failed");

    // Cleanup still fires even though processDocument threw
    expect(calls.detectionDeleteMany).toBe(1);
    expect(calls.documentPageDeleteMany).toBe(1);
    expect(calls.documentDelete).toBe(1);
    expect(calls.caseDelete).toBe(1);
    expect(storageCalls.delete).toBe(2);
  });

  it("unsupported extension → throws before any DB writes", async () => {
    const { invokeFixturePipeline } = await load();
    const fixturePath = writeTempFixture(".zip");
    const { mock: prisma, calls } = buildMockPrisma();
    const { storage } = buildMockStorage();

    await expect(
      invokeFixturePipeline(fixturePath, "fixture-zip", {
        prisma: prisma as unknown as PrismaClient,
        storage,
      }),
    ).rejects.toThrow(/Unsupported fixture extension/);

    expect(processDocumentMock).not.toHaveBeenCalled();
    expect(calls.caseCreate).toBe(0);
    expect(calls.documentCreate).toBe(0);
  });
});
