import {
  getSetting,
  SETTING_KEYS,
  DEFAULT_DETECTION_TOGGLES,
  DEFAULT_WORKFLOW_CONFIG,
  DEFAULT_NOTIFICATION_PREFS,
  type DetectionToggle,
  type WorkflowConfig,
  type NotificationPref,
} from "@/lib/data/settings";
import {
  getOrgIdentity,
  getConfidenceThresholds,
} from "@/lib/data/org-config";
import { getAllDepartments } from "@/lib/data/departments";
import { prisma } from "@/lib/db/prisma";
import { isM365Configured, getMissingM365Vars, getM365Status } from "@/lib/integrations/m365-connector";
import { isRecordsConfigured, getRecordsStatus } from "@/lib/integrations/records-connector";
import { isEDiscoveryConfigured, getEDiscoveryStatus } from "@/lib/integrations/ediscovery-connector";
import { getBackupStatus, getBackupHistory } from "@/lib/data/backup-restore";
import SettingsClient from "./settings-client";

export default async function SettingsPage() {
  const [detectionToggles, workflowConfig, notificationPrefs, orgIdentity, thresholds, departments, dbUsers] =
    await Promise.all([
      getSetting<DetectionToggle[]>(
        SETTING_KEYS.DETECTION_TOGGLES,
        DEFAULT_DETECTION_TOGGLES,
      ),
      getSetting<WorkflowConfig>(
        SETTING_KEYS.WORKFLOW_CONFIG,
        DEFAULT_WORKFLOW_CONFIG,
      ),
      getSetting<NotificationPref[]>(
        SETTING_KEYS.NOTIFICATION_PREFS,
        DEFAULT_NOTIFICATION_PREFS,
      ),
      getOrgIdentity(),
      getConfidenceThresholds(),
      getAllDepartments(),
      prisma.user.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          updatedAt: true,
          department: { select: { name: true } },
        },
      }),
    ]);

  // Fetch M365 status (gracefully handle errors)
  let m365Status: {
    configured: boolean;
    connected: boolean;
    provider?: string;
    siteName?: string;
    tenantId?: string;
    missingVars: string[];
  };

  if (isM365Configured()) {
    try {
      const status = await getM365Status();
      m365Status = {
        configured: status.configured,
        connected: status.connection?.connected ?? false,
        provider: status.connection?.provider,
        siteName: status.connection?.siteName,
        tenantId: status.connection?.tenantId,
        missingVars: status.missingVars,
      };
    } catch {
      m365Status = {
        configured: true,
        connected: false,
        missingVars: [],
      };
    }
  } else {
    m365Status = {
      configured: false,
      connected: false,
      missingVars: getMissingM365Vars(),
    };
  }

  // Fetch Records Management status (gracefully handle errors)
  let recordsStatus: {
    configured: boolean;
    connected: boolean;
    provider: string | null;
    lastSync: string | null;
    error?: string;
  };

  if (isRecordsConfigured()) {
    try {
      const status = await getRecordsStatus();
      recordsStatus = {
        configured: status.configured,
        connected: status.connected,
        provider: status.provider,
        lastSync: status.lastSync,
        error: status.error,
      };
    } catch {
      recordsStatus = {
        configured: true,
        connected: false,
        provider: process.env.RECORDS_PROVIDER ?? null,
        lastSync: null,
        error: "Failed to connect",
      };
    }
  } else {
    recordsStatus = {
      configured: false,
      connected: false,
      provider: null,
      lastSync: null,
    };
  }

  // Fetch eDiscovery status (gracefully handle errors)
  let ediscoveryStatus: {
    configured: boolean;
    connected: boolean;
    provider: string | null;
    matterCount: number;
    error?: string;
  };

  if (isEDiscoveryConfigured()) {
    try {
      const status = await getEDiscoveryStatus();
      ediscoveryStatus = {
        configured: status.configured,
        connected: status.connected,
        provider: status.provider,
        matterCount: status.matterCount,
        error: status.error,
      };
    } catch {
      ediscoveryStatus = {
        configured: true,
        connected: false,
        provider: process.env.EDISCOVERY_PROVIDER ?? null,
        matterCount: 0,
        error: "Failed to connect",
      };
    }
  } else {
    ediscoveryStatus = {
      configured: false,
      connected: false,
      provider: null,
      matterCount: 0,
    };
  }

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
      initialWorkflowConfig={workflowConfig}
      initialNotificationPrefs={notificationPrefs}
      orgIdentity={orgIdentity}
      thresholds={thresholds}
      departments={departments.map((d) => ({
        id: d.id,
        name: d.name,
        contactEmail: d.contactEmail,
        headName: d.headName,
        isActive: d.isActive,
        userCount: d._count.users,
      }))}
      users={dbUsers.map((u) => ({
        name: u.name,
        email: u.email ?? "",
        role: u.role,
        department: u.department?.name ?? null,
        isActive: u.isActive,
        lastLogin: u.updatedAt.toISOString(),
      }))}
      m365Status={m365Status}
      recordsStatus={recordsStatus}
      ediscoveryStatus={ediscoveryStatus}
      backupStatus={backupStatus}
      backupHistory={backupHistoryData}
    />
  );
}
