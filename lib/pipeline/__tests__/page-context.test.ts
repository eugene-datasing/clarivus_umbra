/**
 * Phase 12.4 — extractPageContext unit tests.
 */
import { describe, it, expect } from "vitest";
import { extractPageContext } from "../page-context";

describe("extractPageContext", () => {
  it("returns null for empty page text", () => {
    expect(extractPageContext("", "Sarah")).toBeNull();
  });

  it("returns null for empty detection text", () => {
    expect(extractPageContext("Some page text", "")).toBeNull();
  });

  it("returns null when the detection isn't found verbatim", () => {
    expect(
      extractPageContext("Page text without match", "Smith"),
    ).toBeNull();
  });

  it("returns the surrounding window when the detection is mid-page", () => {
    const pageText =
      "The submission was lodged by Sarah Mitchell from the Finance team yesterday morning.";
    const result = extractPageContext(pageText, "Sarah Mitchell", 20);
    // 20 chars before "Sarah Mitchell" + the name itself + 20 chars after.
    // "lodged by Sarah Mitchell from the Finan" plus ellipses on both sides.
    expect(result).not.toBeNull();
    expect(result).toContain("Sarah Mitchell");
    expect(result?.startsWith("…")).toBe(true);
    expect(result?.endsWith("…")).toBe(true);
  });

  it("clamps to start of page (no leading ellipsis)", () => {
    const pageText = "Sarah Mitchell joined Awatere Council in 2024.";
    const result = extractPageContext(pageText, "Sarah Mitchell", 20);
    expect(result).not.toBeNull();
    expect(result?.startsWith("…")).toBe(false);
    expect(result?.startsWith("Sarah Mitchell")).toBe(true);
  });

  it("clamps to end of page (no trailing ellipsis)", () => {
    const pageText = "The submission was lodged by Sarah Mitchell";
    const result = extractPageContext(pageText, "Sarah Mitchell", 20);
    expect(result).not.toBeNull();
    expect(result?.endsWith("…")).toBe(false);
    expect(result?.endsWith("Sarah Mitchell")).toBe(true);
  });

  it("preserves both ellipses for a mid-page match with surrounding text on both sides", () => {
    const pageText = "x".repeat(50) + "TARGET" + "y".repeat(50);
    const result = extractPageContext(pageText, "TARGET", 10);
    expect(result).toBe(`…${"x".repeat(10)}TARGET${"y".repeat(10)}…`);
  });

  it("uses the default 100-char window when not specified", () => {
    const pageText = "x".repeat(200) + "TARGET" + "y".repeat(200);
    const result = extractPageContext(pageText, "TARGET");
    // 100 before + 6 (target) + 100 after + 2 ellipses = 208
    expect(result?.length).toBe(208);
  });

  it("uses the first occurrence when the detection appears multiple times", () => {
    const pageText =
      "TARGET appears once and TARGET appears twice but we want the first.";
    const result = extractPageContext(pageText, "TARGET", 10);
    expect(result).not.toBeNull();
    // The first occurrence is at the very start.
    expect(result?.startsWith("TARGET")).toBe(true);
  });

  it("treats the boundary case where windowChars is 0 — returns just the match", () => {
    const pageText = "before TARGET after";
    const result = extractPageContext(pageText, "TARGET", 0);
    expect(result).toBe("…TARGET…");
  });
});
