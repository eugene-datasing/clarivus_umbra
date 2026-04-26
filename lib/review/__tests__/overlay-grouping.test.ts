import { describe, it, expect } from "vitest";
import {
  mergeByBbox,
  dominantStatus,
  type MergeableDetection,
  type MergedOverlay,
} from "../overlay-grouping";

function makeDetection(overrides: Partial<MergeableDetection> & { id: string }): MergeableDetection {
  return {
    type: "personal-name",
    text: "sample",
    confidence: 90,
    page: 1,
    posX: 10,
    posY: 10,
    posW: 5,
    posH: 1,
    status: "pending",
    ...overrides,
  };
}

describe("dominantStatus", () => {
  it("returns 'pending' for an empty array (degenerate; treated as the lowest priority)", () => {
    expect(dominantStatus([])).toBe("pending");
  });

  it("returns the lone status when only one detection is present", () => {
    expect(dominantStatus([{ status: "pending" }])).toBe("pending");
    expect(dominantStatus([{ status: "accepted" }])).toBe("accepted");
    expect(dominantStatus([{ status: "rejected" }])).toBe("rejected");
  });

  it("prefers accepted over rejected and pending", () => {
    expect(dominantStatus([{ status: "pending" }, { status: "accepted" }])).toBe("accepted");
    expect(dominantStatus([{ status: "rejected" }, { status: "accepted" }])).toBe("accepted");
    expect(dominantStatus([{ status: "accepted" }, { status: "rejected" }, { status: "pending" }])).toBe("accepted");
  });

  it("prefers rejected over pending when no accepted is present", () => {
    expect(dominantStatus([{ status: "pending" }, { status: "rejected" }])).toBe("rejected");
    expect(dominantStatus([{ status: "rejected" }, { status: "pending" }, { status: "pending" }])).toBe("rejected");
  });

  it("treats unknown statuses as pending priority", () => {
    expect(dominantStatus([{ status: "weird" }, { status: "pending" }])).toBe("pending");
    // Unknown alone falls through to pending.
    expect(dominantStatus([{ status: "weird" }])).toBe("pending");
  });
});

describe("mergeByBbox", () => {
  it("returns an empty array when given an empty array", () => {
    expect(mergeByBbox([])).toEqual([]);
  });

  it("passes a single detection through unchanged (group of one)", () => {
    const d = makeDetection({ id: "d1", type: "phone", text: "021 544 908", status: "accepted" });
    const out = mergeByBbox([d]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      primaryId: "d1",
      detectionIds: ["d1"],
      types: ["phone"],
      text: "021 544 908",
      status: "accepted",
      posX: 10, posY: 10, posW: 5, posH: 1,
    });
  });

  it("does NOT merge detections with different bboxes (even if other fields match)", () => {
    const a = makeDetection({ id: "a", type: "phone", text: "x", posX: 10 });
    const b = makeDetection({ id: "b", type: "phone", text: "x", posX: 50 }); // different posX
    const out = mergeByBbox([a, b]);
    expect(out).toHaveLength(2);
  });

  it("does NOT merge detections that overlap by area but aren't bbox-identical (exact-match merge only)", () => {
    // Mechanism: two detections covering nearly-the-same pixel region
    // but with bbox values differing slightly (e.g. 14.44 wide vs
    // 14.66 wide). Exact-match-only is intentional — the spec rejects
    // overlap-area merging because it would hide genuinely different
    // detections that happen to overlap.
    const a = makeDetection({ id: "a", posX: 10, posY: 10, posW: 14.44, posH: 1.26 });
    const b = makeDetection({ id: "b", posX: 10.05, posY: 10.05, posW: 14.66, posH: 1.30 });
    const out = mergeByBbox([a, b]);
    expect(out).toHaveLength(2);
  });

  it("does NOT merge across pages, even when bbox fields are identical", () => {
    const p1 = makeDetection({ id: "p1", page: 1 });
    const p2 = makeDetection({ id: "p2", page: 2 });
    const out = mergeByBbox([p1, p2]);
    expect(out).toHaveLength(2);
  });

  it("merges detections with identical (page, posX, posY, posW, posH) into one group", () => {
    // Mechanism A: phone regex emits both `021 544 908` and `021 544\n908`
    // for the same DI line. Pipeline dedup keys on (page, type, text,
    // posY_rounded) so both survive — text differs.
    const noNewline = makeDetection({
      id: "phone-noNewline",
      type: "phone",
      text: "021 544 908",
      status: "accepted",
    });
    const withNewline = makeDetection({
      id: "phone-withNewline",
      type: "phone",
      text: "021 544\n908",
      status: "pending",
    });
    const out = mergeByBbox([noNewline, withNewline]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      primaryId: "phone-noNewline", // lowest id by string compare
      detectionIds: ["phone-noNewline", "phone-withNewline"],
      types: ["phone"],
      status: "accepted", // accepted wins over pending
    });
  });

  it("merges detections of DIFFERENT types but identical bbox into one group with both types listed", () => {
    // Mechanism B: bank-account regex matches the full account number,
    // phone regex matches the trailing `0789123-00` substring. Same
    // bbox (both inherit the DI line bounds), different `type`.
    const bank = makeDetection({
      id: "a-bank",
      type: "bank-account",
      text: "12-3056-0789123-00",
      status: "pending",
    });
    const phone = makeDetection({
      id: "b-phone",
      type: "phone",
      text: "0789123-00",
      status: "pending",
    });
    const out = mergeByBbox([bank, phone]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      primaryId: "a-bank",
      detectionIds: ["a-bank", "b-phone"],
      types: ["bank-account", "phone"], // distinct types in id-sorted order
      status: "pending",
    });
  });

  it("picks the lexicographically lowest id as the primary, regardless of input order", () => {
    const z = makeDetection({ id: "z" });
    const a = makeDetection({ id: "a" });
    const m = makeDetection({ id: "m" });
    const out = mergeByBbox([z, a, m]);
    expect(out[0].primaryId).toBe("a");
  });

  it("handles a 3-way merge with all three statuses — accepted wins", () => {
    const out = mergeByBbox([
      makeDetection({ id: "1", status: "pending" }),
      makeDetection({ id: "2", status: "rejected" }),
      makeDetection({ id: "3", status: "accepted" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("accepted");
  });

  it("handles a 2-way merge with rejected + pending — rejected wins", () => {
    const out = mergeByBbox([
      makeDetection({ id: "1", status: "pending" }),
      makeDetection({ id: "2", status: "rejected" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("rejected");
  });

  it("preserves first-occurrence order of group keys in the output (deterministic)", () => {
    const out = mergeByBbox([
      makeDetection({ id: "x1", posY: 30 }),
      makeDetection({ id: "x2", posY: 10 }),
      makeDetection({ id: "x3", posY: 20 }),
    ]);
    expect(out.map((g) => g.posY)).toEqual([30, 10, 20]);
  });

  it("is render-time-pure — input array is not mutated, output is a new structure", () => {
    const inputs = [
      makeDetection({ id: "a", status: "pending" }),
      makeDetection({ id: "b", status: "accepted" }),
    ];
    const beforeStatuses = inputs.map((d) => d.status);
    const out = mergeByBbox(inputs);
    expect(inputs.map((d) => d.status)).toEqual(beforeStatuses);
    expect(out).not.toContain(inputs[0]);
  });

  it("produces an output shape callers can render directly without further reshaping", () => {
    const det = makeDetection({
      id: "x",
      type: "personal-name",
      text: "Maia Rangi",
      confidence: 95,
      posX: 49.83,
      posY: 26.13,
      posW: 8.31,
      posH: 1.52,
      status: "accepted",
    });
    const out: MergedOverlay[] = mergeByBbox([det]);
    expect(out[0]).toEqual({
      primaryId: "x",
      detectionIds: ["x"],
      types: ["personal-name"],
      text: "Maia Rangi",
      confidence: 95,
      page: 1,
      posX: 49.83,
      posY: 26.13,
      posW: 8.31,
      posH: 1.52,
      status: "accepted",
      appliedGround: null,
    });
  });

  // ---------------------------------------------------------------------
  // appliedGround propagation — added 2026-04-25 for ground-citation
  // rendering on accepted right-pane redactions.
  // ---------------------------------------------------------------------

  it("carries appliedGround through to MergedOverlay when present on a single detection", () => {
    const det = makeDetection({ id: "a", status: "accepted" });
    det.appliedGround = "s7_2a";
    const out = mergeByBbox([det]);
    expect(out[0].appliedGround).toBe("s7_2a");
  });

  it("normalises missing appliedGround to null on MergedOverlay", () => {
    // makeDetection doesn't set appliedGround, so it's undefined on
    // the input — the merged overlay should expose it as null so
    // downstream truthiness checks (right-pane citation, etc) get a
    // single shape to test against.
    const det = makeDetection({ id: "a", status: "accepted" });
    const out = mergeByBbox([det]);
    expect(out[0].appliedGround).toBeNull();
  });

  it("uses the primary's (lowest-id) appliedGround on multi-detection merges", () => {
    const a = makeDetection({ id: "a" });
    a.appliedGround = "s7_2a";
    const b = makeDetection({ id: "b" });
    b.appliedGround = "s7_2ba";
    const c = makeDetection({ id: "c" });
    c.appliedGround = "s6_a";
    // Insert in non-id order to verify the sort still picks 'a'.
    const out = mergeByBbox([c, b, a]);
    expect(out).toHaveLength(1);
    expect(out[0].primaryId).toBe("a");
    expect(out[0].appliedGround).toBe("s7_2a");
  });

  it("preserves a null appliedGround on the primary even if a sibling has one set", () => {
    // Common case: pending + accepted at same bbox. Primary 'a' is
    // pending with no ground; sibling 'b' is accepted with a ground.
    // dominantStatus picks accepted (priority), but the primary-wins
    // rule still applies for the citation — so the right-pane label
    // doesn't render for this overlay (no ground on primary), even
    // though dominantStatus is "accepted". This is the conservative
    // choice: the sidebar still lists b's ground separately.
    const a = makeDetection({ id: "a", status: "pending" });
    const b = makeDetection({ id: "b", status: "accepted" });
    b.appliedGround = "s7_2a";
    const out = mergeByBbox([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].primaryId).toBe("a");
    expect(out[0].status).toBe("accepted");
    expect(out[0].appliedGround).toBeNull();
  });
});
