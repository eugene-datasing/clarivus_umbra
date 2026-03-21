import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth-options before importing session
vi.mock("../auth-options", () => ({
  auth: vi.fn(),
}));

// Mock the activation check
vi.mock("@/lib/data/activation", () => ({
  isActivated: vi.fn(),
}));

import { getCurrentUser, requireUser } from "../session";
import { auth } from "../auth-options";
import { isActivated } from "@/lib/data/activation";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockIsActivated = isActivated as ReturnType<typeof vi.fn>;

describe("getCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no session exists", async () => {
    mockAuth.mockResolvedValue(null);
    const user = await getCurrentUser();
    expect(user).toBeNull();
  });

  it("returns null when session has no user", async () => {
    mockAuth.mockResolvedValue({ user: null });
    const user = await getCurrentUser();
    expect(user).toBeNull();
  });

  it("returns a SessionUser from a valid session", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", name: "Jane", email: "jane@test.com", role: "admin" },
    });
    const user = await getCurrentUser();
    expect(user).toEqual({
      id: "u1",
      name: "Jane",
      email: "jane@test.com",
      role: "admin",
    });
  });

  it("defaults missing name to 'Unknown'", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", name: null, email: "jane@test.com", role: "admin" },
    });
    const user = await getCurrentUser();
    expect(user?.name).toBe("Unknown");
  });

  it("defaults missing role to 'reviewer'", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", name: "Jane", email: "jane@test.com" },
    });
    const user = await getCurrentUser();
    expect(user?.role).toBe("reviewer");
  });

  it("defaults missing email to empty string", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", name: "Jane", role: "admin" },
    });
    const user = await getCurrentUser();
    expect(user?.email).toBe("");
  });

  it("defaults missing id to empty string", async () => {
    mockAuth.mockResolvedValue({
      user: { name: "Jane", email: "jane@test.com", role: "admin" },
    });
    const user = await getCurrentUser();
    expect(user?.id).toBe("");
  });
});

describe("requireUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsActivated.mockResolvedValue(true);
  });

  it("throws 'Authentication required' when no session", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(requireUser()).rejects.toThrow("Authentication required");
  });

  it("throws 'Instance not activated' when not activated", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", name: "Jane", email: "jane@test.com", role: "admin" },
    });
    mockIsActivated.mockResolvedValue(false);
    await expect(requireUser()).rejects.toThrow("Instance not activated");
  });

  it("returns user when authenticated and activated", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", name: "Jane", email: "jane@test.com", role: "admin" },
    });
    mockIsActivated.mockResolvedValue(true);
    const user = await requireUser();
    expect(user).toEqual({
      id: "u1",
      name: "Jane",
      email: "jane@test.com",
      role: "admin",
    });
  });
});
