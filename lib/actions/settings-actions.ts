"use server";

import {
  setSetting,
  SETTING_KEYS,
  type DetectionToggle,
  type WorkflowConfig,
  type NotificationPref,
} from "@/lib/data/settings";
import { requireUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/authorize";
import { revalidatePath } from "next/cache";

export async function saveDetectionToggles(toggles: DetectionToggle[]) {
  const user = await requireUser();
  await requireAdmin(user);
  await setSetting(SETTING_KEYS.DETECTION_TOGGLES, toggles, user.name);
  revalidatePath("/admin/settings");
  return { success: true };
}

export async function saveWorkflowConfig(config: WorkflowConfig) {
  const user = await requireUser();
  await requireAdmin(user);
  await setSetting(SETTING_KEYS.WORKFLOW_CONFIG, config, user.name);
  revalidatePath("/admin/settings");
  return { success: true };
}

export async function saveNotificationPrefs(prefs: NotificationPref[]) {
  const user = await requireUser();
  await requireAdmin(user);
  await setSetting(SETTING_KEYS.NOTIFICATION_PREFS, prefs, user.name);
  revalidatePath("/admin/settings");
  return { success: true };
}
