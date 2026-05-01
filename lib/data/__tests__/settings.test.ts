import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    systemSetting: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import {
  getSetting,
  setSetting,
  getAllSettings,
  SETTING_KEYS,
  DEFAULT_DETECTION_TOGGLES,
  DEFAULT_NOTIFICATION_PREFS,
  DEFAULT_CONFIDENCE_THRESHOLDS,
  DEFAULT_SETUP_WIZARD_STATE,
  DEFAULT_ACTIVATION_STATUS,
  DEFAULT_VIEWER_MODE,
  isViewerMode,
} from "../settings";
import { prisma } from "@/lib/db/prisma";

const mockFindUnique = prisma.systemSetting.findUnique as ReturnType<typeof vi.fn>;
const mockFindMany = prisma.systemSetting.findMany as ReturnType<typeof vi.fn>;
const mockUpsert = prisma.systemSetting.upsert as ReturnType<typeof vi.fn>;

describe("getSetting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the stored value when setting exists", async () => {
    mockFindUnique.mockResolvedValue({
      key: "test_key",
      value: { enabled: true },
    });

    const result = await getSetting("test_key", { enabled: false });
    expect(result).toEqual({ enabled: true });
  });

  it("returns the default value when setting does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await getSetting("missing_key", { enabled: false });
    expect(result).toEqual({ enabled: false });
  });

  it("queries with the correct key", async () => {
    mockFindUnique.mockResolvedValue(null);

    await getSetting("detection_toggles", []);

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { key: "detection_toggles" },
    });
  });
});

describe("setSetting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({});
  });

  it("calls upsert with correct key and value", async () => {
    await setSetting("test_key", { enabled: true });

    expect(mockUpsert).toHaveBeenCalledWith({
      where: { key: "test_key" },
      update: { value: { enabled: true }, updatedBy: "system" },
      create: { key: "test_key", value: { enabled: true }, updatedBy: "system" },
    });
  });

  it("passes custom updatedBy value", async () => {
    await setSetting("test_key", "value", "admin-user");

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ updatedBy: "admin-user" }),
        create: expect.objectContaining({ updatedBy: "admin-user" }),
      }),
    );
  });

  it("defaults updatedBy to 'system'", async () => {
    await setSetting("test_key", "value");

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ updatedBy: "system" }),
      }),
    );
  });
});

describe("getAllSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a map of all settings", async () => {
    mockFindMany.mockResolvedValue([
      { key: "a", value: 1 },
      { key: "b", value: "hello" },
    ]);

    const result = await getAllSettings();
    expect(result).toEqual({ a: 1, b: "hello" });
  });

  it("returns empty object when no settings exist", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await getAllSettings();
    expect(result).toEqual({});
  });
});

describe("SETTING_KEYS", () => {
  it("defines all expected keys", () => {
    expect(SETTING_KEYS.DETECTION_TOGGLES).toBe("detection_toggles");
    expect(SETTING_KEYS.NOTIFICATION_PREFS).toBe("notification_prefs");
    expect(SETTING_KEYS.ORG_IDENTITY).toBe("org_identity");
    expect(SETTING_KEYS.ORG_BRANDING).toBe("org_branding");
    expect(SETTING_KEYS.ORG_SIGNATORY).toBe("org_signatory");
    expect(SETTING_KEYS.CONFIDENCE_THRESHOLDS).toBe("confidence_thresholds");
    expect(SETTING_KEYS.SETUP_WIZARD_STATE).toBe("setup_wizard_state");
    expect(SETTING_KEYS.ACTIVATION_STATUS).toBe("activation_status");
    expect(SETTING_KEYS.VIEWER_MODE).toBe("VIEWER_MODE");
  });
});

describe("VIEWER_MODE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DEFAULT_VIEWER_MODE is 'pdf' (Slice D2 cutover; was 'html' through Slices A → D1)", () => {
    expect(DEFAULT_VIEWER_MODE).toBe("pdf");
  });

  it("isViewerMode accepts 'html' and 'pdf', rejects anything else", () => {
    expect(isViewerMode("html")).toBe(true);
    expect(isViewerMode("pdf")).toBe(true);
    expect(isViewerMode("HTML")).toBe(false);
    expect(isViewerMode("")).toBe(false);
    expect(isViewerMode(null)).toBe(false);
    expect(isViewerMode(undefined)).toBe(false);
    expect(isViewerMode({ mode: "pdf" })).toBe(false);
    expect(isViewerMode(42)).toBe(false);
  });

  it("getSetting returns the default ('pdf' post-Slice-D2) when VIEWER_MODE row is absent", async () => {
    mockFindUnique.mockResolvedValue(null);
    const result = await getSetting(SETTING_KEYS.VIEWER_MODE, DEFAULT_VIEWER_MODE);
    expect(result).toBe("pdf");
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { key: "VIEWER_MODE" } });
  });

  it("getSetting returns the stored value when VIEWER_MODE row is 'pdf'", async () => {
    mockFindUnique.mockResolvedValue({ key: "VIEWER_MODE", value: "pdf" });
    const result = await getSetting(SETTING_KEYS.VIEWER_MODE, DEFAULT_VIEWER_MODE);
    expect(result).toBe("pdf");
  });

  it("getSetting returns 'html' when row exists but is explicitly set to 'html'", async () => {
    mockFindUnique.mockResolvedValue({ key: "VIEWER_MODE", value: "html" });
    const result = await getSetting(SETTING_KEYS.VIEWER_MODE, DEFAULT_VIEWER_MODE);
    expect(result).toBe("html");
  });

  it("isViewerMode guards callers against malformed stored values", async () => {
    // Simulates a hand-edited row with the old object-shaped value from the
    // plan doc's earlier spec; getSetting returns it verbatim and the caller
    // is expected to validate before using it.
    mockFindUnique.mockResolvedValue({ key: "VIEWER_MODE", value: { mode: "pdf" } });
    const raw = await getSetting<unknown>(SETTING_KEYS.VIEWER_MODE, DEFAULT_VIEWER_MODE);
    expect(isViewerMode(raw)).toBe(false);
    // Caller falls back to default — post-Slice-D2 the default is 'pdf'.
    const resolved = isViewerMode(raw) ? raw : DEFAULT_VIEWER_MODE;
    expect(resolved).toBe("pdf");
  });
});

describe("default values", () => {
  it("DEFAULT_DETECTION_TOGGLES has sensible structure", () => {
    expect(Array.isArray(DEFAULT_DETECTION_TOGGLES)).toBe(true);
    expect(DEFAULT_DETECTION_TOGGLES.length).toBeGreaterThan(0);
    for (const toggle of DEFAULT_DETECTION_TOGGLES) {
      expect(toggle).toHaveProperty("label");
      expect(toggle).toHaveProperty("enabled");
      expect(typeof toggle.label).toBe("string");
      expect(typeof toggle.enabled).toBe("boolean");
    }
  });

  it("DEFAULT_CONFIDENCE_THRESHOLDS has high > medium", () => {
    expect(DEFAULT_CONFIDENCE_THRESHOLDS.high).toBeGreaterThan(
      DEFAULT_CONFIDENCE_THRESHOLDS.medium,
    );
  });

  it("DEFAULT_ACTIVATION_STATUS is not activated", () => {
    expect(DEFAULT_ACTIVATION_STATUS.activated).toBe(false);
  });

  it("DEFAULT_SETUP_WIZARD_STATE starts at step 0", () => {
    expect(DEFAULT_SETUP_WIZARD_STATE.currentStep).toBe(0);
    expect(DEFAULT_SETUP_WIZARD_STATE.completedSteps).toEqual([]);
  });
});
