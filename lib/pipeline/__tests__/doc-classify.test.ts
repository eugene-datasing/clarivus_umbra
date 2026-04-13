import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtractedPage } from "../extract";

// ---------------------------------------------------------------------------
// Shared mock for the OpenAI client's chat.completions.create method.
// All instances of AzureOpenAI will share this single mock function.
// ---------------------------------------------------------------------------
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

// Set env vars before importing the module
process.env.AZURE_OPENAI_ENDPOINT = "https://test.openai.azure.com";
process.env.AZURE_OPENAI_KEY = "test-key";
process.env.AZURE_OPENAI_DEPLOYMENT = "gpt-4o";

import {
  classifyDocument,
  buildClassificationSummary,
  DEFAULT_CLASSIFICATION,
} from "../doc-classify";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePage(pageNumber: number, text: string): ExtractedPage {
  return { pageNumber, text, words: [] };
}

function makePages(count: number, charsPer = 600): ExtractedPage[] {
  return Array.from({ length: count }, (_, i) =>
    makePage(i + 1, "x".repeat(charsPer) + ` page ${i + 1}`),
  );
}

// ---------------------------------------------------------------------------
// Tests — buildClassificationSummary
// ---------------------------------------------------------------------------

describe("buildClassificationSummary", () => {
  it("returns empty string for empty pages array", () => {
    expect(buildClassificationSummary([])).toBe("");
  });

  it("includes only first page excerpt for a single page", () => {
    const pages = [makePage(1, "Hello world. This is page one.")];
    const summary = buildClassificationSummary(pages);
    expect(summary).toContain("[Page 1 excerpt]");
    expect(summary).toContain("Hello world");
    expect(summary).not.toContain("(last)");
    expect(summary).not.toContain("(middle)");
  });

  it("includes first and last page for 2-page document", () => {
    const pages = [
      makePage(1, "First page content"),
      makePage(2, "Last page content"),
    ];
    const summary = buildClassificationSummary(pages);
    expect(summary).toContain("[Page 1 excerpt]");
    expect(summary).toContain("[Page 2 excerpt (last)]");
    expect(summary).not.toContain("(middle)");
  });

  it("includes first and last but NOT middle page for 5-page document", () => {
    const pages = makePages(5);
    const summary = buildClassificationSummary(pages);
    expect(summary).toContain("[Page 1 excerpt]");
    expect(summary).toContain("(last)");
    expect(summary).not.toContain("(middle)");
  });

  it("includes first, middle, and last page for 7-page document", () => {
    const pages = makePages(7);
    const summary = buildClassificationSummary(pages);
    expect(summary).toContain("[Page 1 excerpt]");
    expect(summary).toContain("(middle)");
    expect(summary).toContain("(last)");
  });

  it("includes first, middle, and last page for 10-page document", () => {
    const pages = makePages(10);
    const summary = buildClassificationSummary(pages);
    expect(summary).toContain("[Page 1 excerpt]");
    // Math.floor(10/2) = 5 → index 5 → pageNumber 6
    expect(summary).toContain("[Page 6 excerpt (middle)]");
    expect(summary).toContain("[Page 10 excerpt (last)]");
  });

  it("truncates first page to 500 characters", () => {
    const longText = "A".repeat(1000);
    const pages = [makePage(1, longText), makePage(2, "short")];
    const summary = buildClassificationSummary(pages);
    const firstExcerpt = summary.split("[Page 2")[0];
    const aCount = (firstExcerpt.match(/A/g) || []).length;
    expect(aCount).toBe(500);
  });

  it("truncates last page to 200 characters", () => {
    const pages = [
      makePage(1, "First"),
      makePage(2, "B".repeat(500)),
    ];
    const summary = buildClassificationSummary(pages);
    const lastSection = summary.split("(last)")[1] || "";
    const bCount = (lastSection.match(/B/g) || []).length;
    expect(bCount).toBe(200);
  });

  it("truncates middle page to 200 characters", () => {
    const pages = makePages(8);
    // Math.floor(8/2) = 4 → index 4 → page 5; override it with long text
    pages[4] = makePage(5, "M".repeat(500));
    const summary = buildClassificationSummary(pages);
    const middleSection = summary.split("(middle)")[1]?.split("[Page")[0] || "";
    const mCount = (middleSection.match(/M/g) || []).length;
    expect(mCount).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Tests — classifyDocument
// ---------------------------------------------------------------------------

describe("classifyDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns defaults for empty pages array", async () => {
    const result = await classifyDocument([]);
    expect(result).toEqual(DEFAULT_CLASSIFICATION);
  });

  it("returns defaults when page text is too short", async () => {
    const pages = [makePage(1, "hi")];
    const result = await classifyDocument(pages);
    expect(result).toEqual(DEFAULT_CLASSIFICATION);
  });

  it("returns defaults when the API call fails", async () => {
    mockCreate.mockRejectedValueOnce(new Error("API error"));

    const pages = [makePage(1, "Enough text to trigger an API call for the classification step")];
    const result = await classifyDocument(pages);
    expect(result).toEqual(DEFAULT_CLASSIFICATION);
  });

  it("returns defaults when API returns empty content", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
    });

    const pages = [makePage(1, "Enough text to trigger an API call for the classification step")];
    const result = await classifyDocument(pages);
    expect(result).toEqual(DEFAULT_CLASSIFICATION);
  });

  it("returns defaults when API returns invalid JSON", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "not json" } }],
    });

    const pages = [makePage(1, "Enough text to trigger an API call for the classification step")];
    const result = await classifyDocument(pages);
    expect(result).toEqual(DEFAULT_CLASSIFICATION);
  });

  it("parses a valid classification response", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            documentType: "legal-opinion",
            likelyGrounds: ["s7(2)(g)", "s7(2)(a)"],
            contextNotes: "Legal advice from council solicitor regarding resource consent appeal",
            containsLegalAdvice: true,
            containsPersonnelInfo: false,
            containsCommercialInfo: false,
            containsCulturalContent: false,
            containsEnforcementInfo: false,
          }),
        },
      }],
    });

    const pages = [makePage(1, "Privileged and confidential legal opinion from Simpson Grierson re: resource consent RC-2024-0142")];
    const result = await classifyDocument(pages);

    expect(result.documentType).toBe("legal-opinion");
    expect(result.likelyGrounds).toEqual(["s7(2)(g)", "s7(2)(a)"]);
    expect(result.containsLegalAdvice).toBe(true);
    expect(result.containsPersonnelInfo).toBe(false);
    expect(result.contextNotes).toContain("Legal advice");
  });

  it("falls back to 'other' for unrecognised document type", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            documentType: "alien-transmission",
            likelyGrounds: ["s6(a)"],
            contextNotes: "Unknown",
            containsLegalAdvice: false,
            containsPersonnelInfo: false,
            containsCommercialInfo: false,
            containsCulturalContent: false,
            containsEnforcementInfo: false,
          }),
        },
      }],
    });

    const pages = [makePage(1, "Enough text to trigger an API call for the classification step")];
    const result = await classifyDocument(pages);
    expect(result.documentType).toBe("other");
  });

  it("truncates likelyGrounds to 4 entries", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            documentType: "internal-memo",
            likelyGrounds: ["s7(2)(a)", "s7(2)(f)(i)", "s7(2)(g)", "s6(c)", "s7(2)(b)(ii)", "s7(2)(j)"],
            contextNotes: "test",
            containsLegalAdvice: false,
            containsPersonnelInfo: false,
            containsCommercialInfo: false,
            containsCulturalContent: false,
            containsEnforcementInfo: false,
          }),
        },
      }],
    });

    const pages = [makePage(1, "Enough text to trigger an API call for the classification step")];
    const result = await classifyDocument(pages);
    expect(result.likelyGrounds).toHaveLength(4);
  });

  it("handles boolean fields defaulting to false for non-boolean values", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            documentType: "other",
            likelyGrounds: [],
            contextNotes: "",
            containsLegalAdvice: "yes",
            containsPersonnelInfo: 1,
            containsCommercialInfo: null,
            containsCulturalContent: undefined,
            containsEnforcementInfo: false,
          }),
        },
      }],
    });

    const pages = [makePage(1, "Enough text to trigger an API call for the classification step")];
    const result = await classifyDocument(pages);
    expect(result.containsLegalAdvice).toBe(false);
    expect(result.containsPersonnelInfo).toBe(false);
    expect(result.containsCommercialInfo).toBe(false);
    expect(result.containsCulturalContent).toBe(false);
  });
});
