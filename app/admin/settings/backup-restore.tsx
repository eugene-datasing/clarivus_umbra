"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Database,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  Shield,
  HardDrive,
  RefreshCw,
  AlertTriangle,
  Info,
} from "lucide-react";
import type {
  BackupStatus,
  BackupEntry,
} from "@/lib/data/backup-restore";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BackupRestoreProps {
  initialStatus: BackupStatus;
  initialHistory: BackupEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso);
  return d.toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeSince(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "Less than 1 hour ago";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BackupRestore({
  initialStatus,
  initialHistory,
}: BackupRestoreProps) {
  const [status, setStatus] = useState(initialStatus);
  const [history, setHistory] = useState(initialHistory);
  const [backupLoading, setBackupLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    success: boolean;
    details: string;
  } | null>(null);
  const [backupResult, setBackupResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handleTriggerBackup = async () => {
    setBackupLoading(true);
    setBackupResult(null);
    try {
      const res = await fetch("/api/admin/backup", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setBackupResult({
          success: true,
          message: `Backup completed successfully (${data.backupId}).`,
        });
        // Refresh status and history
        const [statusRes, historyRes] = await Promise.all([
          fetch("/api/admin/backup/status").then((r) => r.json()),
          fetch("/api/admin/backup/history").then((r) => r.json()),
        ]);
        if (statusRes) setStatus(statusRes);
        if (historyRes) setHistory(historyRes);
      } else {
        setBackupResult({
          success: false,
          message: data.error || "Backup failed.",
        });
      }
    } catch {
      setBackupResult({ success: false, message: "Network error. Please try again." });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleVerifyBackup = async () => {
    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const res = await fetch("/api/admin/backup/verify", { method: "POST" });
      const data = await res.json();
      setVerifyResult({
        success: data.success,
        details: data.details,
      });
    } catch {
      setVerifyResult({
        success: false,
        details: "Network error during verification. Please try again.",
      });
    } finally {
      setVerifyLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Backup Status Card */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Database className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-heading font-semibold text-txt-primary">
                Backup Status
              </h2>
              <p className="text-xs text-txt-secondary">
                Automated daily backups with geo-redundant storage
              </p>
            </div>
          </div>
          {status.isHealthy ? (
            <span className="badge bg-green-50 text-green-700 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" />
              Healthy
            </span>
          ) : (
            <span className="badge bg-red-50 text-red-700 flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5" />
              Unhealthy
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 rounded-lg bg-surface-bg">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-txt-secondary" />
              <span className="text-xs font-medium text-txt-secondary">Last Backup</span>
            </div>
            <p className="text-sm font-medium text-txt-primary">
              {timeSince(status.lastBackup)}
            </p>
            <p className="text-xs text-txt-secondary mt-0.5">
              {formatTimestamp(status.lastBackup)}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-surface-bg">
            <div className="flex items-center gap-2 mb-1">
              <HardDrive className="w-4 h-4 text-txt-secondary" />
              <span className="text-xs font-medium text-txt-secondary">Backup Size</span>
            </div>
            <p className="text-sm font-medium text-txt-primary">
              {status.backupSize ?? "--"}
            </p>
            <p className="text-xs text-txt-secondary mt-0.5">
              {status.backupType === "none" ? "No backups" : `Type: ${status.backupType}`}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-surface-bg">
            <div className="flex items-center gap-2 mb-1">
              <RefreshCw className="w-4 h-4 text-txt-secondary" />
              <span className="text-xs font-medium text-txt-secondary">Next Scheduled</span>
            </div>
            <p className="text-sm font-medium text-txt-primary">
              {formatTimestamp(status.nextScheduled)}
            </p>
            <p className="text-xs text-txt-secondary mt-0.5">
              Daily at 03:00 NZST
            </p>
          </div>

          <div className="p-3 rounded-lg bg-surface-bg">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-4 h-4 text-txt-secondary" />
              <span className="text-xs font-medium text-txt-secondary">Verification</span>
            </div>
            <p className="text-sm font-medium text-txt-primary">
              {status.verificationResult.status === "passed" ? (
                <span className="text-green-700">Passed</span>
              ) : status.verificationResult.status === "failed" ? (
                <span className="text-red-700">Failed</span>
              ) : (
                <span className="text-gray-500">Not verified</span>
              )}
            </p>
            <p className="text-xs text-txt-secondary mt-0.5">
              {status.verificationResult.lastVerified
                ? formatTimestamp(status.verificationResult.lastVerified)
                : "No verification run"}
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="card">
        <h2 className="text-lg font-heading font-semibold text-txt-primary mb-4">
          Backup Actions
        </h2>
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <button
              onClick={handleTriggerBackup}
              disabled={backupLoading}
              className={cn(
                "btn-primary flex items-center gap-2 w-full justify-center",
                backupLoading && "opacity-60 cursor-not-allowed",
              )}
            >
              {backupLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Database className="w-4 h-4" />
              )}
              {backupLoading ? "Creating Backup..." : "Trigger Manual Backup"}
            </button>
            {backupResult && (
              <div
                className={cn(
                  "mt-2 p-2 rounded text-xs flex items-start gap-2",
                  backupResult.success
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700",
                )}
              >
                {backupResult.success ? (
                  <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                )}
                {backupResult.message}
              </div>
            )}
          </div>

          <div className="flex-1">
            <button
              onClick={handleVerifyBackup}
              disabled={verifyLoading}
              className={cn(
                "btn-secondary flex items-center gap-2 w-full justify-center",
                verifyLoading && "opacity-60 cursor-not-allowed",
              )}
            >
              {verifyLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Shield className="w-4 h-4" />
              )}
              {verifyLoading ? "Verifying..." : "Verify Latest Backup"}
            </button>
            {verifyResult && (
              <div
                className={cn(
                  "mt-2 p-2 rounded text-xs flex items-start gap-2",
                  verifyResult.success
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700",
                )}
              >
                {verifyResult.success ? (
                  <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                )}
                {verifyResult.details}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Backup History */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-heading font-semibold text-txt-primary">
            Backup History
          </h2>
          <p className="text-xs text-txt-secondary mt-0.5">
            Last 10 backup entries
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-bg">
              <th className="text-left px-6 py-3 font-medium text-txt-secondary">Backup ID</th>
              <th className="text-left px-6 py-3 font-medium text-txt-secondary">Timestamp</th>
              <th className="text-left px-6 py-3 font-medium text-txt-secondary">Type</th>
              <th className="text-left px-6 py-3 font-medium text-txt-secondary">Size</th>
              <th className="text-center px-6 py-3 font-medium text-txt-secondary">Status</th>
              <th className="text-left px-6 py-3 font-medium text-txt-secondary">Verified</th>
            </tr>
          </thead>
          <tbody>
            {history.map((entry) => (
              <tr
                key={entry.id}
                className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors"
              >
                <td className="px-6 py-3.5 font-mono text-xs text-txt-primary">
                  {entry.id}
                </td>
                <td className="px-6 py-3.5 text-txt-secondary text-xs">
                  {formatTimestamp(entry.timestamp)}
                </td>
                <td className="px-6 py-3.5">
                  <span
                    className={cn(
                      "badge text-xs",
                      entry.type === "manual"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-gray-100 text-gray-600",
                    )}
                  >
                    {entry.type === "manual" ? "Manual" : "Automated"}
                  </span>
                </td>
                <td className="px-6 py-3.5 text-txt-secondary font-mono text-xs">
                  {entry.size}
                </td>
                <td className="px-6 py-3.5 text-center">
                  {entry.status === "completed" ? (
                    <span className="badge bg-green-50 text-green-700 text-xs">
                      <CheckCircle className="w-3 h-3" />
                      Completed
                    </span>
                  ) : entry.status === "failed" ? (
                    <span className="badge bg-red-50 text-red-700 text-xs">
                      <XCircle className="w-3 h-3" />
                      Failed
                    </span>
                  ) : (
                    <span className="badge bg-amber-50 text-amber-700 text-xs">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      In Progress
                    </span>
                  )}
                </td>
                <td className="px-6 py-3.5 text-txt-secondary text-xs">
                  {entry.verifiedAt ? (
                    <span className="flex items-center gap-1 text-green-700">
                      <CheckCircle className="w-3 h-3" />
                      {formatTimestamp(entry.verifiedAt)}
                    </span>
                  ) : (
                    <span className="text-gray-400">Not verified</span>
                  )}
                </td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-txt-secondary">
                  No backup history available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Retention Policy */}
      <div className="card">
        <div className="flex items-center gap-3 mb-3">
          <Shield className="w-5 h-5 text-brand-primary" />
          <h2 className="text-lg font-heading font-semibold text-txt-primary">
            Retention Policy
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-txt-secondary">Retention Period:</span>
            <span className="ml-2 font-medium text-txt-primary">
              {status.retentionDays} days
            </span>
          </div>
          <div>
            <span className="text-txt-secondary">Storage Type:</span>
            <span className="ml-2 font-medium text-txt-primary">
              Geo-redundant (GRS)
            </span>
          </div>
          <div>
            <span className="text-txt-secondary">Backup Location:</span>
            <span className="ml-2 font-medium text-txt-primary">
              {status.backupLocation}
            </span>
          </div>
          <div>
            <span className="text-txt-secondary">Backup Schedule:</span>
            <span className="ml-2 font-medium text-txt-primary">
              Daily at 03:00 NZST
            </span>
          </div>
        </div>
      </div>

      {/* Restore Instructions */}
      <div className="p-4 rounded-lg bg-amber-50/60 border border-amber-200">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-amber-800 mb-1">
              Restore Operations
            </h3>
            <p className="text-sm text-amber-700">
              Database restore operations require system administrator access and must
              be performed through the Azure Portal or by contacting the DataSing
              support team. Restore operations will temporarily take the system offline.
            </p>
            <div className="mt-2 flex items-center gap-2 text-xs text-amber-600">
              <Info className="w-3.5 h-3.5" />
              Contact: support@datasing.co.nz | 0800 DATA SING
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
