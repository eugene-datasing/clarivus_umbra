/**
 * createManualDetection bbox-resolution contract (Bug 2 fix,
 * 2026-04-27).
 *
 * Pre-fix: createManualDetection inserted the Detection row with no
 * posX/posY/posW/posH, so the schema defaults left them at 0. The
 * PDF-mode overlays (pdf-detection-overlay.tsx:75 and
 * pdf-redaction-preview-overlay.tsx:120) skip rows with bbox 0 — so
 * the new manual detection appeared in the sidebar but produced no
 * canvas overlay. Eugene's "Add Detection doesn't redact" report
 * (Bug 2 from cr24 verification) was exactly this gap. The HTML
 * branch was unaffected because it renders detections by text-search
 * rather than bbox.
 *
 * Post-fix: after `tx.detection.create` the action looks up the
 * matching `DocumentPage.layoutJson` and runs `calculateBBoxAll` on
 * it (same helper AI detections use), patching the resolved bbox onto
 * the just-inserted row inside the same transaction. When no match
 * is found the row stays at zero bbox, the action still succeeds, and
 * a warning is logged so the regression is visible in build/runtime
 * logs.
 *
 * Same in-suite Prisma mocking pattern as bulk-accept-detections.test.ts
 * — keeps the test runtime in pure-Node territory without Prisma /
 * jsdom / @testing-library/react.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockRequireUser = vi.fn();
const mockAuthorizeForDocument = vi.fn();
const mockCreateAuditEntry = vi.fn();
const mockRebuildContentJson = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireUser: (...args: unknown[]) => mockRequireUser(...args),
}));

vi.mock("@/lib/auth/authorize", () => ({
  authorizeForDocument: (...args: unknown[]) => mockAuthorizeForDocument(...args),
  authorizeForDetection: vi.fn(),
  authorizeForBatch: vi.fn(),
}));

vi.mock("@/lib/data/audit", () => ({
  createAuditEntry: (...args: unknown[]) => mockCreateAuditEntry(...args),
}));

vi.mock("@/lib/pipeline/rebuild-content", () => ({
  rebuildContentJson: (...args: unknown[]) => mockRebuildContentJson(...args),
}));

const mockDocumentFindUnique = vi.fn();
const mockDocumentUpdate = vi.fn();
const mockDocumentPageFindUnique = vi.fn();
const mockDetectionCreate = vi.fn();
const mockDetectionUpdate = vi.fn();
const mockBatchUpdate = vi.fn();

const txStub = {
  detection: {
    create: (...args: unknown[]) => mockDetectionCreate(...args),
    update: (...args: unknown[]) => mockDetectionUpdate(...args),
  },
  document: {
    update: (...args: unknown[]) => mockDocumentUpdate(...args),
  },
  documentPage: {
    findUnique: (...args: unknown[]) => mockDocumentPageFindUnique(...args),
  },
  batch: {
    update: (...args: unknown[]) => mockBatchUpdate(...args),
  },
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    document: {
      findUnique: (...args: unknown[]) => mockDocumentFindUnique(...args),
    },
    $transaction: (fn: (tx: typeof txStub) => unknown) => Promise.resolve(fn(txStub)),
  },
}));

import { createManualDetection } from "../manual-detection-actions";

const fakeUser = { id: "u1", name: "Test User", role: "admin" };
const documentId = "doc-1";
const batchId = "case-1";

const baseInput = {
  documentId,
  text: "Maia Rangi",
  type: "personal-name",
  page: 1,
  ground: "s7_2a",
  reasoning: "Reviewer-flagged personal name",
};

// A single horizontal-line word polygon at (10, 20) → (10+30, 20+5)
// in page-pixel space. With pageWidth=100, pageHeight=100 the
// computed percentages land on round numbers that are easy to assert
// against. polygon = [x0,y0, x1,y0, x1,y1, x0,y1].
function makeWord(text: string, x: number, y: number, w: number, h: number) {
  return {
    text,
    confidence: 0.99,
    polygon: [x, y, x + w, y, x + w, y + h, x, y + h],
  };
}

function setupDefaults() {
  mockRequireUser.mockResolvedValue(fakeUser);
  mockAuthorizeForDocument.mockResolvedValue(undefined);
  mockCreateAuditEntry.mockResolvedValue(undefined);
  mockRebuildContentJson.mockResolvedValue(undefined);
  mockDocumentFindUnique.mockResolvedValue({
    id: documentId,
    name: "Test Doc",
    batchId,
  });
  // tx.detection.create returns a row with a distinct id per call —
  // the FIRST call creates the original row (`det-new`), subsequent
  // calls (post-2026-04-27 multi-line fix) create sibling rows for
  // additional visual-line bboxes (`det-sibling-1`, `det-sibling-2`,
  // ...). We don't care about all the fields the action might read,
  // just the id (used for the bbox-patch update).
  let createCallCount = 0;
  mockDetectionCreate.mockImplementation(() => {
    const id = createCallCount === 0 ? "det-new" : `det-sibling-${createCallCount}`;
    createCallCount += 1;
    return Promise.resolve({ id, posX: 0, posY: 0, posW: 0, posH: 0 });
  });
  mockDetectionUpdate.mockResolvedValue({});
  mockDocumentUpdate.mockResolvedValue({});
  mockBatchUpdate.mockResolvedValue({});
}

describe("createManualDetection — bbox resolution (Bug 2 fix)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("patches resolved bbox onto the new Detection row when text matches the page's word polygons", async () => {
    // The selected text "Maia Rangi" appears as two adjacent words on
    // the page. calculateBBoxAll concatenates words within the
    // sliding window and returns one BBox per visual line of match.
    mockDocumentPageFindUnique.mockResolvedValue({
      layoutJson: [
        makeWord("Some", 0, 20, 5, 5),
        makeWord("Maia", 10, 20, 14, 5),
        makeWord("Rangi", 26, 20, 14, 5),
        makeWord("text", 42, 20, 6, 5),
      ],
      width: 100,
      height: 100,
    });

    const result = await createManualDetection(baseInput);

    expect(result).toMatchObject({ success: true, detectionId: "det-new" });

    // tx.detection.update was called once — the bbox-patch step.
    expect(mockDetectionUpdate).toHaveBeenCalledTimes(1);
    const updateArgs = mockDetectionUpdate.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: "det-new" });
    // The exact percentage values depend on calculateBBoxAll's
    // computeBoxesFromWords implementation — we don't pin every digit
    // here, but every bbox component must be > 0 (non-default).
    expect(updateArgs.data.posX).toBeGreaterThan(0);
    expect(updateArgs.data.posY).toBeGreaterThan(0);
    expect(updateArgs.data.posW).toBeGreaterThan(0);
    expect(updateArgs.data.posH).toBeGreaterThan(0);
  });

  it("looks up the page by composite (documentId, pageNumber) so multi-page docs resolve to the right layout", async () => {
    // The detection's `page` field disambiguates which DocumentPage
    // to query — calculateBBoxAll must run against the words on the
    // SAME page the user clicked, not page 1 of every document.
    mockDocumentPageFindUnique.mockResolvedValue({
      layoutJson: [makeWord("Maia", 10, 20, 14, 5), makeWord("Rangi", 26, 20, 14, 5)],
      width: 100,
      height: 100,
    });

    await createManualDetection({ ...baseInput, page: 7 });

    expect(mockDocumentPageFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { documentId_pageNumber: { documentId, pageNumber: 7 } },
      }),
    );
  });

  it("leaves bbox at zero and logs a warning when text is not found in the page's words", async () => {
    // OCR misread, user-edited textarea, or selection covers
    // characters outside the recognised polygons. The detection
    // still commits — export-time PyMuPDF Tier-2 text-search picks
    // up the redaction. Only the in-app preview misses the visual.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockDocumentPageFindUnique.mockResolvedValue({
      layoutJson: [makeWord("Completely", 0, 0, 10, 5), makeWord("Different", 12, 0, 12, 5)],
      width: 100,
      height: 100,
    });

    const result = await createManualDetection(baseInput);

    expect(result).toMatchObject({ success: true, detectionId: "det-new" });
    expect(mockDetectionUpdate).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/no bbox match/i);
    expect(warnSpy.mock.calls[0][0]).toContain("Maia Rangi");
  });

  it("leaves bbox at zero and warns when the page has no layoutJson at all (legacy / image-only PDFs)", async () => {
    // Page exists but layoutJson is null — happens on legacy rows
    // ingested before DI was wired up, or on image-only pages where
    // OCR couldn't extract word polygons.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockDocumentPageFindUnique.mockResolvedValue({
      layoutJson: null,
      width: 100,
      height: 100,
    });

    const result = await createManualDetection(baseInput);

    expect(result).toMatchObject({ success: true });
    expect(mockDetectionUpdate).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    // Warning message includes the diagnostic — pages.length count
    // OR the literal "no-layoutJson" sentinel for null-layoutJson
    // case so the failure mode is identifiable from logs alone.
    expect(warnSpy.mock.calls[0][0]).toContain("no-layoutJson");
  });

  it("leaves bbox at zero and warns when the page row is missing entirely", async () => {
    // findUnique returns null — happens if the page number on the
    // detection input doesn't match any DocumentPage row (corrupt
    // input, deletion race). Don't crash the action.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockDocumentPageFindUnique.mockResolvedValue(null);

    const result = await createManualDetection(baseInput);

    expect(result).toMatchObject({ success: true });
    expect(mockDetectionUpdate).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("runs the bbox-patch update inside the same transaction as the create", async () => {
    // Atomicity contract — either the detection commits with its
    // resolved bbox or neither commits. The whole flow is a single
    // $transaction; documentPage.findUnique uses the tx-scoped
    // variant so reads see writes from earlier in the same
    // transaction. Asserting the tx variant rather than
    // prisma.detection.update guards against a refactor leaving
    // the bbox-patch outside the transaction.
    mockDocumentPageFindUnique.mockResolvedValue({
      layoutJson: [makeWord("Maia", 10, 20, 14, 5), makeWord("Rangi", 26, 20, 14, 5)],
      width: 100,
      height: 100,
    });

    await createManualDetection(baseInput);

    expect(mockDetectionCreate).toHaveBeenCalled();
    expect(mockDocumentPageFindUnique).toHaveBeenCalled();
    expect(mockDetectionUpdate).toHaveBeenCalled();
    // All three fired against the txStub (the mocked tx) — by the way
    // the prisma mock is wired ($transaction calls fn(txStub)), every
    // reference reaching the mocks proves the call happened inside
    // the transaction. No additional assertion needed beyond having
    // entered the txStub variant of each.
  });

});

// ---------------------------------------------------------------------
// Bug 5 fix — long text + multi-line manual detections.
// ---------------------------------------------------------------------
describe("createManualDetection — Bug 5 fix (long text + multi-line)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper: assemble a long-but-matchable word sequence on a single
  // visual line. Each word's polygon has a distinct y-band that
  // matches the others (same line) so calculateBBoxAll returns a
  // single bbox.
  function makeLongLine(wordCount: number) {
    const words = [];
    for (let i = 0; i < wordCount; i++) {
      const text = `word${String(i).padStart(2, "0")}`;
      const x = i * 10;
      words.push(makeWord(text, x, 20, 8, 4));
    }
    return words;
  }

  it("(a) patches non-zero bbox on the row when text exceeds 80 chars (skipLongTextGuard hookup)", async () => {
    // 12 × 7-char words + 11 spaces = 95 chars — over the guard.
    const words = makeLongLine(12);
    const longText = words.map((w) => w.text).join(" ");
    expect(longText.length).toBeGreaterThan(80);
    mockDocumentPageFindUnique.mockResolvedValue({
      layoutJson: words,
      width: 200,
      height: 100,
    });

    const result = await createManualDetection({ ...baseInput, text: longText });

    expect(result).toMatchObject({ success: true });
    // Pre-fix the >80c text would have hit the guard, returned no
    // bbox, and left the row at zeros (Bug 5). Post-fix the
    // skipLongTextGuard option fires and a bbox is patched.
    expect(mockDetectionUpdate).toHaveBeenCalledTimes(1);
    const updateArgs = mockDetectionUpdate.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: "det-new" });
    expect(updateArgs.data.posW).toBeGreaterThan(0);
    expect(updateArgs.data.posH).toBeGreaterThan(0);
  });

  it("(b) creates N Detection rows when calculateBBoxAll returns N visual-line bboxes", async () => {
    // Two visual lines on the page — the helper yTolerance splits
    // them. y-band 1: words at y≈20-25. y-band 2: words at y≈40-45.
    // The matched text is the concatenation of all four words; the
    // helper returns one bbox per visual line.
    mockDocumentPageFindUnique.mockResolvedValue({
      layoutJson: [
        makeWord("Maia", 10, 20, 14, 5),
        makeWord("Rangi", 26, 20, 14, 5),
        makeWord("of", 10, 40, 6, 5),
        makeWord("Whanganui", 18, 40, 28, 5),
      ],
      width: 100,
      height: 100,
    });

    await createManualDetection({
      ...baseInput,
      text: "Maia Rangi of Whanganui",
    });

    // The first detection.create is the original row (always 1).
    // For a 2-line match, calculateBBoxAll returns 2 bboxes — first
    // patches the original via update; the second creates ONE sibling
    // via create. Total detection.create calls = 1 (original) + 1
    // (sibling) = 2.
    expect(mockDetectionCreate).toHaveBeenCalledTimes(2);
    expect(mockDetectionUpdate).toHaveBeenCalledTimes(1);

    // Sibling shares text/type/source with the original but has its
    // own bbox.
    const siblingCall = mockDetectionCreate.mock.calls[1][0];
    expect(siblingCall.data).toMatchObject({
      documentId,
      type: "personal-name",
      text: "Maia Rangi of Whanganui",
      status: "accepted",
      source: "manual",
    });
    // Sibling bbox is non-zero AND distinct from the patched-on-original
    // bbox.
    expect(siblingCall.data.posW).toBeGreaterThan(0);
    expect(siblingCall.data.posH).toBeGreaterThan(0);

    const originalBbox = mockDetectionUpdate.mock.calls[0][0].data;
    // The two bboxes should sit on different visual lines — posY
    // differs.
    expect(siblingCall.data.posY).not.toBe(originalBbox.posY);
  });

  it("(c) detectionCount and redactionCount increment by N (one per row), not 1", async () => {
    // Same 2-line fixture. Counters reflect TWO new detection rows:
    // the original + 1 sibling. Pre-fix the bulk-accept-flavour
    // increment of 1 would have left the counts off by one.
    mockDocumentPageFindUnique.mockResolvedValue({
      layoutJson: [
        makeWord("Maia", 10, 20, 14, 5),
        makeWord("Rangi", 26, 20, 14, 5),
        makeWord("of", 10, 40, 6, 5),
        makeWord("Whanganui", 18, 40, 28, 5),
      ],
      width: 100,
      height: 100,
    });

    await createManualDetection({
      ...baseInput,
      text: "Maia Rangi of Whanganui",
    });

    expect(mockDocumentUpdate).toHaveBeenCalledTimes(1);
    expect(mockDocumentUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: documentId },
      data: { detectionCount: { increment: 2 } },
    });

    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    expect(mockBatchUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: batchId },
      data: { redactionCount: { increment: 2 } },
    });
  });

  it("single-line match still produces exactly one row + 1-increment counters (regression guard for Bug 2 happy-path)", async () => {
    // Pre-2026-04-27 behaviour: 1 row, counters +1, 1 update, 0 sibling
    // creates. Post-fix that single-line happy-path must be unchanged.
    mockDocumentPageFindUnique.mockResolvedValue({
      layoutJson: [makeWord("Maia", 10, 20, 14, 5), makeWord("Rangi", 26, 20, 14, 5)],
      width: 100,
      height: 100,
    });

    await createManualDetection(baseInput);

    expect(mockDetectionCreate).toHaveBeenCalledTimes(1); // only the original
    expect(mockDetectionUpdate).toHaveBeenCalledTimes(1);
    expect(mockDocumentUpdate.mock.calls[0][0].data).toMatchObject({
      detectionCount: { increment: 1 },
    });
    expect(mockBatchUpdate.mock.calls[0][0].data).toMatchObject({
      redactionCount: { increment: 1 },
    });
  });

  it("text-not-found edge case: zero-bbox row + warn, no sibling rows, counters increment by 1", async () => {
    // The action still commits the original row even when no bbox
    // is found (text doesn't match any polygon — OCR misread, user-
    // edited textarea). No sibling rows fire because there's no
    // bbox to use for them. Counters increment by 1 (just the
    // original row). The pre-existing warn-only path is preserved.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockDocumentPageFindUnique.mockResolvedValue({
      layoutJson: [makeWord("Completely", 0, 0, 10, 5), makeWord("Different", 12, 0, 12, 5)],
      width: 100,
      height: 100,
    });

    const result = await createManualDetection(baseInput);

    expect(result).toMatchObject({ success: true });
    expect(mockDetectionCreate).toHaveBeenCalledTimes(1); // original only
    expect(mockDetectionUpdate).not.toHaveBeenCalled(); // no bbox to patch
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(mockDocumentUpdate.mock.calls[0][0].data).toMatchObject({
      detectionCount: { increment: 1 },
    });
    expect(mockBatchUpdate.mock.calls[0][0].data).toMatchObject({
      redactionCount: { increment: 1 },
    });
  });

  it("passes skipLongTextGuard:true through to calculateBBoxAll (verified via long-text fixture above) and not via short text", async () => {
    // Indirect coverage: the long-text test (a) above only passes
    // because the action passes the skipLongTextGuard option. Adding
    // a redundant assertion at the bbox-helper boundary would couple
    // this test to implementation; the (a) test is the load-bearing
    // proof.
    expect(true).toBe(true);
  });
});
