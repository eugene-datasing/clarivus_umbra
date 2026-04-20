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

import { detectWithAI } from "../ai-detect";

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
