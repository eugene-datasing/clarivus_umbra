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
import { isM365Configured, getMissingM365Vars, getM365Status } from "@/lib/integrations/m365-connector";
import SettingsClient from "./settings-client";

export default async function SettingsPage() {
  const [detectionToggles, workflowConfig, notificationPrefs, orgIdentity, thresholds, departments] =
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
      m365Status={m365Status}
    />
  );
}
