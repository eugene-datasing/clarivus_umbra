import { describe, it, expect } from "vitest";
import { buildContent, type DetectionInput } from "../content-builder";
import type { ExtractedPage } from "../extract";

function makePage(pageNumber: number, text: string): ExtractedPage {
  return { pageNumber, text, words: [] };
}

function makeDetection(
  id: string,
  text: string,
  page: number,
  overrides: Partial<DetectionInput> = {},
): DetectionInput {
  return {
    id,
    type: "Name",
    text,
    page,
    confidence: 95,
    suggestedGround: null,
    ...overrides,
  };
}

describe("buildContent", () => {
  it("returns paragraphs with no detections", () => {
    const pages = [makePage(1, "Hello world.\n\nSecond paragraph.")];
    const result = buildContent(pages, []);

    expect(result.length).toBe(2);
    expect(result[0].segments).toEqual([{ text: "Hello world." }]);
    expect(result[1].segments).toEqual([{ text: "Second paragraph." }]);
  });

  it("highlights a detection within text", () => {
    const pages = [makePage(1, "Please contact John Smith for details.")];
    const detections = [makeDetection("d1", "John Smith", 1)];
    const result = buildContent(pages, detections);

    expect(result.length).toBe(1);
    const segs = result[0].segments;
    expect(segs.length).toBe(3);
    expect(segs[0]).toEqual({ text: "Please contact " });
    expect(segs[1]).toEqual({ text: "John Smith", detectionId: "d1" });
    expect(segs[2]).toEqual({ text: " for details." });
  });

  it("handles multiple non-overlapping detections", () => {
    const pages = [
      makePage(1, "Contact John Smith at john@example.com for info."),
    ];
    const detections = [
      makeDetection("d1", "John Smith", 1),
      makeDetection("d2", "john@example.com", 1, { type: "Email" }),
    ];
    const result = buildContent(pages, detections);
    const segs = result[0].segments;

    expect(segs.length).toBe(5);
    expect(segs[1]).toEqual({ text: "John Smith", detectionId: "d1" });
    expect(segs[3]).toEqual({ text: "john@example.com", detectionId: "d2" });
  });

  it("removes overlapping detections (first wins)", () => {
    const pages = [makePage(1, "Contact John Smith today.")];
    // Two detections overlap on "John Smith"
    const detections = [
      makeDetection("d1", "John Smith", 1),
      makeDetection("d2", "Smith today", 1),
    ];
    const result = buildContent(pages, detections);
    const segs = result[0].segments;

    // Only d1 should win since it comes first
    const detectionSegs = segs.filter((s) => s.detectionId);
    expect(detectionSegs.length).toBe(1);
    expect(detectionSegs[0].detectionId).toBe("d1");
  });

  it("handles case-insensitive matching", () => {
    const pages = [makePage(1, "See JOHN SMITH for more info.")];
    const detections = [makeDetection("d1", "john smith", 1)];
    const result = buildContent(pages, detections);
    const segs = result[0].segments;

    const detSeg = segs.find((s) => s.detectionId === "d1");
    expect(detSeg).toBeDefined();
    expect(detSeg!.text).toBe("JOHN SMITH");
  });

  it("assigns detections to correct pages", () => {
    const pages = [
      makePage(1, "Page one text with John Smith."),
      makePage(2, "Page two text with Jane Doe."),
    ];
    const detections = [
      makeDetection("d1", "John Smith", 1),
      makeDetection("d2", "Jane Doe", 2),
    ];
    const result = buildContent(pages, detections);

    const page1Segs = result
      .filter((p) => p.page === 1)
      .flatMap((p) => p.segments);
    const page2Segs = result
      .filter((p) => p.page === 2)
      .flatMap((p) => p.segments);

    expect(page1Segs.some((s) => s.detectionId === "d1")).toBe(true);
    expect(page1Segs.some((s) => s.detectionId === "d2")).toBe(false);
    expect(page2Segs.some((s) => s.detectionId === "d2")).toBe(true);
    expect(page2Segs.some((s) => s.detectionId === "d1")).toBe(false);
  });
});
