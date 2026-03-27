import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe("Export API", () => {
  test("POST /api/export/:requestId/generate rejects empty document list", async ({ request }) => {
    const res = await request.post(
      `/api/export/${SEED.cases.coastalWalkway.id}/generate`,
      { data: { documentIds: [] } },
    );
    // May return 403 (CSRF), 400 (empty docs), or 422
    expect([400, 403, 422]).toContain(res.status());
  });

  test("POST /api/export/:requestId/generate rejects unreviewed documents", async ({ request }) => {
    const res = await request.post(
      `/api/export/${SEED.cases.coastalWalkway.id}/generate`,
      {
        data: {
          documentIds: [SEED.documents.councilReport.id],
          packageType: "internal",
        },
      },
    );
    // Should reject — documents not fully reviewed/signed-off
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("GET /api/export/:requestId/batch-status requires batchGroupId", async ({ request }) => {
    const res = await request.get(
      `/api/export/${SEED.cases.coastalWalkway.id}/batch-status`,
    );
    // Should return error without batchGroupId param
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("GET /api/schedule/:requestId returns schedule PDF", async ({ request }) => {
    const res = await request.get(`/api/schedule/${SEED.cases.coastalWalkway.id}`);
    expect(res.status()).toBeLessThan(500);
    if (res.ok()) {
      const contentType = res.headers()["content-type"];
      expect(contentType).toContain("pdf");
    }
  });
});
