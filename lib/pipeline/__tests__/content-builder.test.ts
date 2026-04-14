import { describe, it, expect, vi } from "vitest";
import { buildContent, buildContentFromBlocks, verifyDetectionCoverage, type DetectionInput } from "../content-builder";
import type { ContentBlock } from "../format-converter";
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

// ---------------------------------------------------------------------------
// buildContentFromBlocks tests
// ---------------------------------------------------------------------------

function makeBlock(type: ContentBlock["type"], content: string, level?: number): ContentBlock {
  return { type, content, ...(level !== undefined ? { level } : {}) };
}

describe("buildContentFromBlocks", () => {
  it("converts heading blocks with correct type and level", () => {
    const blocks: ContentBlock[] = [
      makeBlock("heading", "Introduction", 2),
      makeBlock("heading", "Background", 3),
    ];
    const result = buildContentFromBlocks(blocks, []);

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("heading");
    expect(result[0].level).toBe(2);
    expect(result[0].segments).toEqual([{ text: "Introduction" }]);
    expect(result[1].type).toBe("heading");
    expect(result[1].level).toBe(3);
    expect(result[1].segments).toEqual([{ text: "Background" }]);
  });

  it("defaults heading level to 2 when not specified", () => {
    const blocks: ContentBlock[] = [makeBlock("heading", "Title")];
    const result = buildContentFromBlocks(blocks, []);

    expect(result[0].level).toBe(2);
  });

  it("converts paragraph blocks", () => {
    const blocks: ContentBlock[] = [
      makeBlock("paragraph", "This is a paragraph."),
    ];
    const result = buildContentFromBlocks(blocks, []);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("paragraph");
    expect(result[0].segments).toEqual([{ text: "This is a paragraph." }]);
  });

  it("converts list blocks with items", () => {
    const blocks: ContentBlock[] = [
      makeBlock("list", "Item one\nItem two\nItem three"),
    ];
    const result = buildContentFromBlocks(blocks, []);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("list");
    expect(result[0].listStyle).toBe("bullet");
    expect(result[0].items).toHaveLength(3);
    expect(result[0].items![0].segments).toEqual([{ text: "Item one" }]);
    expect(result[0].items![1].segments).toEqual([{ text: "Item two" }]);
    expect(result[0].items![2].segments).toEqual([{ text: "Item three" }]);
  });

  it("converts image-placeholder blocks", () => {
    const blocks: ContentBlock[] = [
      makeBlock("image-placeholder", "[Embedded image]"),
    ];
    const result = buildContentFromBlocks(blocks, []);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("image");
    expect(result[0].segments).toEqual([{ text: "[Embedded image]" }]);
  });

  it("converts table blocks with header and data rows", () => {
    const blocks: ContentBlock[] = [
      makeBlock("table", "Name\tAge\tCity\nJohn\t30\tAuckland"),
    ];
    const result = buildContentFromBlocks(blocks, []);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("table");
    expect(result[0].segments).toEqual([]); // tables use rows, not segments
    expect(result[0].rows).toHaveLength(2);

    // Header row (first row)
    const headerRow = result[0].rows![0];
    expect(headerRow.cells).toHaveLength(3);
    expect(headerRow.cells[0].isHeader).toBe(true);
    expect(headerRow.cells[0].segments).toEqual([{ text: "Name" }]);
    expect(headerRow.cells[1].isHeader).toBe(true);
    expect(headerRow.cells[1].segments).toEqual([{ text: "Age" }]);
    expect(headerRow.cells[2].isHeader).toBe(true);
    expect(headerRow.cells[2].segments).toEqual([{ text: "City" }]);

    // Data row
    const dataRow = result[0].rows![1];
    expect(dataRow.cells).toHaveLength(3);
    expect(dataRow.cells[0].isHeader).toBeUndefined();
    expect(dataRow.cells[0].segments).toEqual([{ text: "John" }]);
    expect(dataRow.cells[1].segments).toEqual([{ text: "30" }]);
    expect(dataRow.cells[2].segments).toEqual([{ text: "Auckland" }]);
  });

  it("matches detections at cell level in tables", () => {
    const blocks: ContentBlock[] = [
      makeBlock("table", "Name\tEmail\nJohn Smith\tjohn@example.com"),
    ];
    const detections = [
      makeDetection("d1", "John Smith", 1),
      makeDetection("d2", "john@example.com", 1, { type: "Email" }),
    ];
    const result = buildContentFromBlocks(blocks, detections);

    expect(result[0].type).toBe("table");
    const dataRow = result[0].rows![1];

    // "John Smith" cell should have detection d1
    expect(dataRow.cells[0].segments).toEqual([
      { text: "John Smith", detectionId: "d1" },
    ]);
    // "john@example.com" cell should have detection d2
    expect(dataRow.cells[1].segments).toEqual([
      { text: "john@example.com", detectionId: "d2" },
    ]);
  });

  it("pads uneven row cell counts to max columns", () => {
    const blocks: ContentBlock[] = [
      makeBlock("table", "A\tB\tC\nX\tY"),
    ];
    const result = buildContentFromBlocks(blocks, []);

    expect(result[0].rows).toHaveLength(2);
    // Both rows should have 3 cells
    expect(result[0].rows![0].cells).toHaveLength(3);
    expect(result[0].rows![1].cells).toHaveLength(3);
    // Padded cell should have empty segments
    expect(result[0].rows![1].cells[2].segments).toEqual([]);
  });

  it("produces empty segments for empty cells", () => {
    const blocks: ContentBlock[] = [
      makeBlock("table", "Name\t\tCity\nJohn\t\tAuckland"),
    ];
    const result = buildContentFromBlocks(blocks, []);

    // Middle cell of each row is empty
    expect(result[0].rows![0].cells[1].segments).toEqual([]);
    expect(result[0].rows![1].cells[1].segments).toEqual([]);
  });

  it("skips table block with empty content", () => {
    const blocks: ContentBlock[] = [
      makeBlock("table", "   \n  \n"),
    ];
    const result = buildContentFromBlocks(blocks, []);

    expect(result).toHaveLength(0);
  });

  it("preserves detection highlights within heading blocks", () => {
    const blocks: ContentBlock[] = [
      makeBlock("heading", "Report by John Smith", 2),
    ];
    const detections = [makeDetection("d1", "John Smith", 1)];
    const result = buildContentFromBlocks(blocks, detections);

    expect(result[0].type).toBe("heading");
    expect(result[0].segments).toHaveLength(2);
    expect(result[0].segments[0]).toEqual({ text: "Report by " });
    expect(result[0].segments[1]).toEqual({ text: "John Smith", detectionId: "d1" });
  });

  it("preserves detection highlights within list items", () => {
    const blocks: ContentBlock[] = [
      makeBlock("list", "Contact John Smith\nCall Jane Doe"),
    ];
    const detections = [
      makeDetection("d1", "John Smith", 1),
      makeDetection("d2", "Jane Doe", 1),
    ];
    const result = buildContentFromBlocks(blocks, detections);

    expect(result[0].type).toBe("list");
    const item1Segs = result[0].items![0].segments;
    const item2Segs = result[0].items![1].segments;

    expect(item1Segs.some((s) => s.detectionId === "d1")).toBe(true);
    expect(item2Segs.some((s) => s.detectionId === "d2")).toBe(true);
  });

  it("handles a realistic mix of block types including table", () => {
    const blocks: ContentBlock[] = [
      makeBlock("heading", "1. SUMMARY", 2),
      makeBlock("paragraph", "This document concerns John Smith and his employment."),
      makeBlock("heading", "2. DETAILS", 2),
      makeBlock("list", "Phone: 021 544 908\nEmail: john@example.com"),
      makeBlock("table", "Role\tDepartment\nManager\tFinance"),
      makeBlock("image-placeholder", "[Embedded image]"),
      makeBlock("paragraph", "End of document."),
    ];
    const detections = [
      makeDetection("d1", "John Smith", 1),
      makeDetection("d2", "021 544 908", 1, { type: "Phone" }),
      makeDetection("d3", "john@example.com", 1, { type: "Email" }),
    ];
    const result = buildContentFromBlocks(blocks, detections);

    expect(result).toHaveLength(7);
    expect(result[0].type).toBe("heading");
    expect(result[1].type).toBe("paragraph");
    expect(result[2].type).toBe("heading");
    expect(result[3].type).toBe("list");
    expect(result[4].type).toBe("table");
    expect(result[5].type).toBe("image");
    expect(result[6].type).toBe("paragraph");

    // Check detection in paragraph
    expect(result[1].segments.some((s) => s.detectionId === "d1")).toBe(true);
    // Check detections in list items
    expect(result[3].items![0].segments.some((s) => s.detectionId === "d2")).toBe(true);
    expect(result[3].items![1].segments.some((s) => s.detectionId === "d3")).toBe(true);
    // Check table structure
    expect(result[4].rows).toHaveLength(2);
    expect(result[4].rows![0].cells[0].segments).toEqual([{ text: "Role" }]);
  });

  it("assigns the provided page number", () => {
    const blocks: ContentBlock[] = [makeBlock("paragraph", "Hello")];
    const result = buildContentFromBlocks(blocks, [], 3);

    expect(result[0].page).toBe(3);
  });

  it("handles metadata blocks as paragraphs", () => {
    const blocks: ContentBlock[] = [
      makeBlock("metadata", "[Email Headers]\nFrom: john@example.com"),
    ];
    const result = buildContentFromBlocks(blocks, []);

    expect(result[0].type).toBe("paragraph");
  });

  it("returns empty array for empty blocks", () => {
    expect(buildContentFromBlocks([], [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// verifyDetectionCoverage tests
// ---------------------------------------------------------------------------

describe("verifyDetectionCoverage", () => {
  it("returns empty array when all detections are matched", () => {
    const content = buildContentFromBlocks(
      [makeBlock("paragraph", "Contact John Smith today.")],
      [makeDetection("d1", "John Smith", 1)],
    );
    const unmatched = verifyDetectionCoverage(content, [makeDetection("d1", "John Smith", 1)]);
    expect(unmatched).toHaveLength(0);
  });

  it("reports unmatched detections without throwing", () => {
    const content = buildContentFromBlocks(
      [makeBlock("paragraph", "No matching text here.")],
      [],
    );
    const detections = [makeDetection("d1", "John Smith", 1)];
    const unmatched = verifyDetectionCoverage(content, detections);
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]).toContain("d1");
    expect(unmatched[0]).toContain("John Smith");
  });

  it("finds detections matched within list items", () => {
    const detections = [makeDetection("d1", "John Smith", 1)];
    const content = buildContentFromBlocks(
      [makeBlock("list", "Contact John Smith\nCall someone else")],
      detections,
    );
    const unmatched = verifyDetectionCoverage(content, detections);
    expect(unmatched).toHaveLength(0);
  });

  it("finds detections matched within table cells", () => {
    const detections = [
      makeDetection("d1", "John Smith", 1),
      makeDetection("d2", "john@example.com", 1, { type: "Email" }),
    ];
    const content = buildContentFromBlocks(
      [makeBlock("table", "Name\tEmail\nJohn Smith\tjohn@example.com")],
      detections,
    );
    const unmatched = verifyDetectionCoverage(content, detections);
    expect(unmatched).toHaveLength(0);
  });

  it("reports detection spanning cell boundaries as unmatched without throwing", () => {
    // "John Smith" spans across two cells in this table — won't match either cell individually
    const detections = [makeDetection("d1", "John Smith", 1)];
    const content = buildContentFromBlocks(
      [makeBlock("table", "First\tLast\nJohn\tSmith")],
      detections,
    );
    const unmatched = verifyDetectionCoverage(content, detections);
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]).toContain("d1");
  });
});
