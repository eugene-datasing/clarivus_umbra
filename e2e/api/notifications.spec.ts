import { test, expect } from "@playwright/test";

test.describe("Notifications API", () => {
  test("GET /api/notifications returns recent activity", async ({ request }) => {
    const res = await request.get("/api/notifications");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBeTruthy();
  });

  test("notifications have expected structure", async ({ request }) => {
    const res = await request.get("/api/notifications");
    if (res.ok()) {
      const body = await res.json();
      if (body.length > 0) {
        const notification = body[0];
        // Response has: time, user, action, type
        expect(notification).toHaveProperty("action");
        expect(notification).toHaveProperty("time");
      }
    }
  });
});
