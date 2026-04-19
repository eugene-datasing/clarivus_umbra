import { describe, it, expect, vi, beforeEach } from "vitest";
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
