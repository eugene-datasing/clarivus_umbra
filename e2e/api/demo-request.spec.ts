import { test, expect } from "@playwright/test";

test.describe("Demo Request API", () => {
  // This endpoint doesn't require auth
  test.use({ storageState: { cookies: [], origins: [] } });

  test("POST /api/demo-request with valid data returns success", async ({ request }) => {
    const res = await request.post("/api/demo-request", {
      data: {
        name: "E2E Test User",
        email: "e2e-test@example.com",
        organisation: "Test Org",
        message: "Automated E2E test",
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("success", true);
  });

  test("POST /api/demo-request rejects missing name", async ({ request }) => {
    const res = await request.post("/api/demo-request", {
      data: {
        email: "test@example.com",
        organisation: "Test Org",
      },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/demo-request rejects invalid email", async ({ request }) => {
    const res = await request.post("/api/demo-request", {
      data: {
        name: "Test",
        email: "not-an-email",
        organisation: "Test Org",
      },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/demo-request rejects missing organisation", async ({ request }) => {
    const res = await request.post("/api/demo-request", {
      data: {
        name: "Test",
        email: "test@example.com",
      },
    });
    expect(res.status()).toBe(400);
  });
});
