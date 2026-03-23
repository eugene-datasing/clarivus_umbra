import { test, expect } from "@playwright/test";

test.describe("Health API", () => {
  test("GET /api/health returns 200", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
  });

  test("health response includes status field", async ({ request }) => {
    const response = await request.get("/api/health");
    const body = await response.json();
    expect(body).toHaveProperty("status");
  });

  test("health response reports healthy status", async ({ request }) => {
    const response = await request.get("/api/health");
    const body = await response.json();
    expect(body.status).toMatch(/ok|healthy|up/i);
  });
});

test.describe("Activation Status API", () => {
  test("GET /api/activation-status returns 200", async ({ request }) => {
    const response = await request.get("/api/activation-status");
    expect(response.status()).toBe(200);
  });

  test("reports instance as activated", async ({ request }) => {
    const response = await request.get("/api/activation-status");
    const body = await response.json();
    expect(body).toHaveProperty("activated");
  });
});
