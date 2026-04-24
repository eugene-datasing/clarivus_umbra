import { describe, it, expect } from "vitest";
import { compareDetectionsByPosition } from "../sort-detections";

function make(id: string, page: number, y: number) {
  return { id, page, position: { y } };
}

describe("compareDetectionsByPosition", () => {
  it("orders earlier pages first", () => {
    const a = make("a", 2, 50);
    const b = make("b", 1, 90);
    expect(compareDetectionsByPosition(a, b)).toBeGreaterThan(0);
    expect(compareDetectionsByPosition(b, a)).toBeLessThan(0);
  });

  it("within the same page, orders lower posY first", () => {
    const top = make("t", 1, 10);
    const mid = make("m", 1, 50);
    const bot = make("b", 1, 90);
    const out = [bot, top, mid].sort(compareDetectionsByPosition);
    expect(out.map((d) => d.id)).toEqual(["t", "m", "b"]);
  });

  it("tiebreaks on id.localeCompare when (page, posY) are identical", () => {
    const zeroA = make("cmo-a", 1, 0);
    const zeroB = make("cmo-b", 1, 0);
    const zeroC = make("cmo-c", 1, 0);
    const out = [zeroC, zeroA, zeroB].sort(compareDetectionsByPosition);
    expect(out.map((d) => d.id)).toEqual(["cmo-a", "cmo-b", "cmo-c"]);
  });

  it("sort is stable across repeated runs when inputs collide", () => {
    // All three detections share (page=1, posY=0) and have ids that
    // sort deterministically. Running sort twice must produce the same
    // output — the React key-order concern the tiebreak exists for.
    const input = [make("z", 1, 0), make("a", 1, 0), make("m", 1, 0)];
    const first = [...input].sort(compareDetectionsByPosition);
    const second = [...input].sort(compareDetectionsByPosition);
    expect(first.map((d) => d.id)).toEqual(second.map((d) => d.id));
    expect(first.map((d) => d.id)).toEqual(["a", "m", "z"]);
  });

  it("three-tier ordering in one run — page, then posY, then id", () => {
    const p1Top = make("p1top", 1, 10);
    const p1BotA = make("cmo-later-a", 1, 90);
    const p1BotB = make("cmo-later-b", 1, 90);
    const p2Top = make("p2top", 2, 5);
    const out = [p2Top, p1BotB, p1Top, p1BotA].sort(compareDetectionsByPosition);
    expect(out.map((d) => d.id)).toEqual(["p1top", "cmo-later-a", "cmo-later-b", "p2top"]);
  });

  it("returns 0 when comparing a detection to itself", () => {
    const d = make("x", 1, 50);
    expect(compareDetectionsByPosition(d, d)).toBe(0);
  });
});
