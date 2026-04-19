import { describe, it, expect } from "vitest";
import { calculateBBoxAll } from "../bbox";

interface WordLayout {
  text: string;
  confidence: number;
  polygon?: number[];
}

function makeWord(text: string, polygon?: number[]): WordLayout {
  return { text, confidence: 99, polygon };
}

describe("calculateBBoxAll", () => {
  describe("empty inputs", () => {
    it("returns empty for empty words array", () => {
      const result = calculateBBoxAll("test", []);
      expect(result).toEqual([]);
    });

    it("returns empty for empty detection text", () => {
      const words = [makeWord("hello", [0, 0, 10, 0, 10, 10, 0, 10])];
      const result = calculateBBoxAll("", words);
      expect(result).toEqual([]);
    });

    it("returns empty for whitespace-only detection text", () => {
      const words = [makeWord("hello", [0, 0, 10, 0, 10, 10, 0, 10])];
      const result = calculateBBoxAll("   ", words);
      expect(result).toEqual([]);
    });

    it("returns empty when words is undefined-ish", () => {
      const result = calculateBBoxAll("test", null as unknown as WordLayout[]);
      expect(result).toEqual([]);
    });
  });

  describe("single-word matching", () => {
    it("matches a single word exactly", () => {
      const words = [
        makeWord("hello", [10, 20, 50, 20, 50, 40, 10, 40]),
      ];
      const result = calculateBBoxAll("hello", words);
      expect(result.length).toBe(1);
      expect(result[0].posX).toBeGreaterThan(0);
      expect(result[0].posW).toBeGreaterThan(0);
    });

    it("matches case-insensitively", () => {
      const words = [
        makeWord("Hello", [10, 20, 50, 20, 50, 40, 10, 40]),
      ];
      const result = calculateBBoxAll("hello", words);
      expect(result.length).toBe(1);
      expect(result[0].posW).toBeGreaterThan(0);
    });
  });

  describe("multi-word matching", () => {
    it("matches consecutive words", () => {
      const words = [
        makeWord("John", [10, 10, 40, 10, 40, 30, 10, 30]),
        makeWord("Smith", [50, 10, 90, 10, 90, 30, 50, 30]),
      ];
      const result = calculateBBoxAll("John Smith", words);
      expect(result.length).toBe(1);
      expect(result[0].posX).toBe(10);
      expect(result[0].posW).toBe(80);
    });

    it("returns empty when no matching sequence exists", () => {
      const words = [
        makeWord("Hello", [10, 10, 40, 10, 40, 30, 10, 30]),
        makeWord("World", [50, 10, 90, 10, 90, 30, 50, 30]),
      ];
      const result = calculateBBoxAll("John Smith", words);
      expect(result).toEqual([]);
    });
  });

  describe("coordinate normalization", () => {
    it("normalizes coordinates when page dimensions are provided", () => {
      const words = [
        makeWord("Hello", [100, 200, 200, 200, 200, 250, 100, 250]),
      ];
      const result = calculateBBoxAll("Hello", words, 1000, 1000);
      // x: 100/1000 = 10%, y: 200/1000 = 20%
      // w: (200-100)/1000 = 10%, h: (250-200)/1000 = 5%
      expect(result.length).toBe(1);
      expect(result[0].posX).toBe(10);
      expect(result[0].posY).toBe(20);
      expect(result[0].posW).toBe(10);
      expect(result[0].posH).toBe(5);
    });

    it("returns raw coordinates when no page dimensions", () => {
      const words = [
        makeWord("Hello", [100, 200, 200, 200, 200, 250, 100, 250]),
      ];
      const result = calculateBBoxAll("Hello", words);
      expect(result.length).toBe(1);
      expect(result[0].posX).toBe(100);
      expect(result[0].posY).toBe(200);
      expect(result[0].posW).toBe(100);
      expect(result[0].posH).toBe(50);
    });
  });

  describe("Phase 2 shortcut removal — no phantom (0,0,0,0) rows", () => {
    it("returns [] when all matched words collapse to zero-area polygons", () => {
      // Pre-Phase-2 this case returned [{ posX: 0, posY: 0, posW: 0, posH: 0 }]
      // so non-PDF detections still produced a Detection row. Post-Phase-2
      // we prefer dropping the detection to persisting a phantom row with
      // no redactable coordinates (see lib/pipeline/bbox.ts line 70 comment).
      const degeneratePolygon = [5, 5, 5, 5, 5, 5, 5, 5]; // single point × 4
      const words = [makeWord("hello", degeneratePolygon)];
      const result = calculateBBoxAll("hello", words, 1000, 1000);
      expect(result).toEqual([]);
    });

    it("returns [] for a multi-word match where every word is zero-area", () => {
      const zero = [0, 0, 0, 0, 0, 0, 0, 0];
      const words = [makeWord("John", zero), makeWord("Smith", zero)];
      const result = calculateBBoxAll("John Smith", words, 1000, 1000);
      expect(result).toEqual([]);
    });
  });

  describe("words without polygon data", () => {
    it("returns empty when matched words have no polygons", () => {
      const words = [makeWord("Hello")]; // no polygon
      const result = calculateBBoxAll("Hello", words);
      expect(result).toEqual([]);
    });

    it("returns empty when polygon has fewer than 8 values", () => {
      const words = [makeWord("Hello", [10, 20, 30])]; // too few
      const result = calculateBBoxAll("Hello", words);
      expect(result).toEqual([]);
    });
  });

  describe("sliding window", () => {
    it("finds a match that starts mid-array", () => {
      const words = [
        makeWord("The", [0, 0, 10, 0, 10, 10, 0, 10]),
        makeWord("quick", [20, 0, 40, 0, 40, 10, 20, 10]),
        makeWord("brown", [50, 0, 70, 0, 70, 10, 50, 10]),
        makeWord("fox", [80, 0, 100, 0, 100, 10, 80, 10]),
      ];
      const result = calculateBBoxAll("quick brown", words);
      expect(result.length).toBe(1);
      expect(result[0].posX).toBe(20);
      expect(result[0].posW).toBe(50);
    });
  });
});
