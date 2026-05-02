/**
 * Data access layer for system settings.
 * Settings are stored as key-value pairs with JSON values.
 */

import { prisma } from "@/lib/db/prisma";

/** Well-known setting keys */
export const SETTING_KEYS = {
  DETECTION_TOGGLES: "detection_toggles",
  NOTIFICATION_PREFS: "notification_prefs",
  ORG_IDENTITY: "org_identity",
  ORG_BRANDING: "org_branding",
  ORG_SIGNATORY: "org_signatory",
  CONFIDENCE_THRESHOLDS: "confidence_thresholds",
  SETUP_WIZARD_STATE: "setup_wizard_state",
  ACTIVATION_STATUS: "activation_status",
  INSTANCE_CONFIG: "instance_config",
  VIEWER_MODE: "VIEWER_MODE",
  RETENTION_CONFIG: "retention_config",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/**
 * Get a single setting value by key. Returns the default if not found.
 */
export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  if (!row) return defaultValue;
  return row.value as T;
}

/**
 * Set a setting value by key (upsert).
 */
export async function setSetting(
  key: string,
  value: unknown,
  updatedBy = "system",
): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    update: { value: value as object, updatedBy },
    create: { key, value: value as object, updatedBy },
  });
}

/**
 * Get all settings as a key-value map.
 */
export async function getAllSettings(): Promise<Record<string, unknown>> {
  const rows = await prisma.systemSetting.findMany();
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Default values (used when no DB row exists)
// ---------------------------------------------------------------------------

export interface DetectionToggle {
  label: string;
  enabled: boolean;
}

export const DEFAULT_DETECTION_TOGGLES: DetectionToggle[] = [
  { label: "Personal Names", enabled: true },
  { label: "Phone Numbers", enabled: true },
  { label: "Email Addresses", enabled: true },
  { label: "Physical Addresses", enabled: true },
  { label: "IRD Numbers", enabled: true },
  { label: "Bank Account Numbers", enabled: true },
  { label: "NZ Passport Numbers", enabled: true },
  { label: "Driver Licence Numbers", enabled: true },
  { label: "Vehicle Registration", enabled: true },
  { label: "Commercial Sensitivity", enabled: true },
  { label: "Legal Privilege", enabled: true },
  { label: "Free & Frank Opinions", enabled: true },
  { label: "Negotiation Positions", enabled: true },
  { label: "Safety Concerns", enabled: true },
  { label: "Law Enforcement", enabled: true },
  { label: "Council Commercial", enabled: true },
  { label: "Harassment Risk", enabled: true },
  { label: "Cultural Sensitivity", enabled: true },
  { label: "Health & Safety Measures", enabled: true },
];

/** Maps UI toggle labels to the detection type keys used in the pipeline. */
export const DETECTION_TYPE_MAP: Record<string, string> = {
  "Personal Names": "personal-name",
  "Phone Numbers": "phone",
  "Email Addresses": "email-addr",
  "Physical Addresses": "address",
  "IRD Numbers": "ird",
  "Bank Account Numbers": "bank-account",
  "NZ Passport Numbers": "nz-passport",
  "Driver Licence Numbers": "nz-driver-licence",
  "Vehicle Registration": "vehicle-reg",
  "Commercial Sensitivity": "commercial",
  "Legal Privilege": "legal-privilege",
  "Free & Frank Opinions": "free-frank",
  "Negotiation Positions": "negotiation",
  "Safety Concerns": "safety-concern",
  "Law Enforcement": "law-enforcement",
  "Council Commercial": "council-commercial",
  "Harassment Risk": "harassment-risk",
  "Cultural Sensitivity": "cultural-sensitivity",
  "Health & Safety Measures": "health-safety",
};

/**
 * Read detection toggles from settings and return the set of enabled
 * detection type keys (e.g. "phone", "ird", "commercial").
 */
export async function getEnabledDetectionTypes(): Promise<Set<string>> {
  const toggles = await getSetting<DetectionToggle[]>(
    SETTING_KEYS.DETECTION_TOGGLES,
    DEFAULT_DETECTION_TOGGLES,
  );
  const enabled = new Set<string>();
  for (const t of toggles) {
    if (t.enabled && DETECTION_TYPE_MAP[t.label]) {
      enabled.add(DETECTION_TYPE_MAP[t.label]);
    }
  }
  return enabled;
}

export interface WorkflowConfig {
  seniorReview: boolean;
  finalApproval: boolean;
}

export const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  seniorReview: true,
  finalApproval: true,
};

export interface NotificationPref {
  event: string;
  inApp: boolean;
  email: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPref[] = [
  { event: "Document assigned", inApp: true, email: true },
  { event: "Review submitted", inApp: true, email: true },
  { event: "Document rejected", inApp: true, email: true },
  { event: "Deadline approaching", inApp: true, email: true },
  { event: "Processing complete", inApp: true, email: false },
  { event: "Export ready", inApp: true, email: false },
];

// ---------------------------------------------------------------------------
// Organisation settings (WP21)
// ---------------------------------------------------------------------------

export interface OrgIdentity {
  name: string;
  maoriName: string;
  abbreviation: string;
  orgType: string;
  address: string;
  phone: string;
  email: string;
  website: string;
}

export const DEFAULT_ORG_IDENTITY: OrgIdentity = {
  name: "",
  maoriName: "",
  abbreviation: "",
  orgType: "District Council",
  address: "",
  phone: "",
  email: "",
  website: "",
};

export interface OrgBranding {
  logoStorageKey: string;
  footerText: string;
}

export const DEFAULT_ORG_BRANDING: OrgBranding = {
  logoStorageKey: "",
  footerText: "",
};

export interface OrgSignatory {
  name: string;
  title: string;
  department: string;
}

export const DEFAULT_ORG_SIGNATORY: OrgSignatory = {
  name: "",
  title: "Information and Privacy Officer",
  department: "",
};

export interface ConfidenceThresholds {
  high: number;
  medium: number;
}

export const DEFAULT_CONFIDENCE_THRESHOLDS: ConfidenceThresholds = {
  high: 85,
  medium: 50,
};

export interface SetupWizardState {
  currentStep: number;
  completedSteps: number[];
  completedAt?: string;
}

export const DEFAULT_SETUP_WIZARD_STATE: SetupWizardState = {
  currentStep: 0,
  completedSteps: [],
};

// ---------------------------------------------------------------------------
// Activation status (client deployment gate)
// ---------------------------------------------------------------------------

export interface ActivationStatus {
  activated: boolean;
  activatedAt?: string;
  activatedBy?: string;
}

export const DEFAULT_ACTIVATION_STATUS: ActivationStatus = {
  activated: false,
};

// ---------------------------------------------------------------------------
// Instance config (set during activation from activation code metadata)
// ---------------------------------------------------------------------------

export interface InstanceConfig {
  allowedDomain?: string;    // e.g. "council.govt.nz"
  orgTenantId?: string;      // Azure AD tenant ID (for reference)
}

export const DEFAULT_INSTANCE_CONFIG: InstanceConfig = {};

// ---------------------------------------------------------------------------
// Viewer mode (rollback lever for the pdf.js viewer cutover — Phase 3)
// ---------------------------------------------------------------------------

/**
 * Review-UI viewer mode. `"pdf"` routes to the pdf.js-based canonical
 * viewer (Phase 3 of the viewer rework — the post-cutover default);
 * `"html"` falls back to the legacy HTML reconstruction dual-panel
 * branch. The value is stored as a bare JSON string in
 * `system_settings.value` — unset rows fall through to the default
 * via `getSetting(key, default)`.
 *
 * This is a rollback lever, not a user-facing preference (Decision h,
 * v2). Admins flip via Prisma Studio or a direct settings update.
 * Slice D2 (April 2026) flipped the default from `"html"` to `"pdf"`
 * after Slices A → D1 landed all the dependent infrastructure: the
 * dual-panel viewer (Slice B), the manual-detection text-layer
 * handler (Slice C), the e2e suite migration (Slice D1), and the
 * post-cutover bug fixes for overlay rendering / colour / dedup /
 * keyboard selection (Slices B1, B2). The HTML branch is retained
 * indefinitely as the Option C fallback for canonicals where pdf.js
 * can't extract selectable text (`canonicalPdfTextSelectable === false`),
 * so even with the default at `"pdf"` reviewers still hit the HTML
 * view automatically on scanned / image-only documents.
 */
export type ViewerMode = "html" | "pdf";

export const DEFAULT_VIEWER_MODE: ViewerMode = "pdf";

export function isViewerMode(v: unknown): v is ViewerMode {
  return v === "html" || v === "pdf";
}

// ---------------------------------------------------------------------------
// Retention config (Phase 6)
// ---------------------------------------------------------------------------

/**
 * Retention + purge configuration. Drives both the soft-delete grace
 * window applied by `softDeleteBatch` and the auto-retention sweep
 * (Phase 6c) that promotes long-completed batches into the trash.
 *
 *   retentionDaysAfterCompletion — auto-soft-delete an exported
 *     batch after this many days of inactivity.
 *   gracePeriodDays — when a user (or auto-retention) soft-deletes a
 *     batch, hard-delete is scheduled for now() + gracePeriodDays.
 *     Admins can restore from the Trash within this window.
 *   autoRetentionEnabled — master switch for the retention sweep.
 */
export interface RetentionConfig {
  retentionDaysAfterCompletion: number;
  gracePeriodDays: number;
  autoRetentionEnabled: boolean;
}

export const DEFAULT_RETENTION_CONFIG: RetentionConfig = {
  retentionDaysAfterCompletion: 14,
  gracePeriodDays: 7,
  autoRetentionEnabled: true,
};

export async function getRetentionConfig(): Promise<RetentionConfig> {
  const stored = await getSetting<Partial<RetentionConfig>>(
    SETTING_KEYS.RETENTION_CONFIG,
    DEFAULT_RETENTION_CONFIG,
  );
  return {
    retentionDaysAfterCompletion:
      typeof stored.retentionDaysAfterCompletion === "number"
        ? stored.retentionDaysAfterCompletion
        : DEFAULT_RETENTION_CONFIG.retentionDaysAfterCompletion,
    gracePeriodDays:
      typeof stored.gracePeriodDays === "number"
        ? stored.gracePeriodDays
        : DEFAULT_RETENTION_CONFIG.gracePeriodDays,
    autoRetentionEnabled:
      typeof stored.autoRetentionEnabled === "boolean"
        ? stored.autoRetentionEnabled
        : DEFAULT_RETENTION_CONFIG.autoRetentionEnabled,
  };
}

export async function setRetentionConfig(
  config: RetentionConfig,
  updatedBy: string,
): Promise<void> {
  await setSetting(SETTING_KEYS.RETENTION_CONFIG, config, updatedBy);
}
