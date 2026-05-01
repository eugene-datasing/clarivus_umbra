import { describe, it, expect, vi } from "vitest";
import { requireAdmin } from "../authorize";
import type { SessionUser } from "../session";

// Mock prisma — requireAdmin re-reads role from DB, falling back to
// the JWT claim when the user record isn't found.
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue(null), // No DB record → uses JWT role
    },
  },
}));

function makeUser(role: string): SessionUser {
  return { id: "u1", name: "Test", email: "test@example.com", role };
}

describe("requireAdmin", () => {
  it("allows admin role", async () => {
    await expect(requireAdmin(makeUser("admin"))).resolves.toBeUndefined();
  });

  it("throws for reviewer role", async () => {
    await expect(requireAdmin(makeUser("reviewer"))).rejects.toThrow(
      "Access denied: admin role required",
    );
  });

  it("throws for legacy roles (request-manager, senior-reviewer, final-approver)", async () => {
    for (const role of ["request-manager", "senior-reviewer", "final-approver"]) {
      await expect(requireAdmin(makeUser(role))).rejects.toThrow(
        "Access denied: admin role required",
      );
    }
  });

  it("throws for empty role", async () => {
    await expect(requireAdmin(makeUser(""))).rejects.toThrow(
      "Access denied: admin role required",
    );
  });
});
