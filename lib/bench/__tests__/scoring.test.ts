import { describe, it, expect } from "vitest";
import {
  scoreFixture,
  type ActualDetection,
  type ExpectedDetection,
  type ExpectedFixture,
} from "../scoring";

function exp(
  text: string,
  type: string,
  mustMatch: "exact" | "substring" = "exact",
  overrides: Partial<ExpectedDetection> = {},
): ExpectedDetection {
  return { text, type, mustMatch, ...overrides };
}

function actual(
  text: string,
  type: string,
  page = 1,
  overrides: Partial<ActualDetection> = {},
): ActualDetection {
  return { text, type, page, ...overrides };
}

function fixture(expectedDetections: ExpectedDetection[]): ExpectedFixture {
  return {
    documentType: "test",
    expectedDetections,
  };
}

describe("scoreFixture — matching semantics", () => {
  it("exact match with identical text and type → 1 TP, precision=recall=F1=1", () => {
    const score = scoreFixture(
      "t",
      fixture([exp("John Smith", "personal-name", "exact")]),
      [actual("John Smith", "personal-name")],
    );
    expect(score.overall.tp).toBe(1);
    expect(score.overall.fp).toBe(0);
    expect(score.overall.fn).toBe(0);
    expect(score.overall.precision).toBe(1);
    expect(score.overall.recall).toBe(1);
    expect(score.overall.f1).toBe(1);
    expect(score.missing).toHaveLength(0);
    expect(score.unexpected).toHaveLength(0);
  });

  it("exact match is case-insensitive and whitespace-collapsed", () => {
    const score = scoreFixture(
      "t",
      fixture([exp("John Smith", "personal-name", "exact")]),
      [actual("  JOHN   smith  ", "personal-name")],
    );
    expect(score.overall.tp).toBe(1);
  });

  it("substring match: actual contains expected", () => {
    const score = scoreFixture(
      "t",
      fixture([exp("Ferguson", "personal-name", "substring")]),
      [actual("Ms Ferguson said so", "personal-name")],
    );
    expect(score.overall.tp).toBe(1);
    expect(score.overall.fp).toBe(0);
  });

  it("type mismatch → no match (1 FN, 1 FP)", () => {
    const score = scoreFixture(
      "t",
      fixture([exp("Classified info", "confidential", "exact")]),
      [actual("Classified info", "personal-name")],
    );
    expect(score.overall.tp).toBe(0);
    expect(score.overall.fn).toBe(1);
    expect(score.overall.fp).toBe(1);
    expect(score.missing).toHaveLength(1);
    expect(score.unexpected).toHaveLength(1);
  });

  it("different text → 1 FN + 1 FP", () => {
    const score = scoreFixture(
      "t",
      fixture([exp("John Smith", "personal-name", "exact")]),
      [actual("Jane Doe", "personal-name")],
    );
    expect(score.overall.tp).toBe(0);
    expect(score.overall.fn).toBe(1);
    expect(score.overall.fp).toBe(1);
  });

  it("multiple expected: some match, some don't → correct TP/FN/FP split", () => {
    const score = scoreFixture(
      "t",
      fixture([
        exp("John Smith", "personal-name", "exact"),
        exp("jane@example.com", "email-addr", "exact"),
        exp("$55,000 settlement", "legal-privilege", "substring"),
      ]),
      [
        actual("John Smith", "personal-name"),
        actual("jane@example.com", "email-addr"),
        // miss: no legal-privilege detection
        actual("021 456 7890", "phone"), // unexpected
      ],
    );
    expect(score.overall.tp).toBe(2);
    expect(score.overall.fn).toBe(1);
    expect(score.overall.fp).toBe(1);
  });

  it("page filter enforced when expected.page is set", () => {
    const score = scoreFixture(
      "t",
      fixture([
        exp("John Smith", "personal-name", "exact", { page: 2 }),
      ]),
      [actual("John Smith", "personal-name", 1)],
    );
    expect(score.overall.tp).toBe(0);
    expect(score.overall.fn).toBe(1);
    expect(score.overall.fp).toBe(1);
  });

  it("page filter ignored when expected.page is absent", () => {
    const score = scoreFixture(
      "t",
      fixture([exp("John Smith", "personal-name", "exact")]),
      [actual("John Smith", "personal-name", 99)],
    );
    expect(score.overall.tp).toBe(1);
  });

  it("first-match-wins: two expected entries with same text but different pages; actual only matches one", () => {
    const score = scoreFixture(
      "t",
      fixture([
        exp("John Smith", "personal-name", "exact", { page: 1 }),
        exp("John Smith", "personal-name", "exact", { page: 3 }),
      ]),
      [actual("John Smith", "personal-name", 1)],
    );
    expect(score.overall.tp).toBe(1);
    expect(score.overall.fn).toBe(1);
    expect(score.overall.fp).toBe(0);
    expect(score.missing).toHaveLength(1);
    expect(score.missing[0].page).toBe(3);
  });

  it("first-match-wins: two actuals matching same expected → one TP, one FP", () => {
    const score = scoreFixture(
      "t",
      fixture([exp("John Smith", "personal-name", "exact")]),
      [
        actual("John Smith", "personal-name", 1),
        actual("John Smith", "personal-name", 2),
      ],
    );
    expect(score.overall.tp).toBe(1);
    expect(score.overall.fp).toBe(1);
    expect(score.overall.fn).toBe(0);
  });
});

describe("scoreFixture — pathway aggregation", () => {
  it("3 personal expected + 1 context expected → correct per-pathway split", () => {
    const score = scoreFixture(
      "t",
      fixture([
        exp("Alice", "personal-name", "exact"),
        exp("a@x.com", "email-addr", "exact"),
        exp("021 111 2222", "phone", "exact"),
        exp("on a performance improvement plan", "sensitive-context", "substring"),
      ]),
      [
        actual("Alice", "personal-name"),
        actual("a@x.com", "email-addr"),
        // miss: phone
        // miss: sensitive-context
        actual("unexpected diagnosis", "sensitive-context"), // FP → context pathway
      ],
    );
    expect(score.byPathway.personal.tp).toBe(2);
    expect(score.byPathway.personal.fn).toBe(1);
    expect(score.byPathway.personal.fp).toBe(0);

    expect(score.byPathway.context.tp).toBe(0);
    expect(score.byPathway.context.fn).toBe(1);
    expect(score.byPathway.context.fp).toBe(1);
  });

  it("unknown actual type is counted in overall FP but not any pathway FP", () => {
    const score = scoreFixture(
      "t",
      fixture([exp("Alice", "personal-name", "exact")]),
      [
        actual("Alice", "personal-name"),
        actual("random-thing", "not-a-real-type"),
      ],
    );
    expect(score.overall.tp).toBe(1);
    expect(score.overall.fp).toBe(1);
    // Phase 12.1 — pathways collapsed to personal + context. Unknown-
    // type FP still lands nowhere (consistent with v1 convention).
    expect(score.byPathway.personal.fp).toBe(0);
    expect(score.byPathway.context.fp).toBe(0);
  });
});

describe("scoreFixture — empty edge cases", () => {
  it("empty expected + empty actual → precision=1, recall=1, f1=1", () => {
    const score = scoreFixture("t", fixture([]), []);
    expect(score.overall.precision).toBe(1);
    expect(score.overall.recall).toBe(1);
    expect(score.overall.f1).toBe(1);
    expect(score.overall.tp).toBe(0);
  });

  it("empty expected + non-empty actual → precision=0 (all FP), recall vacuous=1, f1=0", () => {
    const score = scoreFixture("t", fixture([]), [
      actual("surprise", "personal-name"),
    ]);
    expect(score.overall.precision).toBe(0);
    expect(score.overall.recall).toBe(1); // nothing to miss
    expect(score.overall.f1).toBe(0);
    expect(score.overall.fp).toBe(1);
  });

  it("non-empty expected + empty actual → recall=0, precision vacuous=1, f1=0", () => {
    const score = scoreFixture(
      "t",
      fixture([exp("Alice", "personal-name", "exact")]),
      [],
    );
    expect(score.overall.recall).toBe(0);
    expect(score.overall.precision).toBe(1);
    expect(score.overall.f1).toBe(0);
    expect(score.overall.fn).toBe(1);
  });
});
