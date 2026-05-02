"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Brain,
  Activity,
  Server,
  Database,
  Shield,
  CheckCircle,
  ToggleLeft,
  ToggleRight,
  Save,
  Loader2,
  Building2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { saveDetectionToggles } from "@/lib/actions/settings-actions";
import type {
  DetectionToggle,
  OrgIdentity,
  ConfidenceThresholds,
} from "@/lib/data/settings";
import type {
  BackupStatus,
  BackupEntry,
} from "@/lib/data/backup-restore";
import BackupRestore from "./backup-restore";

/* ------------------------------------------------------------------ */
/*  Tab configuration — Umbra slim set                                */
/* ------------------------------------------------------------------ */

type TabId = "organisation" | "detection" | "backup" | "health";

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "organisation", label: "Organisation", icon: Building2 },
  { id: "detection", label: "Detection", icon: Brain },
  { id: "backup", label: "Backup", icon: Database },
  { id: "health", label: "System Health", icon: Server },
];

/* ------------------------------------------------------------------ */
/*  Role display helpers                                              */
/* ------------------------------------------------------------------ */

const roleBadgeMap: Record<string, string> = {
  admin: "bg-red-50 text-red-700",
  reviewer: "bg-blue-50 text-blue-700",
};

const roleLabelMap: Record<string, string> = {
  admin: "Administrator",
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

type OrgSection = "details" | "users";

/* ------------------------------------------------------------------ */
/*  Props from server component                                       */
/* ------------------------------------------------------------------ */

interface SettingsUser {
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLogin: string;
}

interface RetentionStatusSummary {
  lastArchivedAt: string | null;
  trashCount: number;
  archivedTotal: number;
}

interface SettingsClientProps {
  initialDetectionToggles: DetectionToggle[];
  orgIdentity: OrgIdentity;
  thresholds: ConfidenceThresholds;
  users: SettingsUser[];
  backupStatus?: BackupStatus;
  backupHistory?: BackupEntry[];
  retentionStatus: RetentionStatusSummary;
}

/* ------------------------------------------------------------------ */
/*  Page component                                                    */
/* ------------------------------------------------------------------ */

export default function SettingsClient({
  initialDetectionToggles,
  orgIdentity,
  thresholds,
  users,
  backupStatus,
  backupHistory,
  retentionStatus,
}: SettingsClientProps) {
  const [activeTab, setActiveTab] = useState<TabId>("organisation");
  const [orgSection, setOrgSection] = useState<OrgSection>("details");

  // Detection state
  const [detectionToggles, setDetectionToggles] = useState(initialDetectionToggles);
  const [detectionDirty, setDetectionDirty] = useState(false);
  const [detectionSaveStatus, setDetectionSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

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
    const handler = (e: BeforeUnloadEvent) => {
      if (detectionDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [detectionDirty]);

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-txt-primary">
          System Administration
        </h1>
        <p className="text-sm text-txt-secondary mt-1">
          Manage organisation settings, detection configuration, backup, and system health.
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
                {tab.id === "detection" && detectionDirty && (
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ============================================================ */}
      {/* TAB: Organisation (Details + Users)                          */}
      {/* ============================================================ */}
      {activeTab === "organisation" && (
        <div className="space-y-6">
          {/* Sub-section navigation */}
          <div className="flex gap-2">
            {([
              { id: "details" as const, label: "Organisation Details", count: null },
              { id: "users" as const, label: "Users & Roles", count: users.filter((u) => u.isActive).length },
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

          {/* Users & Roles */}
          {orgSection === "users" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-txt-secondary">
                  User accounts are managed through the{" "}
                  <a href="/setup?edit=true" className="text-brand-primary hover:underline font-medium">Setup Wizard</a>.
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
                        <th className="text-left px-6 py-3 font-medium text-txt-secondary">Role</th>
                        <th className="text-left px-6 py-3 font-medium text-txt-secondary">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.email} className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors">
                          <td className="px-6 py-3.5 font-medium text-txt-primary">{user.name}</td>
                          <td className="px-6 py-3.5 text-txt-secondary font-mono text-xs">{user.email}</td>
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
      {/* TAB: Backup & Recovery                                       */}
      {/* ============================================================ */}
      {activeTab === "backup" && (
        <div className="space-y-6">
          {/* Phase 6 retention worker summary — surfaces the live state
              of the soft-delete grace window + audit-archive worker. */}
          <div className="card">
            <h2 className="text-sm font-semibold text-txt-primary mb-1">
              Retention &amp; Audit Archive
            </h2>
            <p className="text-xs text-txt-secondary mb-4">
              Soft-deleted batches and the immutable audit archive produced by
              the retention worker. The full controls live on the{" "}
              <Link
                href="/admin/retention"
                className="text-brand-primary hover:underline"
              >
                Retention page
              </Link>
              .
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div className="bg-surface-bg rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wider text-txt-secondary font-semibold mb-1">
                  Trash count
                </div>
                <div className="text-lg font-mono font-semibold text-txt-primary">
                  {retentionStatus.trashCount}
                </div>
                <div className="text-[11px] text-txt-secondary mt-0.5">
                  soft-deleted batches awaiting purge
                </div>
              </div>
              <div className="bg-surface-bg rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wider text-txt-secondary font-semibold mb-1">
                  Last archive
                </div>
                <div className="text-sm font-mono text-txt-primary">
                  {retentionStatus.lastArchivedAt
                    ? new Date(retentionStatus.lastArchivedAt).toLocaleString(
                        "en-NZ",
                      )
                    : "—"}
                </div>
                <div className="text-[11px] text-txt-secondary mt-0.5">
                  most recent purge / archive
                </div>
              </div>
              <div className="bg-surface-bg rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wider text-txt-secondary font-semibold mb-1">
                  Archived total
                </div>
                <div className="text-lg font-mono font-semibold text-txt-primary">
                  {retentionStatus.archivedTotal}
                </div>
                <div className="text-[11px] text-txt-secondary mt-0.5">
                  PurgeLog rows lifetime
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="/api/admin/audit-archive/download"
                download
                className="btn-primary text-xs inline-flex items-center gap-1.5"
              >
                <Database className="w-3.5 h-3.5" />
                Download Audit Archive (ZIP)
              </a>
              <Link
                href="/admin/retention"
                className="btn-secondary text-xs inline-flex items-center gap-1.5"
              >
                Open Retention page
              </Link>
            </div>
          </div>

          {/* Veil-era simulated backup feature — orthogonal to the
              retention worker; left in place pending Phase 11 deploy. */}
          {backupStatus && backupHistory ? (
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
          )}
        </div>
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
                <p className="text-sm font-medium text-txt-primary">Umbra v0.1.0-umbra</p>
                <p className="text-xs text-txt-secondary">Azure Australia East</p>
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
