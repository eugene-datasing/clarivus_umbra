import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ExtractedPage } from "../extract";

const mockCreate = vi.fn();

vi.mock("openai", () => {
  return {
    AzureOpenAI: class MockAzureOpenAI {
      chat = {
        completions: {
          create: mockCreate,
        },
      };
    },
  };
});

vi.mock("@/lib/resilience/azure-services", () => ({
  resilientOpenAICall: vi.fn((fn: () => unknown) => fn()),
  CircuitOpenError: class CircuitOpenError extends Error {},
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

process.env.AZURE_OPENAI_ENDPOINT = "https://test.openai.azure.com";
process.env.AZURE_OPENAI_KEY = "test-key";
process.env.AZURE_OPENAI_DEPLOYMENT = "gpt-4o";

import { detectWithAI, buildSystemPrompt } from "../ai-detect";
import type { DocumentClassification } from "../doc-classify";

function makePage(pageNumber: number, text: string): ExtractedPage {
  return { pageNumber, text, words: [] };
}

describe("detectWithAI — DOB surface-through", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("stores a DOB returned as personal-name with DOB noted in aiExplanation", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              detections: [
                {
                  type: "personal-name",
                  text: "22 September 1986",
                  confidence: 90,
                  page: 1,
                  suggestedGround: "s7(2)(a)",
                  reasoning: "Date of birth of a private individual",
                  piConsideration:
                    "DOB is a sensitive personal identifier frequently used for identity verification",
                  aiExplanation:
                    "DOB — date of birth of a private individual, flagged as personal information.",
                },
              ],
            }),
          },
        },
      ],
    });

    const pages = [makePage(1, "Date of birth: 22 September 1986")];
    const detections = await detectWithAI(pages, []);

    expect(detections).toHaveLength(1);
    const dob = detections[0];
    expect(dob.type).toBe("personal-name");
    expect(dob.text).toBe("22 September 1986");
    expect(dob.suggestedGround).toBe("s7_2a");
    expect(dob.aiExplanation.toLowerCase()).toContain("dob");
    expect(dob.page).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Phase 1 item 3 — env-var split for detection vs classification deployments.
// ---------------------------------------------------------------------------

function mockEmptyDetections(times = 1) {
  for (let i = 0; i < times; i++) {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ detections: [] }) } }],
    });
  }
}

describe("detectWithAI — deployment env-var resolution", () => {
  const originalDetection = process.env.AZURE_OPENAI_DEPLOYMENT_DETECTION;
  const originalShared = process.env.AZURE_OPENAI_DEPLOYMENT;

  beforeEach(() => {
    mockCreate.mockReset();
  });

  afterEach(() => {
    if (originalDetection === undefined) {
      delete process.env.AZURE_OPENAI_DEPLOYMENT_DETECTION;
    } else {
      process.env.AZURE_OPENAI_DEPLOYMENT_DETECTION = originalDetection;
    }
    if (originalShared === undefined) {
      delete process.env.AZURE_OPENAI_DEPLOYMENT;
    } else {
      process.env.AZURE_OPENAI_DEPLOYMENT = originalShared;
    }
  });

  it("AZURE_OPENAI_DEPLOYMENT_DETECTION overrides the shared AZURE_OPENAI_DEPLOYMENT", async () => {
    process.env.AZURE_OPENAI_DEPLOYMENT = "gpt-4o";
    process.env.AZURE_OPENAI_DEPLOYMENT_DETECTION = "gpt-4o-detection-override";
    mockEmptyDetections();

    const pages = [makePage(1, "Some page content long enough to be non-empty.")];
    await detectWithAI(pages, []);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const requestBody = mockCreate.mock.calls[0][0] as { model: string };
    expect(requestBody.model).toBe("gpt-4o-detection-override");
  });

  it("falls back to AZURE_OPENAI_DEPLOYMENT when DETECTION is unset", async () => {
    delete process.env.AZURE_OPENAI_DEPLOYMENT_DETECTION;
    process.env.AZURE_OPENAI_DEPLOYMENT = "gpt-4o-shared-fallback";
    mockEmptyDetections();

    const pages = [makePage(1, "Some page content long enough to be non-empty.")];
    await detectWithAI(pages, []);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const requestBody = mockCreate.mock.calls[0][0] as { model: string };
    expect(requestBody.model).toBe("gpt-4o-shared-fallback");
  });
});

// ---------------------------------------------------------------------------
// Phase 1 item 4 — single-batch guard.
// ---------------------------------------------------------------------------

describe("detectWithAI — single-batch guard", () => {
  const originalMaxPages = process.env.AI_DETECT_SINGLE_BATCH_MAX_PAGES;

  beforeEach(() => {
    mockCreate.mockReset();
    // Leave default (undefined → parses to 6)
    delete process.env.AI_DETECT_SINGLE_BATCH_MAX_PAGES;
  });

  afterEach(() => {
    if (originalMaxPages === undefined) {
      delete process.env.AI_DETECT_SINGLE_BATCH_MAX_PAGES;
    } else {
      process.env.AI_DETECT_SINGLE_BATCH_MAX_PAGES = originalMaxPages;
    }
  });

  it("4-page input fires exactly one chat completion call", async () => {
    mockEmptyDetections(1);
    const pages = [1, 2, 3, 4].map((n) =>
      makePage(n, `Page ${n} contains enough text to be classed as non-empty.`),
    );
    await detectWithAI(pages, []);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("7-page input fires three chat completion calls (3 + 3 + 1)", async () => {
    mockEmptyDetections(3);
    const pages = Array.from({ length: 7 }, (_, i) =>
      makePage(i + 1, `Page ${i + 1} contains enough text to be classed as non-empty.`),
    );
    await detectWithAI(pages, []);
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// Parallel batches (Phase 2 of the parallel-AI-batches workstream).
// ---------------------------------------------------------------------------

describe("detectWithAI — parallel batch execution", () => {
  const originalMaxPages = process.env.AI_DETECT_SINGLE_BATCH_MAX_PAGES;
  const originalConcurrency = process.env.AI_DETECT_CONCURRENCY;

  beforeEach(() => {
    mockCreate.mockReset();
    delete process.env.AI_DETECT_SINGLE_BATCH_MAX_PAGES;
    delete process.env.AI_DETECT_CONCURRENCY;
  });

  afterEach(() => {
    if (originalMaxPages === undefined) delete process.env.AI_DETECT_SINGLE_BATCH_MAX_PAGES;
    else process.env.AI_DETECT_SINGLE_BATCH_MAX_PAGES = originalMaxPages;
    if (originalConcurrency === undefined) delete process.env.AI_DETECT_CONCURRENCY;
    else process.env.AI_DETECT_CONCURRENCY = originalConcurrency;
  });

  function makeManyPages(count: number): ExtractedPage[] {
    return Array.from({ length: count }, (_, i) =>
      makePage(i + 1, `Page ${i + 1} contains enough text to be classed as non-empty.`),
    );
  }

  it("dispatches batches concurrently up to the resolveConcurrency limit (default 2)", async () => {
    // Track how many calls are in flight at any moment via the mock.
    // Each mock resolution defers via a microtask + a controlled gap so
    // the limiter has a chance to overlap. With concurrency=2 over 4
    // batches (>6 pages), the in-flight count must reach 2 but never
    // 3 — that's the load-bearing semantic of pLimit.
    let inFlight = 0;
    let maxInFlight = 0;
    mockCreate.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Yield twice so the limiter has room to schedule the next batch
      // up to its cap before the current one resolves.
      await new Promise((r) => setTimeout(r, 5));
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return {
        choices: [{ message: { content: JSON.stringify({ detections: [] }) } }],
      };
    });

    const pages = makeManyPages(12); // 12 pages > 6 → BATCH_SIZE=3 → 4 batches
    await detectWithAI(pages, []);

    expect(mockCreate).toHaveBeenCalledTimes(4);
    expect(maxInFlight).toBeGreaterThanOrEqual(2);
    expect(maxInFlight).toBeLessThanOrEqual(2); // strict cap at default
  });

  it("respects AI_DETECT_CONCURRENCY=4 when set in env (and quota allows)", async () => {
    process.env.AI_DETECT_CONCURRENCY = "4";

    let inFlight = 0;
    let maxInFlight = 0;
    mockCreate.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return {
        choices: [{ message: { content: JSON.stringify({ detections: [] }) } }],
      };
    });

    const pages = makeManyPages(15); // 5 batches at BATCH_SIZE=3
    await detectWithAI(pages, []);

    expect(mockCreate).toHaveBeenCalledTimes(5);
    expect(maxInFlight).toBeGreaterThanOrEqual(4);
    expect(maxInFlight).toBeLessThanOrEqual(4);
  });

  it("clamps AI_DETECT_CONCURRENCY=10 down to the MAX_CONCURRENCY ceiling of 8", async () => {
    process.env.AI_DETECT_CONCURRENCY = "10";

    let inFlight = 0;
    let maxInFlight = 0;
    mockCreate.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return {
        choices: [{ message: { content: JSON.stringify({ detections: [] }) } }],
      };
    });

    const pages = makeManyPages(30); // 10 batches at BATCH_SIZE=3
    await detectWithAI(pages, []);

    expect(mockCreate).toHaveBeenCalledTimes(10);
    expect(maxInFlight).toBeLessThanOrEqual(8);
  });

  it("clamps AI_DETECT_CONCURRENCY=0 / negative / NaN to default of 2", async () => {
    for (const bad of ["0", "-3", "NaN", "abc", ""]) {
      process.env.AI_DETECT_CONCURRENCY = bad;
      mockCreate.mockReset();
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ detections: [] }) } }],
      });
      const pages = makeManyPages(9); // 3 batches
      await detectWithAI(pages, []);
      expect(mockCreate).toHaveBeenCalledTimes(3);
      // Note: we don't strictly verify the default (2) here because all
      // mock resolutions are immediate; the in-flight cap test above
      // covers the default-2 case empirically.
    }
  });

  it("collects detections from ALL batches (no detections lost across the parallel dispatch)", async () => {
    // Three batches, each returning one detection with a distinct
    // identifier. Order of dispatch is irrelevant; the merged list
    // must contain all three.
    let callIdx = 0;
    mockCreate.mockImplementation(async () => {
      const batchIdx = callIdx++;
      await new Promise((r) => setTimeout(r, Math.random() * 20));
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                detections: [
                  {
                    type: "personal-name",
                    text: `Person ${batchIdx + 1}`,
                    confidence: 90,
                    page: batchIdx * 3 + 1,
                    suggestedGround: "s7(2)(a)",
                    reasoning: "test",
                    piConsideration: "test",
                    aiExplanation: "test",
                  },
                ],
              }),
            },
          },
        ],
      };
    });

    const pages = makeManyPages(9); // 3 batches
    const detections = await detectWithAI(pages, []);

    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(detections).toHaveLength(3);
    const texts = detections.map((d) => d.text).sort();
    expect(texts).toEqual(["Person 1", "Person 2", "Person 3"]);
  });

  it("partial failure: one batch errors, others still contribute their detections", async () => {
    let callIdx = 0;
    mockCreate.mockImplementation(async () => {
      const idx = callIdx++;
      if (idx === 1) {
        // Middle batch fails with a generic non-circuit error.
        throw new Error("simulated transient failure");
      }
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                detections: [
                  {
                    type: "personal-name",
                    text: `Person ${idx + 1}`,
                    confidence: 90,
                    page: idx * 3 + 1,
                    suggestedGround: "s7(2)(a)",
                    reasoning: "test",
                    piConsideration: "test",
                    aiExplanation: "test",
                  },
                ],
              }),
            },
          },
        ],
      };
    });

    const pages = makeManyPages(9); // 3 batches
    const detections = await detectWithAI(pages, []);

    // Two surviving batches → two detections (Person 1, Person 3).
    // The failing batch is silently dropped, matching the sequential
    // pre-fix's "log + continue" semantics.
    expect(detections.map((d) => d.text).sort()).toEqual(["Person 1", "Person 3"]);
  });

  it("CircuitOpenError on one batch does NOT short-circuit the others — survivors still return", async () => {
    // Pre-Phase-2, a CircuitOpenError mid-loop early-broke and dropped
    // every remaining batch. With parallel dispatch the iteration is
    // effectively complete by the time any reject lands, so concurrent
    // batches finish naturally. Subsequent doc reprocessing will hit
    // the open breaker and fail-fast organically — no need to break
    // mid-iteration.
    const azure = await import("@/lib/resilience/azure-services");
    let callIdx = 0;
    mockCreate.mockImplementation(async () => {
      const idx = callIdx++;
      if (idx === 1) {
        throw new azure.CircuitOpenError("Azure OpenAI breaker open");
      }
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                detections: [
                  {
                    type: "personal-name",
                    text: `Person ${idx + 1}`,
                    confidence: 90,
                    page: idx * 3 + 1,
                    suggestedGround: "s7(2)(a)",
                    reasoning: "test",
                    piConsideration: "test",
                    aiExplanation: "test",
                  },
                ],
              }),
            },
          },
        ],
      };
    });

    const pages = makeManyPages(9); // 3 batches
    const detections = await detectWithAI(pages, []);

    // Survivors still return their detections — pre-fix behaviour
    // would have dropped batch 3 because the loop would have broken on
    // batch 2's CircuitOpenError.
    expect(detections.map((d) => d.text).sort()).toEqual(["Person 1", "Person 3"]);
  });

  it("preserves the existingPatternTexts overlap filter post-parallel merge", async () => {
    // Same dedup behaviour as sequential: the filter runs against the
    // merged result, not per-batch, so order of arrival doesn't matter.
    let callIdx = 0;
    mockCreate.mockImplementation(async () => {
      const idx = callIdx++;
      const text = idx === 0 ? "021 456 7890" : `Person ${idx + 1}`;
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                detections: [
                  {
                    type: idx === 0 ? "phone" : "personal-name",
                    text,
                    confidence: 90,
                    page: idx * 3 + 1,
                    suggestedGround: "s7(2)(a)",
                    reasoning: "test",
                    piConsideration: "test",
                    aiExplanation: "test",
                  },
                ],
              }),
            },
          },
        ],
      };
    });

    const pages = makeManyPages(9);
    // The phone "021 456 7890" was already found by the pattern detector
    // — must be filtered out of the AI result.
    const detections = await detectWithAI(pages, ["021 456 7890"]);
    const texts = detections.map((d) => d.text).sort();
    expect(texts).toEqual(["Person 2", "Person 3"]);
  });

  it("single-batch short-circuit (≤6 pages) still produces exactly one call regardless of concurrency", async () => {
    process.env.AI_DETECT_CONCURRENCY = "8";
    mockEmptyDetections(1);
    const pages = makeManyPages(6);
    await detectWithAI(pages, []);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Timing-style smoke test. With each mocked chat call taking ~50ms, four
  // batches at concurrency=2 should complete in ~100ms wall time (two
  // sequential rounds), not ~200ms. The assertions are loose to avoid
  // flake on slow CI — we just want to prove the parallel dispatch
  // shaves wall time off compared to a strict sequential estimate.
  // -------------------------------------------------------------------------
  it("parallel-2 completes 4 50ms-batches in materially less wall time than sequential would", async () => {
    process.env.AI_DETECT_CONCURRENCY = "2";
    const PER_CALL_MS = 50;
    mockCreate.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, PER_CALL_MS));
      return {
        choices: [{ message: { content: JSON.stringify({ detections: [] }) } }],
      };
    });

    const pages = makeManyPages(12); // 4 batches at BATCH_SIZE=3
    const start = Date.now();
    await detectWithAI(pages, []);
    const elapsed = Date.now() - start;

    expect(mockCreate).toHaveBeenCalledTimes(4);

    // Sequential lower bound: 4 × 50ms = 200ms.
    // Parallel-2 lower bound: 2 rounds × 50ms = 100ms.
    // Allow generous overhead for CI: parallel-2 must be < 180ms, ie
    // strictly less than even the most generous sequential floor minus
    // some overhead margin. If this assertion ever flakes, raise the
    // 180 ceiling rather than dropping the test.
    expect(elapsed).toBeLessThan(180);
  });

  it("parallel-1 (concurrency forced to 1) preserves strictly-sequential ordering and timing", async () => {
    // Smoke for the regression case: setting AI_DETECT_CONCURRENCY=1
    // makes the limiter behave like a sequential loop. Useful for ops
    // dial-down without a redeploy. Wall time should match sequential
    // and the in-flight cap stays at 1.
    process.env.AI_DETECT_CONCURRENCY = "1";

    let inFlight = 0;
    let maxInFlight = 0;
    mockCreate.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return {
        choices: [{ message: { content: JSON.stringify({ detections: [] }) } }],
      };
    });

    const pages = makeManyPages(9); // 3 batches
    await detectWithAI(pages, []);

    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(maxInFlight).toBe(1);
  });
});

describe("buildSystemPrompt — cache-friendly ordering (Phase 3 PR A)", () => {
  // The stable prefix (type descriptions → grounds → worked examples →
  // JSON output spec) must come before any per-document classification
  // block so Azure OpenAI's prompt cache can key on the prefix. See
  // buildSystemPrompt doc-comment for the rationale.

  const jsonSpecMarker = 'Respond with a JSON object containing a "detections" array';
  const classificationMarker = "DOCUMENT CONTEXT (from pre-classification):";

  const classification: DocumentClassification = {
    documentType: "hr-investigation",
    likelyGrounds: ["s7(2)(a)", "s7(2)(f)(ii)"],
    contextNotes: "Grievance investigation with witness interviews.",
    containsLegalAdvice: false,
    containsPersonnelInfo: true,
    containsCommercialInfo: false,
    containsCulturalContent: false,
    containsEnforcementInfo: false,
  };

  it("appends the classification block AFTER the JSON output spec when provided", () => {
    const prompt = buildSystemPrompt(undefined, classification);
    const specIdx = prompt.indexOf(jsonSpecMarker);
    const classIdx = prompt.indexOf(classificationMarker);
    expect(specIdx, "JSON output spec block must be present").toBeGreaterThan(-1);
    expect(classIdx, "classification block must be present").toBeGreaterThan(-1);
    expect(classIdx).toBeGreaterThan(specIdx);
  });

  it("emits no document-context block when no classification is provided", () => {
    const prompt = buildSystemPrompt(undefined);
    expect(prompt.indexOf(classificationMarker)).toBe(-1);
    // Sanity — the stable prefix itself still renders.
    expect(prompt.indexOf(jsonSpecMarker)).toBeGreaterThan(-1);
  });
});
