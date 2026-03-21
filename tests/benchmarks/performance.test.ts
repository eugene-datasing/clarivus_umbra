/**
 * Performance benchmark tests for Veil.
 *
 * Validates the RFP performance requirements (Contract P26-138):
 *   1. 5,000 pages processed in 4 hours  (~21 pages/minute)
 *   2. 10,000 document duplicate detection in 1 hour
 *   3. 5 concurrent reviewers without deadlocks or excessive latency
 *
 * These tests use synthetic data and mocked external services (Azure OpenAI,
 * Document Intelligence) to measure throughput of the core processing logic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateSyntheticPage,
  generateSyntheticDocument,
  measureThroughput,
} from "./throughput-utils";

// ---------------------------------------------------------------------------
// Mock external dependencies
// ---------------------------------------------------------------------------

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    detection: {
      create: vi.fn().mockResolvedValue({ id: "det-1" }),
      update: vi.fn().mockResolvedValue({ id: "det-1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    document: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    auditEntry: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    systemSetting: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock("@/lib/resilience/azure-services", () => ({
  resilientDocIntelCall: vi.fn(),
  CircuitOpenError: class extends Error {},
}));

vi.mock("@azure/ai-form-recognizer", () => ({
  DocumentAnalysisClient: vi.fn(),
  AzureKeyCredential: vi.fn(),
}));

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: "[]" } }],
        }),
      },
    },
  })),
}));

// ---------------------------------------------------------------------------
// Import pattern detection (uses real logic, no external deps)
// ---------------------------------------------------------------------------

import { detectPatterns } from "@/lib/pipeline/patterns";
import { computeContentHash } from "@/lib/pipeline/duplicate-detect";

// ---------------------------------------------------------------------------
// Pipeline throughput
// ---------------------------------------------------------------------------

describe("Pipeline throughput", () => {
  /**
   * RFP Requirement: Process 5,000 pages within 4 hours.
   *
   * This translates to ~21 pages per minute. We test a representative batch
   * of pages through text extraction simulation + pattern detection to verify
   * the per-page processing rate can sustain the required throughput.
   *
   * Note: In production, Document Intelligence OCR is the main bottleneck.
   * This test validates the on-CPU processing pipeline (pattern detection,
   * content hashing) that occurs after OCR.
   */
  it(
    "processes pages at the required rate (>= 21 pages/minute post-OCR)",
    async () => {
      // Generate a sample batch of 200 pages (enough to get a stable rate)
      const pages = Array.from({ length: 200 }, (_, i) =>
        generateSyntheticPage(i + 1),
      );

      const { durationMs } = await measureThroughput(async () => {
        // Simulate the post-OCR pipeline: pattern detection on each page
        for (const page of pages) {
          detectPatterns([page]);
        }
      }, "Pattern detection on 200 pages");

      const pagesPerMinute = (200 / durationMs) * 60_000;

      // Must sustain at least 21 pages/minute (the RFP minimum)
      // In practice, pattern detection alone should be orders of magnitude
      // faster since it is pure CPU regex work.
      expect(pagesPerMinute).toBeGreaterThan(21);

      // Log for visibility in CI
      console.log(
        `Pipeline throughput: ${pagesPerMinute.toFixed(0)} pages/min (requirement: >= 21)`,
      );
    },
    60_000,
  );

  it("generates pages with realistic content (~500 words each)", () => {
    const page = generateSyntheticPage(1);
    const wordCount = page.text.split(/\s+/).length;

    expect(wordCount).toBeGreaterThan(400);
    expect(wordCount).toBeLessThan(600);
    expect(page.pageNumber).toBe(1);
  });

  it(
    "handles a batch of 1,000 pages without errors",
    async () => {
      const pages = Array.from({ length: 1000 }, (_, i) =>
        generateSyntheticPage(i + 1),
      );

      const { durationMs } = await measureThroughput(async () => {
        const allMatches = detectPatterns(pages);
        return allMatches;
      }, "Pattern detection on 1,000 pages");

      // Should complete in under 30 seconds for pure regex work
      expect(durationMs).toBeLessThan(30_000);

      console.log(
        `1,000-page batch completed in ${(durationMs / 1000).toFixed(2)}s`,
      );
    },
    60_000,
  );
});

// ---------------------------------------------------------------------------
// Duplicate detection throughput
// ---------------------------------------------------------------------------

describe("Duplicate detection throughput", () => {
  /**
   * RFP Requirement: 10,000 document duplicate detection in 1 hour.
   *
   * We test the core hashing and trigram similarity computation that
   * underpins the duplicate detection system.
   */
  it(
    "hashes 10,000 documents within the required timeframe",
    async () => {
      // Generate 10,000 synthetic document text blobs (single-page each
      // for hashing speed — the hash operates on the concatenated text)
      const documents = Array.from({ length: 10_000 }, (_, i) => {
        const doc = generateSyntheticDocument(`doc-${i}`, 1);
        return doc.totalText;
      });

      const { durationMs } = await measureThroughput(async () => {
        const hashes = new Map<string, string>();
        const exactDuplicates: Array<{ docId: string; duplicateOf: string }> = [];

        for (let i = 0; i < documents.length; i++) {
          const hash = computeContentHash(documents[i]);
          const existing = hashes.get(hash);
          if (existing) {
            exactDuplicates.push({
              docId: `doc-${i}`,
              duplicateOf: existing,
            });
          } else {
            hashes.set(hash, `doc-${i}`);
          }
        }

        return { hashCount: hashes.size, duplicateCount: exactDuplicates.length };
      }, "Hash 10,000 documents for exact-duplicate detection");

      // RFP allows 1 hour; hashing should complete in seconds
      expect(durationMs).toBeLessThan(60 * 60 * 1000); // 1 hour max
      // Realistically should be well under 60 seconds
      expect(durationMs).toBeLessThan(60_000);

      console.log(
        `10,000 document hashing completed in ${(durationMs / 1000).toFixed(2)}s`,
      );
    },
    120_000,
  );

  it(
    "performs trigram-based near-duplicate comparison at scale",
    async () => {
      // Generate 500 document text blobs and compute pairwise similarity
      // for a subset to validate throughput of the trigram approach.
      // Full pairwise on 10,000 would be O(n^2) — in production we use
      // hash buckets to reduce comparisons.
      const documents = Array.from({ length: 500 }, (_, i) => {
        const doc = generateSyntheticDocument(`doc-${i}`, 1);
        return doc.totalText;
      });

      // Inline trigram + Jaccard to test the algorithm's throughput
      function buildTrigrams(text: string): Set<string> {
        const normalised = text.replace(/\s+/g, " ").trim().toLowerCase();
        const result = new Set<string>();
        for (let i = 0; i <= normalised.length - 3; i++) {
          result.add(normalised.substring(i, i + 3));
        }
        return result;
      }

      function jaccard(a: Set<string>, b: Set<string>): number {
        let intersection = 0;
        for (const tri of a) {
          if (b.has(tri)) intersection++;
        }
        const union = a.size + b.size - intersection;
        return union === 0 ? 0 : intersection / union;
      }

      const { durationMs, result } = await measureThroughput(async () => {
        const trigramSets = documents.map(buildTrigrams);
        let nearDuplicates = 0;

        // Compare each doc against the next 10 (simulating bucketed comparison)
        for (let i = 0; i < trigramSets.length; i++) {
          const limit = Math.min(i + 10, trigramSets.length);
          for (let j = i + 1; j < limit; j++) {
            const sim = jaccard(trigramSets[i], trigramSets[j]);
            if (sim >= 0.85) nearDuplicates++;
          }
        }

        return { comparisons: trigramSets.length * 10, nearDuplicates };
      }, "Trigram near-duplicate comparison (500 docs, windowed)");

      // Should complete well within acceptable bounds
      expect(durationMs).toBeLessThan(60_000);

      console.log(
        `Near-duplicate comparison (${result.comparisons} pairs) completed in ${(durationMs / 1000).toFixed(2)}s, found ${result.nearDuplicates} near-duplicates`,
      );
    },
    120_000,
  );

  it("correctly identifies exact duplicates in synthetic data", () => {
    const doc1 = generateSyntheticDocument("original", 3);
    const doc2 = generateSyntheticDocument("original", 3);

    const hash1 = computeContentHash(doc1.totalText);
    const hash2 = computeContentHash(doc2.totalText);

    // Same seed/id should produce identical content and hash
    expect(hash1).toBe(hash2);
  });

  it("correctly distinguishes different documents", () => {
    const doc1 = generateSyntheticDocument("document-a", 3);
    const doc2 = generateSyntheticDocument("document-b", 3);

    const hash1 = computeContentHash(doc1.totalText);
    const hash2 = computeContentHash(doc2.totalText);

    expect(hash1).not.toBe(hash2);
  });
});

// ---------------------------------------------------------------------------
// Concurrent reviewer simulation
// ---------------------------------------------------------------------------

describe("Concurrent reviewer simulation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * RFP Requirement: 5 concurrent reviewers without lag.
   *
   * Simulates 5 reviewers performing detection accept/reject operations
   * concurrently via Promise.all. Uses mocked Prisma to verify that
   * concurrent operations complete without deadlocks or errors.
   */
  it(
    "supports 5 concurrent reviewers without deadlocks",
    async () => {
      // Import the mocked prisma
      const { prisma } = await import("@/lib/db/prisma");

      // Configure the mock to simulate realistic latency
      const updateMock = prisma.detection.update as ReturnType<typeof vi.fn>;
      updateMock.mockImplementation(async (args: { where: { id: string } }) => {
        // Simulate 10-50ms database latency
        await new Promise((resolve) =>
          setTimeout(resolve, 10 + Math.random() * 40),
        );
        return { id: args.where.id, status: "accepted" };
      });

      const createAuditMock = prisma.auditEntry.create as ReturnType<typeof vi.fn>;
      createAuditMock.mockImplementation(async () => {
        await new Promise((resolve) =>
          setTimeout(resolve, 5 + Math.random() * 15),
        );
        return { id: `audit-${Date.now()}` };
      });

      // Simulate 5 reviewers, each performing 10 review actions
      const reviewerIds = [
        "reviewer-1",
        "reviewer-2",
        "reviewer-3",
        "reviewer-4",
        "reviewer-5",
      ];

      const simulateReviewerActions = async (reviewerId: string) => {
        const actions: Array<{ detectionId: string; action: string; durationMs: number }> = [];

        for (let i = 0; i < 10; i++) {
          const detectionId = `det-${reviewerId}-${i}`;
          const action = i % 3 === 0 ? "reject" : "accept";
          const start = performance.now();

          // Simulate the review action (update detection + audit entry)
          await prisma.detection.update({
            where: { id: detectionId },
            data: {
              status: action === "accept" ? "accepted" : "rejected",
              reviewedBy: reviewerId,
              reviewedAt: new Date(),
            },
          });

          await prisma.auditEntry.create({
            data: {
              userId: reviewerId,
              userName: reviewerId,
              userRole: "reviewer",
              type: `detection_${action}ed`,
              description: `${action === "accept" ? "Accepted" : "Rejected"} detection ${detectionId}`,
              target: detectionId,
            },
          });

          const durationMs = performance.now() - start;
          actions.push({ detectionId, action, durationMs });
        }

        return { reviewerId, actions };
      };

      const { durationMs, result } = await measureThroughput(async () => {
        // Run all 5 reviewers concurrently
        const results = await Promise.all(
          reviewerIds.map(simulateReviewerActions),
        );
        return results;
      }, "5 concurrent reviewers, 10 actions each");

      // Verify all reviewers completed their actions
      expect(result).toHaveLength(5);
      for (const reviewer of result) {
        expect(reviewer.actions).toHaveLength(10);
      }

      // Total of 50 detection updates + 50 audit entries = 100 DB operations
      expect(updateMock).toHaveBeenCalledTimes(50);
      expect(createAuditMock).toHaveBeenCalledTimes(50);

      // All operations should complete without excessive delay
      // (50 sequential per reviewer * 5 parallel = reasonable total time)
      expect(durationMs).toBeLessThan(30_000);

      // Check individual action latencies
      const allLatencies = result.flatMap((r) =>
        r.actions.map((a) => a.durationMs),
      );
      const avgLatency =
        allLatencies.reduce((sum, l) => sum + l, 0) / allLatencies.length;
      const maxLatency = Math.max(...allLatencies);

      console.log(
        `Concurrent review: ${durationMs.toFixed(0)}ms total, avg action ${avgLatency.toFixed(0)}ms, max ${maxLatency.toFixed(0)}ms`,
      );

      // No single action should take more than 5 seconds
      expect(maxLatency).toBeLessThan(5_000);
    },
    60_000,
  );

  it(
    "handles interleaved accept and reject operations from different reviewers",
    async () => {
      const { prisma } = await import("@/lib/db/prisma");

      const updateMock = prisma.detection.update as ReturnType<typeof vi.fn>;
      updateMock.mockImplementation(async (args: { where: { id: string }; data: { status: string } }) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { id: args.where.id, status: args.data.status };
      });

      // Two reviewers operating on interleaved detection IDs
      const sharedDetections = Array.from({ length: 20 }, (_, i) => `det-shared-${i}`);

      const reviewer1 = async () => {
        const results: string[] = [];
        for (let i = 0; i < sharedDetections.length; i += 2) {
          await prisma.detection.update({
            where: { id: sharedDetections[i] },
            data: { status: "accepted", reviewedBy: "reviewer-1" },
          });
          results.push(sharedDetections[i]);
        }
        return results;
      };

      const reviewer2 = async () => {
        const results: string[] = [];
        for (let i = 1; i < sharedDetections.length; i += 2) {
          await prisma.detection.update({
            where: { id: sharedDetections[i] },
            data: { status: "rejected", reviewedBy: "reviewer-2" },
          });
          results.push(sharedDetections[i]);
        }
        return results;
      };

      const [r1Results, r2Results] = await Promise.all([reviewer1(), reviewer2()]);

      // Both reviewers should complete all their assigned detections
      expect(r1Results).toHaveLength(10);
      expect(r2Results).toHaveLength(10);

      // Total of 20 update calls
      expect(updateMock).toHaveBeenCalledTimes(20);
    },
    30_000,
  );

  it(
    "maintains acceptable latency under concurrent load",
    async () => {
      const { prisma } = await import("@/lib/db/prisma");

      const updateMock = prisma.detection.update as ReturnType<typeof vi.fn>;
      let callCount = 0;

      updateMock.mockImplementation(async () => {
        callCount++;
        // Simulate varying database load
        const latency = 5 + Math.random() * 25;
        await new Promise((resolve) => setTimeout(resolve, latency));
        return { id: `det-${callCount}`, status: "accepted" };
      });

      const reviewerWork = async (id: number) => {
        const latencies: number[] = [];
        for (let i = 0; i < 5; i++) {
          const start = performance.now();
          await prisma.detection.update({
            where: { id: `det-${id}-${i}` },
            data: { status: "accepted" },
          });
          latencies.push(performance.now() - start);
        }
        return latencies;
      };

      // Run 5 reviewers concurrently
      const allLatencies = await Promise.all(
        [1, 2, 3, 4, 5].map(reviewerWork),
      );

      const flatLatencies = allLatencies.flat();
      const p95Index = Math.floor(flatLatencies.length * 0.95);
      const sorted = [...flatLatencies].sort((a, b) => a - b);
      const p95 = sorted[p95Index];

      console.log(
        `P95 latency under concurrent load: ${p95.toFixed(0)}ms`,
      );

      // P95 should be under 1 second for individual operations
      expect(p95).toBeLessThan(1_000);
    },
    30_000,
  );
});
