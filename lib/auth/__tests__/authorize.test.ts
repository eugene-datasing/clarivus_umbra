import { describe, it, expect } from "vitest";
import { requireAdmin } from "../authorize";
import type { SessionUser } from "../session";

function makeUser(role: string): SessionUser {
  return { id: "u1", name: "Test", email: "test@example.com", role };
}

describe("requireAdmin", () => {
  it("allows admin role", () => {
    expect(() => requireAdmin(makeUser("admin"))).not.toThrow();
  });

  it("allows request-manager role", () => {
    expect(() => requireAdmin(makeUser("request-manager"))).not.toThrow();
  });

  it("throws for reviewer role", () => {
    expect(() => requireAdmin(makeUser("reviewer"))).toThrow(
      "Access denied: admin role required",
    );
  });

  it("throws for senior-reviewer role", () => {
    expect(() => requireAdmin(makeUser("senior-reviewer"))).toThrow(
      "Access denied: admin role required",
    );
  });

  it("throws for empty role", () => {
    expect(() => requireAdmin(makeUser(""))).toThrow(
      "Access denied: admin role required",
    );
  });
});
