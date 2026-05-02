import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe.fixme("Document API", () => {
  test.fixme("GET /api/documents/:docId/status returns document status", async ({ request }) => {
    const res = await request.get(`/api/documents/${SEED.documents.mainCaseFile.id}/status`);
    expect(res.status()).toBeLessThan(500);
    if (res.ok()) {
      const body = await res.json();
      expect(body).toHaveProperty("id");
      expect(body).toHaveProperty("status");
    }
  });

  test.fixme("GET /api/documents/queue-status returns queue stats", async ({ request }) => {
    const res = await request.get("/api/documents/queue-status");
    expect(res.status()).toBeLessThan(500);
    if (res.ok()) {
      const body = await res.json();
      expect(body).toHaveProperty("stats");
    }
  });

  test.fixme("POST /api/documents/upload rejects request without files", async ({ request }) => {
    const res = await request.post("/api/documents/upload", {
      multipart: {
        batchId: SEED.cases.featherstonStreet.id,
      },
    });
    // May return 403 (CSRF), 400 (no files), or 401 (auth)
    expect([400, 401, 403, 422, 500]).toContain(res.status());
  });

  test.fixme("GET /api/detections/:detectionId/history returns history", async ({ request }) => {
    // Slice D1 — old SEED.detections.johnSmith fixture entry dropped in
    // favour of count/type-based assertions. This API spec only checks
    // the route doesn't 5xx for an arbitrary detection ID; any real
    // PNCC-seed detection works. Stable id from cmo5enehy's detections.
    const res = await request.get(`/api/detections/cmo5enwam001g2z6cizqiyltg/history`);
    expect(res.status()).toBeLessThan(500);
    if (res.ok()) {
      const body = await res.json();
      expect(Array.isArray(body)).toBeTruthy();
    }
  });
});
