"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Users,
  Brain,
  Settings2,
  Activity,
  Server,
  Database,
  Cloud,
  Shield,
  CheckCircle,
  ToggleLeft,
  ToggleRight,
  Save,
  Loader2,
  Building2,
  Plug,
  XCircle,
  AlertTriangle,
  Archive,
  Search,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import {
  saveDetectionToggles,
  saveWorkflowConfig,
  saveNotificationPrefs,
} from "@/lib/actions/settings-actions";
import type {
  DetectionToggle,
  WorkflowConfig,
  NotificationPref,
  OrgIdentity,
  ConfidenceThresholds,
} from "@/lib/data/settings";
import type {
  BackupStatus,
  BackupEntry,
} from "@/lib/data/backup-restore";
import BackupRestore from "./backup-restore";

/* ------------------------------------------------------------------ */
/*  Tab configuration — consolidated from 9 to 6                      */
/* ------------------------------------------------------------------ */

type TabId = "organisation" | "detection" | "workflow" | "integrations" | "backup" | "health";

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "organisation", label: "Organisation", icon: Building2 },
  { id: "detection", label: "Detection", icon: Brain },
  { id: "workflow", label: "Workflow", icon: Settings2 },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "backup", label: "Backup", icon: Database },
  { id: "health", label: "System Health", icon: Server },
];

/* ------------------------------------------------------------------ */
/*  Role display helpers                                              */
/* ------------------------------------------------------------------ */

const roleBadgeMap: Record<string, string> = {
  admin: "bg-red-50 text-red-700",
  "request-manager": "bg-purple-50 text-purple-700",
  "senior-reviewer": "bg-teal-50 text-teal-700",
  "final-approver": "bg-amber-50 text-amber-700",
  reviewer: "bg-blue-50 text-blue-700",
};

const roleLabelMap: Record<string, string> = {
  admin: "Administrator",
  "request-manager": "Request Manager",
  "senior-reviewer": "Senior Reviewer",
  "final-approver": "Final Approver",
  reviewer: "Reviewer",
};

/* ------------------------------------------------------------------ */
/*  System health types                                                */
/* ------------------------------------------------------------------ */

interface HealthCheckResponse {
  status: "healthy" | "degraded" | "unhealthy";
  checks: Record<string, "ok" | "error" | "circuit-open" | "circuit-half-open">;
  circuits: Record<string, { state: string; failureCount: number; successCount: number }>;
  timestamp: string;
}

/* ------------------------------------------------------------------ */
/*  Organisation sub-sections                                          */
/* ------------------------------------------------------------------ */

type OrgSection = "details" | "departments" | "users";

/* ------------------------------------------------------------------ */
/*  Props from server component                                       */
/* ------------------------------------------------------------------ */

interface SettingsDepartment {
  id: string;
  name: string;
  contactEmail: string | null;
  headName: string | null;
  isActive: boolean;
  userCount: number;
}

interface M365StatusInfo {
  configured: boolean;
  connected: boolean;
  provider?: string;
  siteName?: string;
  tenantId?: string;
  missingVars: string[];
}

interface RecordsStatusInfo {
  configured: boolean;
  connected: boolean;
  provider: string | null;
  lastSync: string | null;
  error?: string;
}

interface EDiscoveryStatusInfo {
  configured: boolean;
  connected: boolean;
  provider: string | null;
  matterCount: number;
  error?: string;
}

interface SettingsUser {
  name: string;
  email: string;
  role: string;
  department: string | null;
  isActive: boolean;
  lastLogin: string;
}

interface SettingsClientProps {
  initialDetectionToggles: DetectionToggle[];
  initialWorkflowConfig: WorkflowConfig;
  initialNotificationPrefs: NotificationPref[];
  orgIdentity: OrgIdentity;
  thresholds: ConfidenceThresholds;
  departments: SettingsDepartment[];
  users: SettingsUser[];
  m365Status?: M365StatusInfo;
  recordsStatus?: RecordsStatusInfo;
  ediscoveryStatus?: EDiscoveryStatusInfo;
  backupStatus?: BackupStatus;
  backupHistory?: BackupEntry[];
}

/* ------------------------------------------------------------------ */
/*  Page component                                                    */
/* ------------------------------------------------------------------ */

export default function SettingsClient({
  initialDetectionToggles,
  initialWorkflowConfig,
  initialNotificationPrefs,
  orgIdentity,
  thresholds,
  departments,
  users,
  m365Status,
  recordsStatus,
  ediscoveryStatus,
  backupStatus,
  backupHistory,
}: SettingsClientProps) {
  const [activeTab, setActiveTab] = useState<TabId>("organisation");
  const [orgSection, setOrgSection] = useState<OrgSection>("details");

  // Detection state
  const [detectionToggles, setDetectionToggles] = useState(initialDetectionToggles);
  const [detectionDirty, setDetectionDirty] = useState(false);
  const [detectionSaveStatus, setDetectionSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Workflow state
  const [seniorReview, setSeniorReview] = useState(initialWorkflowConfig.seniorReview);
  const [finalApproval, setFinalApproval] = useState(initialWorkflowConfig.finalApproval);
  const [amberDays, setAmberDays] = useState(initialWorkflowConfig.amberWarningDays);
  const [redDays, setRedDays] = useState(initialWorkflowConfig.redWarningDays);
  const [notifications, setNotifications] = useState(initialNotificationPrefs);
  const [workflowDirty, setWorkflowDirty] = useState(false);
  const [workflowSaveStatus, setWorkflowSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Health state
  const [healthData, setHealthData] = useState<HealthCheckResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const [isPending, startTransition] = useTransition();

  // Track dirty state for detection
  const toggleDetection = (index: number) => {
    setDetectionToggles((prev) =>
      prev.map((t, i) => (i === index ? { ...t, enabled: !t.enabled } : t))
    );
    setDetectionDirty(true);
  };

  // Track dirty state for notifications
  const toggleNotification = (index: number, field: "inApp" | "email") => {
    setNotifications((prev) =>
      prev.map((n, i) => (i === index ? { ...n, [field]: !n[field] } : n))
    );
    setWorkflowDirty(true);
  };

  // Track dirty state for workflow changes
  const updateSeniorReview = (val: boolean) => { setSeniorReview(val); setWorkflowDirty(true); };
  const updateFinalApproval = (val: boolean) => { setFinalApproval(val); setWorkflowDirty(true); };
  const updateAmberDays = (val: number) => { setAmberDays(val); setWorkflowDirty(true); };
  const updateRedDays = (val: number) => { setRedDays(val); setWorkflowDirty(true); };

  // Per-section save: Detection
  const handleSaveDetection = () => {
    setDetectionSaveStatus("saving");
    startTransition(async () => {
      try {
        await saveDetectionToggles(detectionToggles);
        setDetectionSaveStatus("saved");
        setDetectionDirty(false);
        setTimeout(() => setDetectionSaveStatus("idle"), 2000);
      } catch {
        setDetectionSaveStatus("error");
        setTimeout(() => setDetectionSaveStatus("idle"), 3000);
      }
    });
  };

  // Per-section save: Workflow + Notifications
  const handleSaveWorkflow = () => {
    setWorkflowSaveStatus("saving");
    startTransition(async () => {
      try {
        await saveWorkflowConfig({
          seniorReview,
          finalApproval,
          amberWarningDays: amberDays,
          redWarningDays: redDays,
        });
        await saveNotificationPrefs(notifications);
        setWorkflowSaveStatus("saved");
        setWorkflowDirty(false);
        setTimeout(() => setWorkflowSaveStatus("idle"), 2000);
      } catch {
        setWorkflowSaveStatus("error");
        setTimeout(() => setWorkflowSaveStatus("idle"), 3000);
      }
    });
  };

  // Fetch real health data
  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      setHealthData(data);
    } catch {
      setHealthData(null);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  // Fetch health when the tab is shown
  useEffect(() => {
    if (activeTab === "health") {
      fetchHealth();
    }
  }, [activeTab, fetchHealth]);

  // Unsaved changes warning
  useEffect(() => {
    const hasDirty = detectionDirty || workflowDirty;
    const handler = (e: BeforeUnloadEvent) => {
      if (hasDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [detectionDirty, workflowDirty]);

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-txt-primary">
          System Administration
        </h1>
        <p className="text-sm text-txt-secondary mt-1">
          Manage organisation settings, detection configuration, workflow, integrations, and system health.
        </p>
      </div>

      {/* Tab navigation — scrollable on mobile */}
      <div className="relative mb-6">
        <div className="flex items-center gap-1 border-b border-border overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0",
                  isActive
                    ? "border-brand-primary text-brand-primary"
                    : "border-transparent text-txt-secondary hover:text-txt-primary hover:border-gray-300"
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {/* Dirty indicator */}
                {tab.id === "detection" && detectionDirty && (
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                )}
                {tab.id === "workflow" && workflowDirty && (
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ============================================================ */}
      {/* TAB: Organisation (merged Org + Departments + Users)         */}
      {/* ============================================================ */}
      {activeTab === "organisation" && (
        <div className="space-y-6">
          {/* Sub-section navigation */}
          <div className="flex gap-2">
            {([
              { id: "details" as const, label: "Organisation Details", count: null },
              { id: "departments" as const, label: "Departments", count: departments.length },
              { id: "users" as const, label: "Users & Roles", count: users.filter(u => u.isActive).length },
            ]).map((section) => (
              <button
                key={section.id}
                onClick={() => setOrgSection(section.id)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  orgSection === section.id
                    ? "bg-brand-primary text-white"
                    : "bg-surface-bg text-txt-secondary hover:text-txt-primary hover:bg-gray-100"
                )}
              >
                {section.label}
                {section.count !== null && (
                  <span className={cn(
                    "ml-1.5 text-xs px-1.5 py-0.5 rounded-full",
                    orgSection === section.id ? "bg-white/20" : "bg-gray-200 text-gray-600"
                  )}>
                    {section.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Organisation Details */}
          {orgSection === "details" && (
            <div className="card">
              <h2 className="text-lg font-heading font-semibold text-txt-primary mb-4">Organisation Identity</h2>
              <p className="text-sm text-txt-secondary mb-4">
                Organisation details are configured during initial setup. To edit, visit the{" "}
                <a href="/setup?edit=true" className="text-brand-primary hover:underline font-medium">Setup Wizard</a>.
              </p>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-txt-secondary">Name</dt>
                  <dd className="font-medium text-txt-primary">{orgIdentity.name || "\u2014"}</dd>
                </div>
                <div>
                  <dt className="text-txt-secondary">Te Reo Maori Name</dt>
                  <dd className="font-medium text-txt-primary">{orgIdentity.maoriName || "\u2014"}</dd>
                </div>
                <div>
                  <dt className="text-txt-secondary">Abbreviation</dt>
                  <dd className="font-medium text-txt-primary">{orgIdentity.abbreviation || "\u2014"}</dd>
                </div>
                <div>
                  <dt className="text-txt-secondary">Type</dt>
                  <dd className="font-medium text-txt-primary">{orgIdentity.orgType}</dd>
                </div>
                <div>
                  <dt className="text-txt-secondary">Phone</dt>
                  <dd className="font-medium text-txt-primary">{orgIdentity.phone || "\u2014"}</dd>
                </div>
                <div>
                  <dt className="text-txt-secondary">Email</dt>
                  <dd className="font-medium text-txt-primary">{orgIdentity.email || "\u2014"}</dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-txt-secondary">Address</dt>
                  <dd className="font-medium text-txt-primary">{orgIdentity.address || "\u2014"}</dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-txt-secondary">Website</dt>
                  <dd className="font-medium text-txt-primary">{orgIdentity.website || "\u2014"}</dd>
                </div>
              </dl>
            </div>
          )}

          {/* Departments */}
          {orgSection === "departments" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-txt-secondary">
                  Department structure is configured during setup. To add or edit departments, visit the{" "}
                  <a href="/setup?edit=true" className="text-brand-primary hover:underline font-medium">Setup Wizard</a>.
                </p>
              </div>
              <div className="card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-bg">
                      <th className="text-left px-6 py-3 font-medium text-txt-secondary">Name</th>
                      <th className="text-left px-6 py-3 font-medium text-txt-secondary">Contact Email</th>
                      <th className="text-left px-6 py-3 font-medium text-txt-secondary">Head Person</th>
                      <th className="text-center px-6 py-3 font-medium text-txt-secondary">Users</th>
                      <th className="text-center px-6 py-3 font-medium text-txt-secondary">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {departments.map((dept) => (
                      <tr key={dept.id} className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors">
                        <td className="px-6 py-3.5 font-medium text-txt-primary">{dept.name}</td>
                        <td className="px-6 py-3.5 text-txt-secondary font-mono text-xs">{dept.contactEmail || "\u2014"}</td>
                        <td className="px-6 py-3.5 text-txt-secondary">{dept.headName || "\u2014"}</td>
                        <td className="px-6 py-3.5 text-center text-txt-secondary">{dept.userCount}</td>
                        <td className="px-6 py-3.5 text-center">
                          <span className={cn("badge", dept.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500")}>
                            {dept.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {departments.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-txt-secondary">
                          No departments configured. Use the Setup Wizard to add departments.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Users & Roles */}
          {orgSection === "users" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-txt-secondary">
                  User accounts are managed through the{" "}
                  <a href="/setup?edit=true" className="text-brand-primary hover:underline font-medium">Setup Wizard</a>{" "}
                  or via SCIM provisioning from Azure AD.
                </p>
              </div>
              <div className="card p-0 overflow-hidden">
                {users.length === 0 ? (
                  <p className="text-sm text-txt-secondary py-8 text-center">No users provisioned yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-bg">
                        <th className="text-left px-6 py-3 font-medium text-txt-secondary">Name</th>
                        <th className="text-left px-6 py-3 font-medium text-txt-secondary">Email</th>
                        <th className="text-left px-6 py-3 font-medium text-txt-secondary">Department</th>
                        <th className="text-left px-6 py-3 font-medium text-txt-secondary">Role</th>
                        <th className="text-left px-6 py-3 font-medium text-txt-secondary">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.email} className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors">
                          <td className="px-6 py-3.5 font-medium text-txt-primary">{user.name}</td>
                          <td className="px-6 py-3.5 text-txt-secondary font-mono text-xs">{user.email}</td>
                          <td className="px-6 py-3.5 text-txt-secondary text-xs">{user.department ?? "\u2014"}</td>
                          <td className="px-6 py-3.5">
                            <span className={cn("badge", roleBadgeMap[user.role] ?? "bg-gray-50 text-gray-700")}>{roleLabelMap[user.role] ?? user.role}</span>
                          </td>
                          <td className="px-6 py-3.5">
                            <span className={cn("badge", user.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500")}>
                              {user.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB: Detection Settings                                      */}
      {/* ============================================================ */}
      {activeTab === "detection" && (
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-heading font-semibold text-txt-primary mb-2">
              Confidence Thresholds
            </h2>
            <p className="text-sm text-txt-secondary mb-4">
              AI detections are classified by confidence level. These thresholds determine the colour coding in the review interface.
            </p>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-40 text-sm font-medium text-txt-primary">High Confidence</div>
                <div className="flex-1">
                  <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: "100%" }} />
                  </div>
                </div>
                <div className="w-20 text-right text-sm font-mono text-green-700 font-medium">&ge; {thresholds.high}%</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-40 text-sm font-medium text-txt-primary">Medium Confidence</div>
                <div className="flex-1">
                  <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full" style={{ width: `${thresholds.high - 1}%` }} />
                  </div>
                </div>
                <div className="w-20 text-right text-sm font-mono text-amber-600 font-medium">{thresholds.medium} &ndash; {thresholds.high - 1}%</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-40 text-sm font-medium text-txt-primary">Low Confidence</div>
                <div className="flex-1">
                  <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-red-400 rounded-full" style={{ width: `${thresholds.medium - 1}%` }} />
                  </div>
                </div>
                <div className="w-20 text-right text-sm font-mono text-red-600 font-medium">&lt; {thresholds.medium}%</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-heading font-semibold text-txt-primary">
                  Entity Detection Types
                </h2>
                <p className="text-sm text-txt-secondary mt-1">
                  Enable or disable detection categories. Changes apply to new document processing only.
                </p>
              </div>
              <SaveButton
                status={detectionSaveStatus}
                dirty={detectionDirty}
                isPending={isPending}
                onClick={handleSaveDetection}
              />
            </div>
            <div className="divide-y divide-border">
              {detectionToggles.map((toggle, i) => (
                <div key={toggle.label} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <span className="text-sm text-txt-primary">{toggle.label}</span>
                  <button onClick={() => toggleDetection(i)} className="transition-colors" title={toggle.enabled ? "Disable" : "Enable"}>
                    {toggle.enabled ? (
                      <ToggleRight className="w-8 h-8 text-brand-primary" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-gray-300" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB: Workflow (Review stages + Deadlines + Notifications)     */}
      {/* ============================================================ */}
      {activeTab === "workflow" && (
        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-heading font-semibold text-txt-primary">Review Stages</h2>
                <p className="text-sm text-txt-secondary mt-1">
                  Configure which review stages are required in the disclosure workflow.
                </p>
              </div>
              <SaveButton
                status={workflowSaveStatus}
                dirty={workflowDirty}
                isPending={isPending}
                onClick={handleSaveWorkflow}
              />
            </div>
            <div className="space-y-3">
              <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" checked disabled className="w-4 h-4 rounded accent-brand-primary" />
                <span className="text-txt-primary font-medium">Reviewer Stage</span>
                <span className="text-xs text-txt-secondary">(required &mdash; cannot be disabled)</span>
              </label>
              <label className="flex items-center gap-3 text-sm cursor-pointer">
                <input type="checkbox" checked={seniorReview} onChange={() => updateSeniorReview(!seniorReview)} className="w-4 h-4 rounded accent-brand-primary" />
                <span className="text-txt-primary font-medium">Senior Review</span>
              </label>
              <label className="flex items-center gap-3 text-sm cursor-pointer">
                <input type="checkbox" checked={finalApproval} onChange={() => updateFinalApproval(!finalApproval)} className="w-4 h-4 rounded accent-brand-primary" />
                <span className="text-txt-primary font-medium">Final Approval</span>
              </label>
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-heading font-semibold text-txt-primary mb-2">Deadline Warning Thresholds</h2>
            <p className="text-sm text-txt-secondary mb-4">
              Set the number of working days remaining before deadline warnings are shown on cases.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-txt-primary mb-1.5">
                  <span className="inline-block w-3 h-3 rounded-full bg-amber-400 mr-2" />
                  Amber Warning (days)
                </label>
                <input type="number" className="input-field w-32" value={amberDays} onChange={(e) => updateAmberDays(Number(e.target.value))} min={1} />
              </div>
              <div>
                <label className="block text-sm font-medium text-txt-primary mb-1.5">
                  <span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-2" />
                  Red Warning (days)
                </label>
                <input type="number" className="input-field w-32" value={redDays} onChange={(e) => updateRedDays(Number(e.target.value))} min={1} />
              </div>
            </div>
          </div>

          {/* Notifications — moved into workflow tab */}
          <div className="card">
            <h2 className="text-lg font-heading font-semibold text-txt-primary mb-2">Notification Preferences</h2>
            <p className="text-sm text-txt-secondary mb-4">
              Choose how users are notified about workflow events. These are system-wide defaults.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">Event</th>
                    <th className="text-center px-4 py-2.5 font-medium text-txt-secondary">In-App</th>
                    <th className="text-center px-4 py-2.5 font-medium text-txt-secondary">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.map((n, i) => (
                    <tr key={n.event} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-txt-primary">{n.event}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleNotification(i, "inApp")}
                          className="inline-flex transition-colors"
                          aria-label={`Toggle in-app notification for ${n.event}`}
                        >
                          {n.inApp ? (
                            <ToggleRight className="w-7 h-7 text-brand-primary" />
                          ) : (
                            <ToggleLeft className="w-7 h-7 text-gray-300" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleNotification(i, "email")}
                          className="inline-flex transition-colors"
                          aria-label={`Toggle email notification for ${n.event}`}
                        >
                          {n.email ? (
                            <ToggleRight className="w-7 h-7 text-brand-primary" />
                          ) : (
                            <ToggleLeft className="w-7 h-7 text-gray-300" />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB: Integrations (collapsible sections)                     */}
      {/* ============================================================ */}
      {activeTab === "integrations" && (
        <div className="space-y-4">
          <p className="text-sm text-txt-secondary mb-2">
            External system integrations. Configure environment variables to enable each connector.
          </p>

          <IntegrationCard
            icon={Cloud}
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
            title="Microsoft 365"
            description="SharePoint & OneDrive document import"
            configured={m365Status?.configured ?? false}
            connected={m365Status?.connected ?? false}
          >
            {m365Status?.configured && m365Status.connected && (
              <div className="p-4 rounded-lg bg-green-50/50 border border-green-200">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div>
                    <dt className="text-txt-secondary text-xs">Provider</dt>
                    <dd className="font-medium text-txt-primary capitalize">
                      {m365Status.provider || "SharePoint"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-txt-secondary text-xs">Organisation</dt>
                    <dd className="font-medium text-txt-primary">
                      {m365Status.siteName || "\u2014"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-txt-secondary text-xs">Tenant ID</dt>
                    <dd className="font-medium text-txt-primary font-mono text-xs">
                      {m365Status.tenantId || "\u2014"}
                    </dd>
                  </div>
                </dl>
              </div>
            )}
            {!m365Status?.configured && (
              <div className="space-y-2">
                {(m365Status?.missingVars ?? ["M365_TENANT_ID", "M365_CLIENT_ID", "M365_CLIENT_SECRET"]).map(
                  (envVar) => (
                    <div key={envVar} className="flex items-center gap-2 px-3 py-2 rounded bg-white border border-border">
                      <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <code className="text-xs font-mono text-txt-primary">{envVar}</code>
                      <span className="text-xs text-red-500 ml-auto">Not set</span>
                    </div>
                  ),
                )}
                <div className="mt-3 p-3 rounded bg-blue-50/60 border border-blue-200">
                  <p className="text-xs text-blue-700">
                    <span className="font-semibold">Setup guide:</span> Register an app in Azure AD
                    with Microsoft Graph API permissions (Sites.Read.All, Files.Read.All).
                  </p>
                </div>
              </div>
            )}
            {m365Status?.configured && !m365Status.connected && (
              <p className="text-sm text-amber-700 p-3 rounded bg-amber-50/50 border border-amber-200">
                Environment variables are configured but the connection to Microsoft Graph API
                could not be established. Verify credentials and permissions.
              </p>
            )}
          </IntegrationCard>

          <IntegrationCard
            icon={Archive}
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
            title="Records Management"
            description="EDRMS integration (SharePoint Records, OpenText, HPRM, CMIS)"
            configured={recordsStatus?.configured ?? false}
            connected={recordsStatus?.connected ?? false}
          >
            {recordsStatus?.configured && recordsStatus.connected && (
              <div className="p-4 rounded-lg bg-green-50/50 border border-green-200">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div>
                    <dt className="text-txt-secondary text-xs">Provider</dt>
                    <dd className="font-medium text-txt-primary capitalize">{recordsStatus.provider || "\u2014"}</dd>
                  </div>
                  <div>
                    <dt className="text-txt-secondary text-xs">Last Sync</dt>
                    <dd className="font-medium text-txt-primary text-xs">
                      {recordsStatus.lastSync ? new Date(recordsStatus.lastSync).toLocaleString("en-NZ") : "Never"}
                    </dd>
                  </div>
                </dl>
              </div>
            )}
            {!recordsStatus?.configured && (
              <div className="space-y-2">
                {["RECORDS_PROVIDER", "RECORDS_ENDPOINT", "RECORDS_CLIENT_ID", "RECORDS_CLIENT_SECRET"].map(
                  (envVar) => (
                    <div key={envVar} className="flex items-center gap-2 px-3 py-2 rounded bg-white border border-border">
                      <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <code className="text-xs font-mono text-txt-primary">{envVar}</code>
                      <span className="text-xs text-red-500 ml-auto">Not set</span>
                    </div>
                  ),
                )}
                <div className="mt-3 p-3 rounded bg-blue-50/60 border border-blue-200">
                  <p className="text-xs text-blue-700">
                    <span className="font-semibold">Supported:</span>{" "}
                    <code className="font-mono">sharepoint-records</code>,{" "}
                    <code className="font-mono">opentext</code>,{" "}
                    <code className="font-mono">hprm</code>,{" "}
                    <code className="font-mono">generic-cmis</code>.
                  </p>
                </div>
              </div>
            )}
            {recordsStatus?.configured && !recordsStatus.connected && (
              <p className="text-sm text-amber-700 p-3 rounded bg-amber-50/50 border border-amber-200">
                Connection failed.{recordsStatus.error && <span className="block mt-1 text-xs font-mono">{recordsStatus.error}</span>}
              </p>
            )}
          </IntegrationCard>

          <IntegrationCard
            icon={Search}
            iconBg="bg-purple-50"
            iconColor="text-purple-600"
            title="eDiscovery"
            description="eDiscovery platform integration (Relativity, Nuix, Clearwell)"
            configured={ediscoveryStatus?.configured ?? false}
            connected={ediscoveryStatus?.connected ?? false}
          >
            {ediscoveryStatus?.configured && ediscoveryStatus.connected && (
              <div className="p-4 rounded-lg bg-green-50/50 border border-green-200">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div>
                    <dt className="text-txt-secondary text-xs">Provider</dt>
                    <dd className="font-medium text-txt-primary capitalize">{ediscoveryStatus.provider || "\u2014"}</dd>
                  </div>
                  <div>
                    <dt className="text-txt-secondary text-xs">Active Matters</dt>
                    <dd className="font-medium text-txt-primary">{ediscoveryStatus.matterCount}</dd>
                  </div>
                </dl>
              </div>
            )}
            {!ediscoveryStatus?.configured && (
              <div className="space-y-2">
                {["EDISCOVERY_PROVIDER", "EDISCOVERY_ENDPOINT", "EDISCOVERY_API_KEY"].map(
                  (envVar) => (
                    <div key={envVar} className="flex items-center gap-2 px-3 py-2 rounded bg-white border border-border">
                      <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <code className="text-xs font-mono text-txt-primary">{envVar}</code>
                      <span className="text-xs text-red-500 ml-auto">Not set</span>
                    </div>
                  ),
                )}
                <div className="mt-3 p-3 rounded bg-blue-50/60 border border-blue-200">
                  <p className="text-xs text-blue-700">
                    <span className="font-semibold">Supported:</span>{" "}
                    <code className="font-mono">relativity</code>,{" "}
                    <code className="font-mono">nuix</code>,{" "}
                    <code className="font-mono">clearwell</code>,{" "}
                    <code className="font-mono">generic</code>.
                  </p>
                </div>
              </div>
            )}
            {ediscoveryStatus?.configured && !ediscoveryStatus.connected && (
              <p className="text-sm text-amber-700 p-3 rounded bg-amber-50/50 border border-amber-200">
                Connection failed.{ediscoveryStatus.error && <span className="block mt-1 text-xs font-mono">{ediscoveryStatus.error}</span>}
              </p>
            )}
          </IntegrationCard>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB: Backup & Recovery                                       */}
      {/* ============================================================ */}
      {activeTab === "backup" && (
        backupStatus && backupHistory ? (
          <BackupRestore
            initialStatus={backupStatus}
            initialHistory={backupHistory}
          />
        ) : (
          <div className="card">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 border border-red-200">
              <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-800">Unable to load backup data</p>
                <p className="text-xs text-red-600 mt-0.5">Failed to fetch backup status. Refresh the page or contact support.</p>
              </div>
            </div>
          </div>
        )
      )}

      {/* ============================================================ */}
      {/* TAB: System Health (real data from /api/health)              */}
      {/* ============================================================ */}
      {activeTab === "health" && (
        <div className="space-y-6">
          {healthLoading && !healthData && (
            <div className="card flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-brand-primary mr-3" />
              <span className="text-sm text-txt-secondary">Checking system health...</span>
            </div>
          )}

          {healthData && (
            <>
              {/* Overall status */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Activity className="w-5 h-5 text-brand-primary" />
                    <div>
                      <h2 className="text-lg font-heading font-semibold text-txt-primary">System Status</h2>
                      <p className="text-xs text-txt-secondary">
                        Last checked: {new Date(healthData.timestamp).toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={fetchHealth} disabled={healthLoading} className="btn-secondary text-xs flex items-center gap-1.5">
                      <Activity className={cn("w-3.5 h-3.5", healthLoading && "animate-spin")} />
                      Refresh
                    </button>
                    <span className={cn(
                      "badge flex items-center gap-1.5",
                      healthData.status === "healthy" && "bg-green-50 text-green-700",
                      healthData.status === "degraded" && "bg-amber-50 text-amber-700",
                      healthData.status === "unhealthy" && "bg-red-50 text-red-700",
                    )}>
                      {healthData.status === "healthy" && <CheckCircle className="w-3.5 h-3.5" />}
                      {healthData.status === "degraded" && <AlertTriangle className="w-3.5 h-3.5" />}
                      {healthData.status === "unhealthy" && <XCircle className="w-3.5 h-3.5" />}
                      {healthData.status.charAt(0).toUpperCase() + healthData.status.slice(1)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(healthData.checks).map(([name, checkStatus]) => {
                    const label = name === "app" ? "Application" : name === "database" ? "Database" : name === "openai" ? "Azure OpenAI" : "Document Intelligence";
                    const Icon = name === "database" ? Database : name === "openai" ? Brain : name === "documentIntelligence" ? Activity : Server;
                    return (
                      <div key={name} className="p-4 rounded-lg bg-surface-bg text-center">
                        <Icon className="w-5 h-5 mx-auto mb-2 text-brand-primary" />
                        <div className="text-sm font-medium text-txt-primary mb-1.5">{label}</div>
                        <span className={cn(
                          "badge mx-auto text-xs",
                          checkStatus === "ok" && "bg-green-50 text-green-700",
                          checkStatus === "error" && "bg-red-50 text-red-700",
                          (checkStatus === "circuit-open" || checkStatus === "circuit-half-open") && "bg-amber-50 text-amber-700",
                        )}>
                          {checkStatus === "ok" && <><CheckCircle className="w-3 h-3" /> Operational</>}
                          {checkStatus === "error" && <><XCircle className="w-3 h-3" /> Error</>}
                          {checkStatus === "circuit-open" && <><AlertTriangle className="w-3 h-3" /> Circuit Open</>}
                          {checkStatus === "circuit-half-open" && <><AlertTriangle className="w-3 h-3" /> Recovering</>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Circuit breaker details */}
              {healthData.circuits && Object.keys(healthData.circuits).length > 0 && (
                <div className="card">
                  <h2 className="text-lg font-heading font-semibold text-txt-primary mb-4">Circuit Breaker Status</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(healthData.circuits).map(([name, stats]) => (
                      <div key={name} className="p-4 rounded-lg bg-surface-bg">
                        <div className="text-sm font-medium text-txt-primary mb-2 capitalize">{name === "openai" ? "Azure OpenAI" : "Document Intelligence"}</div>
                        <dl className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <dt className="text-txt-secondary">State</dt>
                            <dd className={cn(
                              "font-medium capitalize",
                              stats.state === "closed" && "text-green-700",
                              stats.state === "open" && "text-red-700",
                              stats.state === "half-open" && "text-amber-700",
                            )}>{stats.state}</dd>
                          </div>
                          <div>
                            <dt className="text-txt-secondary">Failures</dt>
                            <dd className="font-medium text-txt-primary">{stats.failureCount}</dd>
                          </div>
                          <div>
                            <dt className="text-txt-secondary">Successes</dt>
                            <dd className="font-medium text-txt-primary">{stats.successCount}</dd>
                          </div>
                        </dl>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {!healthLoading && !healthData && (
            <div className="card">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 border border-red-200">
                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-800">Unable to reach health endpoint</p>
                  <p className="text-xs text-red-600 mt-0.5">The /api/health endpoint did not respond. Check server logs.</p>
                </div>
                <button onClick={fetchHealth} className="btn-secondary text-xs ml-auto">Retry</button>
              </div>
            </div>
          )}

          <div className="card">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-brand-primary" />
              <div>
                <p className="text-sm font-medium text-txt-primary">Veil v0.1.0-prototype</p>
                <p className="text-xs text-txt-secondary">Azure NZ North</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Reusable sub-components                                            */
/* ------------------------------------------------------------------ */

/** Per-section save button */
function SaveButton({
  status,
  dirty,
  isPending,
  onClick,
}: {
  status: "idle" | "saving" | "saved" | "error";
  dirty: boolean;
  isPending: boolean;
  onClick: () => void;
}) {
  if (!dirty && status === "idle") return null;

  return (
    <button
      onClick={onClick}
      disabled={isPending || status === "saving" || (!dirty && status !== "saved")}
      className={cn(
        "btn-primary flex items-center gap-2 text-sm",
        status === "saved" && "bg-green-600 hover:bg-green-600",
        status === "error" && "bg-red-600 hover:bg-red-600",
      )}
    >
      {status === "saving" || isPending ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : status === "saved" ? (
        <CheckCircle className="w-4 h-4" />
      ) : (
        <Save className="w-4 h-4" />
      )}
      {status === "saving" || isPending
        ? "Saving..."
        : status === "saved"
          ? "Saved"
          : status === "error"
            ? "Failed \u2014 Retry"
            : "Save Changes"}
    </button>
  );
}

/** Collapsible integration card */
function IntegrationCard({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  description,
  configured,
  connected,
  children,
}: {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  configured: boolean;
  connected: boolean;
  children: React.ReactNode;
}) {
  // Auto-expand if configured (whether connected or not), collapsed if not configured
  const [expanded, setExpanded] = useState(configured);

  return (
    <div className="card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", iconBg)}>
            <Icon className={cn("w-5 h-5", iconColor)} />
          </div>
          <div>
            <h2 className="text-lg font-heading font-semibold text-txt-primary">{title}</h2>
            <p className="text-xs text-txt-secondary">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {configured && connected ? (
            <span className="badge bg-green-50 text-green-700 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" />
              Connected
            </span>
          ) : configured && !connected ? (
            <span className="badge bg-amber-50 text-amber-700 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Error
            </span>
          ) : (
            <span className="badge bg-gray-100 text-gray-500 flex items-center gap-1.5">
              Not Configured
            </span>
          )}
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-txt-secondary" />
          ) : (
            <ChevronRight className="w-4 h-4 text-txt-secondary" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="mt-4 pt-4 border-t border-border">
          {children}
        </div>
      )}
    </div>
  );
}
