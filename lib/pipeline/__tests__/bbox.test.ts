import { describe, it, expect } from "vitest";
import { calculateBBox } from "../bbox";

interface WordLayout {
  text: string;
  confidence: number;
  polygon?: number[];
}

function makeWord(text: string, polygon?: number[]): WordLayout {
  return { text, confidence: 99, polygon };
}

describe("calculateBBox", () => {
  // -----------------------------------------------------------------------
  // Empty / no-match cases
  // -----------------------------------------------------------------------
  describe("empty inputs", () => {
    it("returns zeros for empty words array", () => {
      const result = calculateBBox("test", []);
      expect(result).toEqual({ posX: 0, posY: 0, posW: 0, posH: 0 });
    });

    it("returns zeros for empty detection text", () => {
      const words = [makeWord("hello", [0, 0, 10, 0, 10, 10, 0, 10])];
      const result = calculateBBox("", words);
      expect(result).toEqual({ posX: 0, posY: 0, posW: 0, posH: 0 });
    });

    it("returns zeros for whitespace-only detection text", () => {
      const words = [makeWord("hello", [0, 0, 10, 0, 10, 10, 0, 10])];
      const result = calculateBBox("   ", words);
      expect(result).toEqual({ posX: 0, posY: 0, posW: 0, posH: 0 });
    });

    it("returns zeros when words is undefined-ish", () => {
      const result = calculateBBox("test", null as unknown as WordLayout[]);
      expect(result).toEqual({ posX: 0, posY: 0, posW: 0, posH: 0 });
    });
  });

  // -----------------------------------------------------------------------
  // Single-word matching
  // -----------------------------------------------------------------------
  describe("single-word matching", () => {
    it("matches a single word exactly", () => {
      const words = [
        makeWord("hello", [10, 20, 50, 20, 50, 40, 10, 40]),
      ];
      const result = calculateBBox("hello", words);
      expect(result.posX).toBeGreaterThan(0);
      expect(result.posW).toBeGreaterThan(0);
    });

    it("matches case-insensitively", () => {
      const words = [
        makeWord("Hello", [10, 20, 50, 20, 50, 40, 10, 40]),
      ];
      const result = calculateBBox("hello", words);
      expect(result.posW).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Multi-word matching
  // -----------------------------------------------------------------------
  describe("multi-word matching", () => {
    it("matches consecutive words", () => {
      const words = [
        makeWord("John", [10, 10, 40, 10, 40, 30, 10, 30]),
        makeWord("Smith", [50, 10, 90, 10, 90, 30, 50, 30]),
      ];
      const result = calculateBBox("John Smith", words);
      // BBox should span from 10 to 90 horizontally
      expect(result.posX).toBe(10);
      expect(result.posW).toBe(80);
    });

    it("returns zeros when no matching sequence exists", () => {
      const words = [
        makeWord("Hello", [10, 10, 40, 10, 40, 30, 10, 30]),
        makeWord("World", [50, 10, 90, 10, 90, 30, 50, 30]),
      ];
      const result = calculateBBox("John Smith", words);
      expect(result).toEqual({ posX: 0, posY: 0, posW: 0, posH: 0 });
    });
  });

  // -----------------------------------------------------------------------
  // Coordinate normalization
  // -----------------------------------------------------------------------
  describe("coordinate normalization", () => {
    it("normalizes coordinates when page dimensions are provided", () => {
      const words = [
        makeWord("Hello", [100, 200, 200, 200, 200, 250, 100, 250]),
      ];
      const result = calculateBBox("Hello", words, 1000, 1000);
      // x: 100/1000 = 0.1, y: 200/1000 = 0.2
      // w: (200-100)/1000 = 0.1, h: (250-200)/1000 = 0.05
      expect(result.posX).toBe(0.1);
      expect(result.posY).toBe(0.2);
      expect(result.posW).toBe(0.1);
      expect(result.posH).toBe(0.05);
    });

    it("returns raw coordinates when no page dimensions", () => {
      const words = [
        makeWord("Hello", [100, 200, 200, 200, 200, 250, 100, 250]),
      ];
      const result = calculateBBox("Hello", words);
      expect(result.posX).toBe(100);
      expect(result.posY).toBe(200);
      expect(result.posW).toBe(100);
      expect(result.posH).toBe(50);
    });

    it("returns raw coordinates when page dimensions are zero", () => {
      const words = [
        makeWord("Hello", [100, 200, 200, 200, 200, 250, 100, 250]),
      ];
      const result = calculateBBox("Hello", words, 0, 0);
      expect(result.posX).toBe(100);
      expect(result.posY).toBe(200);
    });
  });

  // -----------------------------------------------------------------------
  // Words without polygons
  // -----------------------------------------------------------------------
  describe("words without polygon data", () => {
    it("returns zeros when matched words have no polygons", () => {
      const words = [makeWord("Hello")]; // no polygon
      const result = calculateBBox("Hello", words);
      expect(result).toEqual({ posX: 0, posY: 0, posW: 0, posH: 0 });
    });

    it("returns zeros when polygon has fewer than 8 values", () => {
      const words = [makeWord("Hello", [10, 20, 30])]; // too few
      const result = calculateBBox("Hello", words);
      expect(result).toEqual({ posX: 0, posY: 0, posW: 0, posH: 0 });
    });
  });

  // -----------------------------------------------------------------------
  // Sliding window behavior
  // -----------------------------------------------------------------------
  describe("sliding window", () => {
    it("finds a match that starts mid-array", () => {
      // The sliding window starts at each index, so starting at index 1:
      // concat = "quick" -> "quick brown" which includes "quick brown"
      // So it returns computeBoxFromWords(words[1..2])
      const words = [
        makeWord("The", [0, 0, 10, 0, 10, 10, 0, 10]),
        makeWord("quick", [20, 0, 40, 0, 40, 10, 20, 10]),
        makeWord("brown", [50, 0, 70, 0, 70, 10, 50, 10]),
        makeWord("fox", [80, 0, 100, 0, 100, 10, 80, 10]),
      ];
      const result = calculateBBox("quick brown", words);
      // The first window that contains "quick brown" starts at index 0:
      // "The" -> "The quick" -> "The quick brown" (contains target).
      // So it returns bbox for words[0..2], spanning x=0 to x=70.
      expect(result.posX).toBe(0);
      expect(result.posW).toBe(70);
    });
  });
});
