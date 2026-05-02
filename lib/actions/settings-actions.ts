"use server";

import {
  setSetting,
  setRetentionConfig,
  SETTING_KEYS,
  type DetectionToggle,
  type NotificationPref,
  type RetentionConfig,
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

export async function saveNotificationPrefs(prefs: NotificationPref[]) {
  const user = await requireUser();
  await requireAdmin(user);
  await setSetting(SETTING_KEYS.NOTIFICATION_PREFS, prefs, user.name);
  revalidatePath("/admin/settings");
  return { success: true };
}

export async function saveRetentionConfig(config: RetentionConfig) {
  const user = await requireUser();
  await requireAdmin(user);

  const sanitised: RetentionConfig = {
    retentionDaysAfterCompletion: Math.max(
      1,
      Math.floor(config.retentionDaysAfterCompletion),
    ),
    gracePeriodDays: Math.max(0, Math.floor(config.gracePeriodDays)),
    autoRetentionEnabled: !!config.autoRetentionEnabled,
  };

  await setRetentionConfig(sanitised, user.name);
  revalidatePath("/admin/retention");
  return { success: true, config: sanitised };
}
