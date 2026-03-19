/**
 * Data access layer for system settings.
 * Settings are stored as key-value pairs with JSON values.
 */

import { prisma } from "@/lib/db/prisma";

/** Well-known setting keys */
export const SETTING_KEYS = {
  DETECTION_TOGGLES: "detection_toggles",
  WORKFLOW_CONFIG: "workflow_config",
  NOTIFICATION_PREFS: "notification_prefs",
  ORG_IDENTITY: "org_identity",
  ORG_BRANDING: "org_branding",
  ORG_SIGNATORY: "org_signatory",
  ORG_OMBUDSMAN: "org_ombudsman",
  LGOIMA_CONFIG: "lgoima_config",
  CONFIDENCE_THRESHOLDS: "confidence_thresholds",
  SETUP_WIZARD_STATE: "setup_wizard_state",
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
  { label: "Vehicle Registration", enabled: false },
  { label: "Commercial Sensitivity", enabled: true },
  { label: "Legal Privilege", enabled: true },
  { label: "Free & Frank Opinions", enabled: true },
];

export interface WorkflowConfig {
  seniorReview: boolean;
  finalApproval: boolean;
  amberWarningDays: number;
  redWarningDays: number;
}

export const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  seniorReview: true,
  finalApproval: true,
  amberWarningDays: 10,
  redWarningDays: 5,
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

export interface OrgOmbudsman {
  line1: string;
  line2: string;
  city: string;
  phone: string;
  email: string;
}

export const DEFAULT_ORG_OMBUDSMAN: OrgOmbudsman = {
  line1: "Office of the Ombudsman",
  line2: "PO Box 10152",
  city: "Wellington 6143",
  phone: "0800 802 602",
  email: "info@ombudsman.parliament.nz",
};

export interface LGOIMAConfig {
  defaultResponseDays: number;
  extensionMaxDays: number;
  escalationThresholdDays: number;
}

export const DEFAULT_LGOIMA_CONFIG: LGOIMAConfig = {
  defaultResponseDays: 20,
  extensionMaxDays: 40,
  escalationThresholdDays: 15,
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
