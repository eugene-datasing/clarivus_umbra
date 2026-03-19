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
import SettingsClient from "./settings-client";

export default async function SettingsPage() {
  const [detectionToggles, workflowConfig, notificationPrefs] =
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
    ]);

  return (
    <SettingsClient
      initialDetectionToggles={detectionToggles}
      initialWorkflowConfig={workflowConfig}
      initialNotificationPrefs={notificationPrefs}
    />
  );
}
