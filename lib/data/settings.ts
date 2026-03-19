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
