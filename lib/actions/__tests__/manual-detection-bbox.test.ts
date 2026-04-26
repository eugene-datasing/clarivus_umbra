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
  authorizeForCase: vi.fn(),
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
const mockFeedbackCreate = vi.fn();
const mockCaseUpdate = vi.fn();

const txStub = {
  detection: {
    create: (...args: unknown[]) => mockDetectionCreate(...args),
    update: (...args: unknown[]) => mockDetectionUpdate(...args),
  },
  feedbackExample: {
    create: (...args: unknown[]) => mockFeedbackCreate(...args),
  },
  document: {
    update: (...args: unknown[]) => mockDocumentUpdate(...args),
  },
  documentPage: {
    findUnique: (...args: unknown[]) => mockDocumentPageFindUnique(...args),
  },
  case: {
    update: (...args: unknown[]) => mockCaseUpdate(...args),
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
const caseId = "case-1";

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
    caseId,
  });
  // tx.detection.create returns the just-inserted row shape — minimum
  // fields the action mutates afterwards (bbox patch).
  mockDetectionCreate.mockResolvedValue({
    id: "det-new",
    posX: 0,
    posY: 0,
    posW: 0,
    posH: 0,
  });
  mockDetectionUpdate.mockResolvedValue({});
  mockFeedbackCreate.mockResolvedValue({});
  mockDocumentUpdate.mockResolvedValue({});
  mockCaseUpdate.mockResolvedValue({});
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

  it("populates feedbackExample with text and ground for the AI-learning trail", async () => {
    // The bbox patch must NOT cause the existing feedback example
    // creation to be skipped — the AI-learning feedback signal is
    // independent of bbox resolution. Regression guard.
    mockDocumentPageFindUnique.mockResolvedValue({
      layoutJson: [makeWord("Maia", 10, 20, 14, 5), makeWord("Rangi", 26, 20, 14, 5)],
      width: 100,
      height: 100,
    });

    await createManualDetection(baseInput);

    expect(mockFeedbackCreate).toHaveBeenCalledTimes(1);
    expect(mockFeedbackCreate.mock.calls[0][0]).toMatchObject({
      data: expect.objectContaining({
        text: "Maia Rangi",
        ground: "s7_2a",
        detectionId: "det-new",
      }),
    });
  });
});
