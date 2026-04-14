import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireUser = vi.fn();
const mockAuthorizeForCase = vi.fn();
const mockCreateAuditEntry = vi.fn();
const mockGetLGOIMAConfig = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireUser: (...args: unknown[]) => mockRequireUser(...args),
}));

vi.mock("@/lib/auth/authorize", () => ({
  authorizeForCase: (...args: unknown[]) => mockAuthorizeForCase(...args),
}));

vi.mock("@/lib/data/audit", () => ({
  createAuditEntry: (...args: unknown[]) => mockCreateAuditEntry(...args),
}));

vi.mock("@/lib/data/org-config", () => ({
  getLGOIMAConfig: () => mockGetLGOIMAConfig(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockFindUniqueOrThrow = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    case: {
      findUniqueOrThrow: (...args: unknown[]) => mockFindUniqueOrThrow(...args),
      create: vi.fn(),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

import { extendDeadline } from "../case-actions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fakeUser = { id: "u1", name: "Test User", role: "admin" };

function setupDefaults() {
  mockRequireUser.mockResolvedValue(fakeUser);
  mockAuthorizeForCase.mockResolvedValue(undefined);
  mockCreateAuditEntry.mockResolvedValue(undefined);
  mockGetLGOIMAConfig.mockResolvedValue({
    defaultResponseDays: 20,
    extensionMaxDays: 40,
    amberWarningDays: 10,
    redWarningDays: 5,
  });
  mockFindUniqueOrThrow.mockResolvedValue({
    id: "case1",
    reference: "LGOIMA-2025-001",
    deadline: new Date("2025-02-03"),
    dateReceived: new Date("2025-01-06"),
  });
  mockUpdate.mockResolvedValue({});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("extendDeadline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it("extends deadline successfully with valid input", async () => {
    const result = await extendDeadline({
      caseId: "case1",
      newDeadline: "2025-02-10",
      reason: "Additional documents requested from requester",
    });

    expect(result).toEqual({ success: true });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "case1" },
      data: { deadline: new Date("2025-02-10") },
    });
    expect(mockCreateAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userName: "Test User",
        type: "admin",
        description: "Extended case deadline",
        target: "LGOIMA-2025-001",
        caseId: "case1",
        previousValue: "2025-02-03",
        newValue: "2025-02-10",
        detail: "Additional documents requested from requester",
      }),
    );
  });

  it("rejects when new deadline is before current deadline", async () => {
    await expect(
      extendDeadline({
        caseId: "case1",
        newDeadline: "2025-01-30",
        reason: "Some reason",
      }),
    ).rejects.toThrow("New deadline must be after the current deadline");
  });

  it("rejects when new deadline equals current deadline", async () => {
    await expect(
      extendDeadline({
        caseId: "case1",
        newDeadline: "2025-02-03",
        reason: "Some reason",
      }),
    ).rejects.toThrow("New deadline must be after the current deadline");
  });

  it("rejects when new deadline exceeds max extension", async () => {
    mockGetLGOIMAConfig.mockResolvedValue({
      defaultResponseDays: 20,
      extensionMaxDays: 5,
      amberWarningDays: 10,
      redWarningDays: 5,
    });

    await expect(
      extendDeadline({
        caseId: "case1",
        newDeadline: "2025-06-01",
        reason: "Some reason",
      }),
    ).rejects.toThrow("exceeds the maximum extension");
  });

  it("rejects when reason is missing (Zod validation)", async () => {
    await expect(
      extendDeadline({
        caseId: "case1",
        newDeadline: "2025-02-10",
        reason: "",
      }),
    ).rejects.toThrow();
  });

  it("rejects when caseId is missing (Zod validation)", async () => {
    await expect(
      extendDeadline({
        caseId: "",
        newDeadline: "2025-02-10",
        reason: "Some reason",
      }),
    ).rejects.toThrow();
  });

  it("rejects when newDeadline is invalid (Zod validation)", async () => {
    await expect(
      extendDeadline({
        caseId: "case1",
        newDeadline: "not-a-date",
        reason: "Some reason",
      }),
    ).rejects.toThrow();
  });
});
