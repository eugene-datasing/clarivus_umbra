import { describe, it, expect } from "vitest";
import {
  computePdfSelectionBbox,
  findPdfPageWrapper,
  type Rect,
} from "../pdf-selection";

/**
 * Synthetic rects that don't need a DOM — the helper is pure, so we
 * just hand it plain objects shaped like DOMRect.
 */
function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): Rect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

describe("computePdfSelectionBbox", () => {
  const wrapper = rect(100, 200, 800, 1000); // page wrapper: 800×1000 at (100,200)

  it("translates a mid-page selection into percentage-space bbox", () => {
    // Selection at (300, 400) → relative (200, 200) → posX 25%, posY 20%
    // Width 80 → posW 10%, height 20 → posH 2%
    const out = computePdfSelectionBbox({
      text: "Angela Torres",
      anchorPage: 2,
      focusPage: 2,
      selectionRect: rect(300, 400, 80, 20),
      wrapperRect: wrapper,
    });
    expect(out).not.toBeNull();
    expect(out!.posX).toBe(25);
    expect(out!.posY).toBe(20);
    expect(out!.posW).toBe(10);
    expect(out!.posH).toBe(2);
    expect(out!.page).toBe(2);
    expect(out!.text).toBe("Angela Torres");
  });

  it("trims whitespace off the captured text", () => {
    const out = computePdfSelectionBbox({
      text: "  hello world  \n",
      anchorPage: 1,
      focusPage: 1,
      selectionRect: rect(150, 250, 50, 15),
      wrapperRect: wrapper,
    });
    expect(out).not.toBeNull();
    expect(out!.text).toBe("hello world");
  });

  it("sets popoverAnchor to the bottom-right of the selection rect", () => {
    const out = computePdfSelectionBbox({
      text: "signature",
      anchorPage: 3,
      focusPage: 3,
      selectionRect: rect(500, 300, 60, 18),
      wrapperRect: wrapper,
    });
    expect(out).not.toBeNull();
    expect(out!.popoverAnchor).toEqual({ x: 560, y: 318 });
  });

  it("rejects cross-page selections", () => {
    const out = computePdfSelectionBbox({
      text: "spans two pages",
      anchorPage: 1,
      focusPage: 2,
      selectionRect: rect(150, 250, 50, 20),
      wrapperRect: wrapper,
    });
    expect(out).toBeNull();
  });

  it("rejects selections <2 characters", () => {
    for (const shortText of ["", "a", " ", "\n\t", "x"]) {
      const out = computePdfSelectionBbox({
        text: shortText,
        anchorPage: 1,
        focusPage: 1,
        selectionRect: rect(100, 100, 10, 10),
        wrapperRect: wrapper,
      });
      expect(out, `should reject "${shortText}"`).toBeNull();
    }
  });

  it("rejects degenerate selections where posW or posH falls below 0.1%", () => {
    // Width 0.5 px → posW = 0.5/800 * 100 = 0.0625% which is < 0.1% → reject
    const out = computePdfSelectionBbox({
      text: "tiny",
      anchorPage: 1,
      focusPage: 1,
      selectionRect: rect(100, 100, 0.5, 20),
      wrapperRect: wrapper,
    });
    expect(out).toBeNull();
  });

  it("rejects when wrapperRect has zero width or height (layout race)", () => {
    const zeroW = computePdfSelectionBbox({
      text: "hello",
      anchorPage: 1,
      focusPage: 1,
      selectionRect: rect(100, 100, 10, 10),
      wrapperRect: rect(0, 0, 0, 1000),
    });
    expect(zeroW).toBeNull();

    const zeroH = computePdfSelectionBbox({
      text: "hello",
      anchorPage: 1,
      focusPage: 1,
      selectionRect: rect(100, 100, 10, 10),
      wrapperRect: rect(0, 0, 800, 0),
    });
    expect(zeroH).toBeNull();
  });

  it("accepts selections that span visual lines (multi-line passage)", () => {
    // Tall selection crossing a wrap point → still one page, bbox covers
    // from start of line N to end of line N+1.
    const out = computePdfSelectionBbox({
      text: "line one continues\ninto line two",
      anchorPage: 4,
      focusPage: 4,
      selectionRect: rect(150, 500, 500, 40), // 2 lines tall
      wrapperRect: wrapper,
    });
    expect(out).not.toBeNull();
    expect(out!.posW).toBe(62.5);
    expect(out!.posH).toBe(4);
  });
});

describe("findPdfPageWrapper", () => {
  // Duck-typed mocks — the helper accepts any shape with dataset + parentNode,
  // so we don't need jsdom / HTMLElement to test it.
  function mockElement(attrs: { pageNumber?: string } = {}, parent: unknown = null): Node {
    return {
      dataset: attrs.pageNumber !== undefined ? { pageNumber: attrs.pageNumber } : {},
      parentNode: parent,
    } as unknown as Node;
  }

  it("returns the first ancestor with data-page-number", () => {
    const wrapper = mockElement({ pageNumber: "3" });
    const child = mockElement({}, wrapper);
    const grandchild = mockElement({}, child);
    const out = findPdfPageWrapper(grandchild);
    expect(out).not.toBeNull();
    expect(out!.page).toBe(3);
    expect(out!.element).toBe(wrapper);
  });

  it("returns null when no ancestor has data-page-number", () => {
    const parent = mockElement({});
    const child = mockElement({}, parent);
    expect(findPdfPageWrapper(child)).toBeNull();
  });

  it("returns null when given null", () => {
    expect(findPdfPageWrapper(null)).toBeNull();
  });

  it("returns null when data-page-number is non-numeric or zero", () => {
    for (const bad of ["", "abc", "0", "-1"]) {
      const wrapper = mockElement({ pageNumber: bad });
      expect(findPdfPageWrapper(wrapper), `rejects pageNumber="${bad}"`).toBeNull();
    }
  });

  it("returns the closest wrapper, not the farthest — inner data-page-number wins", () => {
    const outer = mockElement({ pageNumber: "1" });
    const inner = mockElement({ pageNumber: "5" }, outer);
    const leaf = mockElement({}, inner);
    const out = findPdfPageWrapper(leaf);
    expect(out!.page).toBe(5);
    expect(out!.element).toBe(inner);
  });
});
