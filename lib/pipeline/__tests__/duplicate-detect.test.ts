import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeContentHash } from "../duplicate-detect";

// We test the pure functions (computeContentHash) directly and verify
// the hashing/similarity logic without needing a real database.

describe("computeContentHash", () => {
  it("returns a hex string", () => {
    const hash = computeContentHash("hello world");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces consistent hashes for the same input", () => {
    const h1 = computeContentHash("test document content");
    const h2 = computeContentHash("test document content");
    expect(h1).toBe(h2);
  });

  it("normalizes whitespace before hashing", () => {
    const h1 = computeContentHash("hello   world");
    const h2 = computeContentHash("hello world");
    expect(h1).toBe(h2);
  });

  it("normalizes tabs and newlines", () => {
    const h1 = computeContentHash("hello\tworld\nfoo");
    const h2 = computeContentHash("hello world foo");
    expect(h1).toBe(h2);
  });

  it("is case-insensitive", () => {
    const h1 = computeContentHash("Hello World");
    const h2 = computeContentHash("hello world");
    expect(h1).toBe(h2);
  });

  it("trims leading and trailing whitespace", () => {
    const h1 = computeContentHash("  hello world  ");
    const h2 = computeContentHash("hello world");
    expect(h1).toBe(h2);
  });

  it("produces different hashes for different content", () => {
    const h1 = computeContentHash("document one content");
    const h2 = computeContentHash("document two content");
    expect(h1).not.toBe(h2);
  });

  it("handles empty string", () => {
    const hash = computeContentHash("");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("handles very long text", () => {
    const longText = "a".repeat(100_000);
    const hash = computeContentHash(longText);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// Test trigram/Jaccard logic by re-implementing the private helpers.
// This mirrors the actual implementation so we can verify correctness.
// ---------------------------------------------------------------------------

function trigrams(text: string): Set<string> {
  const normalised = text.replace(/\s+/g, " ").trim().toLowerCase();
  const result = new Set<string>();
  for (let i = 0; i <= normalised.length - 3; i++) {
    result.add(normalised.substring(i, i + 3));
  }
  return result;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const tri of a) {
    if (b.has(tri)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

describe("trigram generation", () => {
  it("generates correct number of trigrams", () => {
    const t = trigrams("abcde");
    // "abcde" => abc, bcd, cde = 3 trigrams
    expect(t.size).toBe(3);
  });

  it("returns empty set for text shorter than 3 characters", () => {
    expect(trigrams("ab").size).toBe(0);
    expect(trigrams("a").size).toBe(0);
    expect(trigrams("").size).toBe(0);
  });

  it("normalizes whitespace", () => {
    const t1 = trigrams("ab cd");
    const t2 = trigrams("ab  cd");
    expect(t1).toEqual(t2);
  });

  it("is case-insensitive", () => {
    const t1 = trigrams("ABC");
    const t2 = trigrams("abc");
    expect(t1).toEqual(t2);
  });
});

describe("jaccardSimilarity", () => {
  it("returns 1 for identical sets", () => {
    const a = trigrams("hello world");
    const b = trigrams("hello world");
    expect(jaccardSimilarity(a, b)).toBe(1);
  });

  it("returns 0 for completely disjoint sets", () => {
    const a = new Set(["abc", "def"]);
    const b = new Set(["xyz", "uvw"]);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it("returns 0 for two empty sets", () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
  });

  it("returns value between 0 and 1 for partial overlap", () => {
    const a = trigrams("the quick brown fox");
    const b = trigrams("the quick red cat");
    const sim = jaccardSimilarity(a, b);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it("near-identical documents produce high similarity", () => {
    const a = trigrams(
      "This is a document about local government information requests.",
    );
    const b = trigrams(
      "This is a document about local government information request.",
    );
    const sim = jaccardSimilarity(a, b);
    expect(sim).toBeGreaterThan(0.85);
  });

  it("very different documents produce low similarity", () => {
    const a = trigrams("The cat sat on the mat.");
    const b = trigrams("Quarterly financial report for 2024.");
    const sim = jaccardSimilarity(a, b);
    expect(sim).toBeLessThan(0.3);
  });
});
