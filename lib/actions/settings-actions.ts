"use server";

import {
  setSetting,
  SETTING_KEYS,
  type DetectionToggle,
  type WorkflowConfig,
  type NotificationPref,
} from "@/lib/data/settings";
import { revalidatePath } from "next/cache";

export async function saveDetectionToggles(toggles: DetectionToggle[]) {
  await setSetting(SETTING_KEYS.DETECTION_TOGGLES, toggles, "Admin");
  revalidatePath("/admin/settings");
  return { success: true };
}

export async function saveWorkflowConfig(config: WorkflowConfig) {
  await setSetting(SETTING_KEYS.WORKFLOW_CONFIG, config, "Admin");
  revalidatePath("/admin/settings");
  return { success: true };
}

export async function saveNotificationPrefs(prefs: NotificationPref[]) {
  await setSetting(SETTING_KEYS.NOTIFICATION_PREFS, prefs, "Admin");
  revalidatePath("/admin/settings");
  return { success: true };
}
