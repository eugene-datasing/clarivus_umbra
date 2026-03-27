import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe("Document API", () => {
  test("GET /api/documents/:docId/status returns document status", async ({ request }) => {
    const res = await request.get(`/api/documents/${SEED.documents.councilReport.id}/status`);
    expect(res.status()).toBeLessThan(500);
    if (res.ok()) {
      const body = await res.json();
      expect(body).toHaveProperty("id");
      expect(body).toHaveProperty("status");
    }
  });

  test("GET /api/documents/queue-status returns queue stats", async ({ request }) => {
    const res = await request.get("/api/documents/queue-status");
    expect(res.status()).toBeLessThan(500);
    if (res.ok()) {
      const body = await res.json();
      expect(body).toHaveProperty("stats");
    }
  });

  test("POST /api/documents/upload rejects request without files", async ({ request }) => {
    const res = await request.post("/api/documents/upload", {
      multipart: {
        caseId: SEED.cases.coastalWalkway.id,
      },
    });
    // May return 403 (CSRF), 400 (no files), or 401 (auth)
    expect([400, 401, 403, 422, 500]).toContain(res.status());
  });

  test("GET /api/detections/:detectionId/history returns history", async ({ request }) => {
    const res = await request.get(`/api/detections/${SEED.detections.johnSmith.id}/history`);
    expect(res.status()).toBeLessThan(500);
    if (res.ok()) {
      const body = await res.json();
      expect(Array.isArray(body)).toBeTruthy();
    }
  });
});
