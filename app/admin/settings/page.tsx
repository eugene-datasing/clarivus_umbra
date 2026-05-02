import {
  getSetting,
  SETTING_KEYS,
  DEFAULT_DETECTION_TOGGLES,
  type DetectionToggle,
} from "@/lib/data/settings";
import { getOrgIdentity, getConfidenceThresholds } from "@/lib/data/org-config";
import { prisma } from "@/lib/db/prisma";
import { getBackupStatus, getBackupHistory } from "@/lib/data/backup-restore";
import { getRetentionStatus } from "@/lib/data/retention-status";
import SettingsClient from "./settings-client";

export default async function SettingsPage() {
  const [detectionToggles, orgIdentity, thresholds, dbUsers, retentionStatus] =
    await Promise.all([
      getSetting<DetectionToggle[]>(
        SETTING_KEYS.DETECTION_TOGGLES,
        DEFAULT_DETECTION_TOGGLES,
      ),
      getOrgIdentity(),
      getConfidenceThresholds(),
      prisma.user.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          updatedAt: true,
        },
      }),
      getRetentionStatus(),
    ]);

  // Fetch backup status and history (gracefully handle errors)
  let backupStatus;
  let backupHistoryData;
  try {
    [backupStatus, backupHistoryData] = await Promise.all([
      getBackupStatus(),
      getBackupHistory(),
    ]);
  } catch {
    backupStatus = undefined;
    backupHistoryData = undefined;
  }

  return (
    <SettingsClient
      initialDetectionToggles={detectionToggles}
      orgIdentity={orgIdentity}
      thresholds={thresholds}
      users={dbUsers.map((u) => ({
        name: u.name,
        email: u.email ?? "",
        role: u.role,
        isActive: u.isActive,
        lastLogin: u.updatedAt.toISOString(),
      }))}
      backupStatus={backupStatus}
      backupHistory={backupHistoryData}
      retentionStatus={retentionStatus}
    />
  );
}
