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

  it("allows request-manager role", async () => {
    await expect(requireAdmin(makeUser("request-manager"))).resolves.toBeUndefined();
  });

  it("throws for reviewer role", async () => {
    await expect(requireAdmin(makeUser("reviewer"))).rejects.toThrow(
      "Access denied: admin role required",
    );
  });

  it("throws for senior-reviewer role", async () => {
    await expect(requireAdmin(makeUser("senior-reviewer"))).rejects.toThrow(
      "Access denied: admin role required",
    );
  });

  it("throws for empty role", async () => {
    await expect(requireAdmin(makeUser(""))).rejects.toThrow(
      "Access denied: admin role required",
    );
  });
});
