"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import {
  Users,
  Brain,
  Settings2,
  RefreshCw,
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

/* ------------------------------------------------------------------ */
/*  Tab configuration                                                 */
/* ------------------------------------------------------------------ */

type TabId = "organisation" | "departments" | "users" | "detection" | "workflow" | "notifications" | "health";

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "organisation", label: "Organisation", icon: Building2 },
  { id: "departments", label: "Departments", icon: Users },
  { id: "users", label: "Users & Roles", icon: Users },
  { id: "detection", label: "Detection Settings", icon: Brain },
  { id: "workflow", label: "Workflow", icon: Settings2 },
  { id: "notifications", label: "Notifications", icon: Activity },
  { id: "health", label: "System Health", icon: Server },
];

/* ------------------------------------------------------------------ */
/*  Mock data (Users + Health — not persisted)                        */
/* ------------------------------------------------------------------ */

interface MockUser {
  name: string;
  email: string;
  azureGroup: string;
  role: string;
  roleBadge: string;
  status: "Active" | "Inactive";
  lastLogin: string;
}

const mockUsers: MockUser[] = [
  { name: "A. Richardson", email: "a.richardson@npdc.govt.nz", azureGroup: "NPDC-Disclosure-Managers", role: "Request Manager", roleBadge: "bg-purple-50 text-purple-700", status: "Active", lastLogin: "18 Mar 2026, 09:12" },
  { name: "K. Williams", email: "k.williams@npdc.govt.nz", azureGroup: "NPDC-Disclosure-Reviewers", role: "Reviewer", roleBadge: "bg-blue-50 text-blue-700", status: "Active", lastLogin: "18 Mar 2026, 10:15" },
  { name: "M. Patel", email: "m.patel@npdc.govt.nz", azureGroup: "NPDC-Disclosure-Reviewers", role: "Reviewer", roleBadge: "bg-blue-50 text-blue-700", status: "Active", lastLogin: "18 Mar 2026, 10:30" },
  { name: "J. Chen", email: "j.chen@npdc.govt.nz", azureGroup: "NPDC-Senior-Reviewers", role: "Senior Reviewer", roleBadge: "bg-teal-50 text-teal-700", status: "Active", lastLogin: "18 Mar 2026, 10:42" },
  { name: "D. Harper", email: "d.harper@npdc.govt.nz", azureGroup: "NPDC-Final-Approvers", role: "Final Approver", roleBadge: "bg-amber-50 text-amber-700", status: "Active", lastLogin: "17 Mar 2026, 16:45" },
  { name: "S. Kumar", email: "s.kumar@npdc.govt.nz", azureGroup: "NPDC-IT-Admins", role: "System Administrator", roleBadge: "bg-red-50 text-red-700", status: "Active", lastLogin: "18 Mar 2026, 08:00" },
];

interface ServiceStatus {
  name: string;
  status: "Operational";
  response: string;
  icon: React.ElementType;
}

const services: ServiceStatus[] = [
  { name: "Azure Blob Storage", status: "Operational", response: "12ms", icon: Cloud },
  { name: "Azure Cosmos DB", status: "Operational", response: "8ms", icon: Database },
  { name: "Azure AI Search", status: "Operational", response: "23ms", icon: Brain },
  { name: "Azure OpenAI", status: "Operational", response: "45ms", icon: Activity },
  { name: "Azure Functions", status: "Operational", response: "15ms", icon: Server },
];

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

interface SettingsClientProps {
  initialDetectionToggles: DetectionToggle[];
  initialWorkflowConfig: WorkflowConfig;
  initialNotificationPrefs: NotificationPref[];
  orgIdentity: OrgIdentity;
  thresholds: ConfidenceThresholds;
  departments: SettingsDepartment[];
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
}: SettingsClientProps) {
  const [activeTab, setActiveTab] = useState<TabId>("organisation");
  const [detectionToggles, setDetectionToggles] = useState(initialDetectionToggles);
  const [notifications, setNotifications] = useState(initialNotificationPrefs);
  const [seniorReview, setSeniorReview] = useState(initialWorkflowConfig.seniorReview);
  const [finalApproval, setFinalApproval] = useState(initialWorkflowConfig.finalApproval);
  const [amberDays, setAmberDays] = useState(initialWorkflowConfig.amberWarningDays);
  const [redDays, setRedDays] = useState(initialWorkflowConfig.redWarningDays);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isPending, startTransition] = useTransition();

  const toggleDetection = (index: number) => {
    setDetectionToggles((prev) =>
      prev.map((t, i) => (i === index ? { ...t, enabled: !t.enabled } : t))
    );
  };

  const toggleNotification = (index: number, field: "inApp" | "email") => {
    setNotifications((prev) =>
      prev.map((n, i) => (i === index ? { ...n, [field]: !n[field] } : n))
    );
  };

  const handleSave = async () => {
    setSaveStatus("saving");
    try {
      startTransition(async () => {
        if (activeTab === "detection") {
          await saveDetectionToggles(detectionToggles);
        } else if (activeTab === "workflow") {
          await saveWorkflowConfig({
            seniorReview,
            finalApproval,
            amberWarningDays: amberDays,
            redWarningDays: redDays,
          });
        } else if (activeTab === "notifications") {
          await saveNotificationPrefs(notifications);
        }
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      });
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  const showSave = activeTab === "detection" || activeTab === "workflow" || activeTab === "notifications";

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-heading font-bold text-txt-primary">
            System Administration
          </h1>
          <p className="text-sm text-txt-secondary mt-1">
            Manage users, detection settings, workflow, notifications and system health
          </p>
        </div>
        {showSave && (
          <button
            onClick={handleSave}
            disabled={isPending || saveStatus === "saving"}
            className={cn(
              "btn-primary flex items-center gap-2",
              saveStatus === "saved" && "bg-green-600 hover:bg-green-600",
              saveStatus === "error" && "bg-red-600 hover:bg-red-600",
            )}
          >
            {saveStatus === "saving" || isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saveStatus === "saved" ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saveStatus === "saving" || isPending
              ? "Saving..."
              : saveStatus === "saved"
                ? "Saved"
                : saveStatus === "error"
                  ? "Failed"
                  : "Save Changes"}
          </button>
        )}
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-border mb-6">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                isActive
                  ? "border-brand-primary text-brand-primary"
                  : "border-transparent text-txt-secondary hover:text-txt-primary hover:border-gray-300"
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB: Organisation */}
      {activeTab === "organisation" && (
        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-heading font-semibold text-txt-primary">Organisation Identity</h2>
              <a href="/setup" className="btn-secondary text-xs">Edit in Setup Wizard</a>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-txt-secondary">Name</dt>
                <dd className="font-medium text-txt-primary">{orgIdentity.name || "--"}</dd>
              </div>
              <div>
                <dt className="text-txt-secondary">Te Reo Maori Name</dt>
                <dd className="font-medium text-txt-primary">{orgIdentity.maoriName || "--"}</dd>
              </div>
              <div>
                <dt className="text-txt-secondary">Abbreviation</dt>
                <dd className="font-medium text-txt-primary">{orgIdentity.abbreviation || "--"}</dd>
              </div>
              <div>
                <dt className="text-txt-secondary">Type</dt>
                <dd className="font-medium text-txt-primary">{orgIdentity.orgType}</dd>
              </div>
              <div>
                <dt className="text-txt-secondary">Phone</dt>
                <dd className="font-medium text-txt-primary">{orgIdentity.phone || "--"}</dd>
              </div>
              <div>
                <dt className="text-txt-secondary">Email</dt>
                <dd className="font-medium text-txt-primary">{orgIdentity.email || "--"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-txt-secondary">Address</dt>
                <dd className="font-medium text-txt-primary">{orgIdentity.address || "--"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-txt-secondary">Website</dt>
                <dd className="font-medium text-txt-primary">{orgIdentity.website || "--"}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {/* TAB: Departments */}
      {activeTab === "departments" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-txt-secondary">
              <span className="font-medium text-txt-primary">{departments.length}</span> departments configured
            </p>
            <a href="/setup" className="btn-secondary text-xs">Manage in Setup Wizard</a>
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
                    <td className="px-6 py-3.5 text-txt-secondary font-mono text-xs">{dept.contactEmail || "--"}</td>
                    <td className="px-6 py-3.5 text-txt-secondary">{dept.headName || "--"}</td>
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

      {/* TAB 1: Users & Roles */}
      {activeTab === "users" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-txt-secondary">
              Last synced: <span className="font-medium text-txt-primary">3 minutes ago</span> &mdash; <span className="font-medium text-txt-primary">23 users</span> active
            </p>
            <button className="btn-secondary flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4" /> Sync Now
            </button>
          </div>

          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-bg">
                  <th className="text-left px-6 py-3 font-medium text-txt-secondary">Name</th>
                  <th className="text-left px-6 py-3 font-medium text-txt-secondary">Email</th>
                  <th className="text-left px-6 py-3 font-medium text-txt-secondary">Azure AD Group</th>
                  <th className="text-left px-6 py-3 font-medium text-txt-secondary">Veil Role</th>
                  <th className="text-left px-6 py-3 font-medium text-txt-secondary">Status</th>
                  <th className="text-left px-6 py-3 font-medium text-txt-secondary">Last Login</th>
                </tr>
              </thead>
              <tbody>
                {mockUsers.map((user) => (
                  <tr key={user.email} className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors">
                    <td className="px-6 py-3.5 font-medium text-txt-primary">{user.name}</td>
                    <td className="px-6 py-3.5 text-txt-secondary font-mono text-xs">{user.email}</td>
                    <td className="px-6 py-3.5 text-txt-secondary text-xs">{user.azureGroup}</td>
                    <td className="px-6 py-3.5">
                      <span className={cn("badge", user.roleBadge)}>{user.role}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="badge bg-green-50 text-green-700">{user.status}</span>
                    </td>
                    <td className="px-6 py-3.5 text-txt-secondary text-xs">{user.lastLogin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Detection Settings */}
      {activeTab === "detection" && (
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-heading font-semibold text-txt-primary mb-4">
              Confidence Thresholds
            </h2>
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
            <h2 className="text-lg font-heading font-semibold text-txt-primary mb-4">
              Entity Detection Types
            </h2>
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

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-heading font-semibold text-txt-primary">Pattern Library</h2>
                <p className="text-sm text-txt-secondary mt-1">v2.3.1 &mdash; Updated 15 Mar 2026</p>
              </div>
              <button className="btn-secondary text-xs">Check for Updates</button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Workflow */}
      {activeTab === "workflow" && (
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-heading font-semibold text-txt-primary mb-4">Review Stages</h2>
            <p className="text-sm text-txt-secondary mb-4">
              Configure which review stages are required in the disclosure workflow.
            </p>
            <div className="space-y-3">
              <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" checked disabled className="w-4 h-4 rounded accent-brand-primary" />
                <span className="text-txt-primary font-medium">Reviewer Stage</span>
                <span className="text-xs text-txt-secondary">(required &mdash; cannot be disabled)</span>
              </label>
              <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" checked={seniorReview} onChange={() => setSeniorReview(!seniorReview)} className="w-4 h-4 rounded accent-brand-primary" />
                <span className="text-txt-primary font-medium">Senior Review</span>
              </label>
              <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" checked={finalApproval} onChange={() => setFinalApproval(!finalApproval)} className="w-4 h-4 rounded accent-brand-primary" />
                <span className="text-txt-primary font-medium">Final Approval</span>
              </label>
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-heading font-semibold text-txt-primary mb-4">Deadline Warning Thresholds</h2>
            <p className="text-sm text-txt-secondary mb-4">
              Set the number of working days remaining before deadline warnings are shown.
            </p>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-txt-primary mb-1.5">
                  <span className="inline-block w-3 h-3 rounded-full bg-amber-400 mr-2" />
                  Amber Warning (days)
                </label>
                <input type="number" className="input-field w-32" value={amberDays} onChange={(e) => setAmberDays(Number(e.target.value))} min={1} />
              </div>
              <div>
                <label className="block text-sm font-medium text-txt-primary mb-1.5">
                  <span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-2" />
                  Red Warning (days)
                </label>
                <input type="number" className="input-field w-32" value={redDays} onChange={(e) => setRedDays(Number(e.target.value))} min={1} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Notifications */}
      {activeTab === "notifications" && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-bg">
                <th className="text-left px-6 py-3 font-medium text-txt-secondary">Event</th>
                <th className="text-center px-6 py-3 font-medium text-txt-secondary">In-App</th>
                <th className="text-center px-6 py-3 font-medium text-txt-secondary">Email</th>
              </tr>
            </thead>
            <tbody>
              {notifications.map((n, i) => (
                <tr key={n.event} className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors">
                  <td className="px-6 py-3.5 text-txt-primary">{n.event}</td>
                  <td className="px-6 py-3.5 text-center">
                    <button onClick={() => toggleNotification(i, "inApp")}>
                      {n.inApp ? (
                        <CheckCircle className="w-5 h-5 text-green-600 mx-auto" />
                      ) : (
                        <span className="w-5 h-5 rounded-full border-2 border-gray-300 block mx-auto" />
                      )}
                    </button>
                  </td>
                  <td className="px-6 py-3.5 text-center">
                    <button onClick={() => toggleNotification(i, "email")}>
                      {n.email ? (
                        <CheckCircle className="w-5 h-5 text-green-600 mx-auto" />
                      ) : (
                        <span className="w-5 h-5 rounded-full border-2 border-gray-300 block mx-auto" />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 5: System Health */}
      {activeTab === "health" && (
        <div className="space-y-6">
          <div className="grid grid-cols-5 gap-4">
            {services.map((svc) => {
              const Icon = svc.icon;
              return (
                <div key={svc.name} className="card text-center">
                  <Icon className="w-6 h-6 text-brand-primary mx-auto mb-2" />
                  <div className="text-sm font-medium text-txt-primary mb-1.5">{svc.name}</div>
                  <span className="badge bg-green-50 text-green-700 mx-auto">
                    <CheckCircle className="w-3 h-3" />
                    {svc.status}
                  </span>
                  <p className="text-xs text-txt-secondary mt-2">Response: {svc.response}</p>
                </div>
              );
            })}
          </div>

          <div className="card">
            <h2 className="text-lg font-heading font-semibold text-txt-primary mb-3">Storage Usage</h2>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-primary rounded-full transition-all" style={{ width: "12.4%" }} />
                </div>
              </div>
              <span className="text-sm font-mono text-txt-primary font-medium whitespace-nowrap">12.4 GB / 100 GB</span>
            </div>
            <p className="text-xs text-txt-secondary mt-2">Azure Blob Storage &mdash; NZ North region</p>
          </div>

          <div className="card">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-brand-primary" />
              <div>
                <p className="text-sm font-medium text-txt-primary">Veil v0.1.0-prototype</p>
                <p className="text-xs text-txt-secondary">Deployed 18 Mar 2026</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
