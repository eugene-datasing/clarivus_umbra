import { test, expect } from "@playwright/test";

test.describe("SCIM API", () => {
  // SCIM requires Bearer token auth, not session cookies
  // Without SCIM_API_TOKEN set, these should return 401

  test("GET /api/scim/Users requires SCIM bearer token", async ({ request }) => {
    const res = await request.get("/api/scim/Users");
    // Should reject — no SCIM bearer token in request
    expect([401, 403]).toContain(res.status());
  });

  test("GET /api/scim/Groups requires SCIM bearer token", async ({ request }) => {
    const res = await request.get("/api/scim/Groups");
    expect([401, 403]).toContain(res.status());
  });

  test("POST /api/scim/Users requires SCIM bearer token", async ({ request }) => {
    const res = await request.post("/api/scim/Users", {
      data: { userName: "test@example.com", displayName: "Test" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("POST /api/scim/Groups requires SCIM bearer token", async ({ request }) => {
    const res = await request.post("/api/scim/Groups", {
      data: { displayName: "test-group" },
    });
    expect([401, 403]).toContain(res.status());
  });
});
