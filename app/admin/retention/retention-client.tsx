"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveRetentionConfig } from "@/lib/actions/settings-actions";
import { restoreBatch, purgeNowBatch } from "@/lib/actions/batch-actions";
import type { RetentionConfig } from "@/lib/data/settings";
import { AlertTriangle, RotateCcw, Trash2, Save, Info } from "lucide-react";

interface TrashedBatch {
  id: string;
  reference: string;
  name: string;
  status: string;
  documentCount: number;
  redactionCount: number;
  deletedAt: string;
  purgeScheduledAt: string | null;
  purgeStatus: string | null;
}

interface PurgeLogEntry {
  id: string;
  batchRef: string;
  archivePath: string;
  totalEntries: number;
  chainValid: boolean;
  archivedBy: string;
  archivedAt: string;
}

interface RetentionClientProps {
  config: RetentionConfig;
  trashed: TrashedBatch[];
  purgeLog: PurgeLogEntry[];
}

export default function RetentionClient({
  config,
  trashed,
  purgeLog,
}: RetentionClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [retentionDays, setRetentionDays] = useState(
    config.retentionDaysAfterCompletion,
  );
  const [graceDays, setGraceDays] = useState(config.gracePeriodDays);
  const [autoEnabled, setAutoEnabled] = useState(config.autoRetentionEnabled);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  const handleSaveConfig = () => {
    setSaveStatus("saving");
    startTransition(async () => {
      try {
        await saveRetentionConfig({
          retentionDaysAfterCompletion: retentionDays,
          gracePeriodDays: graceDays,
          autoRetentionEnabled: autoEnabled,
        });
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 1500);
      } catch (err) {
        console.error(err);
        setSaveStatus("error");
      }
    });
  };

  return (
    <div className="p-6 max-w-[1100px] space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-txt-primary">Retention</h1>
        <p className="text-sm text-txt-secondary mt-1">
          Configure auto-retention windows and manage soft-deleted batches.
        </p>
      </div>

      {/* Retention config */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-txt-primary mb-4">
          Retention Configuration
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="block">
            <span className="text-xs font-medium text-txt-primary">
              Retention after completion (days)
            </span>
            <input
              type="number"
              min={1}
              value={retentionDays}
              onChange={(e) => setRetentionDays(parseInt(e.target.value || "0", 10))}
              className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            />
            <p className="text-[11px] text-txt-secondary mt-1">
              Auto-soft-delete exported batches after this many days of inactivity.
            </p>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-txt-primary">
              Grace period (days)
            </span>
            <input
              type="number"
              min={0}
              value={graceDays}
              onChange={(e) => setGraceDays(parseInt(e.target.value || "0", 10))}
              className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            />
            <p className="text-[11px] text-txt-secondary mt-1">
              Window between soft-delete and hard-purge during which admins can restore.
            </p>
          </label>
          <label className="flex items-start gap-2 mt-1 pt-2">
            <input
              type="checkbox"
              checked={autoEnabled}
              onChange={(e) => setAutoEnabled(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-border text-brand-primary focus:ring-brand-primary/30"
            />
            <span className="text-xs text-txt-primary">
              Enable auto-retention sweep
              <span className="block text-[11px] text-txt-secondary mt-0.5">
                Hourly sweep promotes long-completed batches into the trash.
              </span>
            </span>
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSaveConfig}
            disabled={pending}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            Save Configuration
          </button>
          {saveStatus === "saved" && (
            <span className="text-xs text-green-600 font-medium">Saved</span>
          )}
          {saveStatus === "error" && (
            <span className="text-xs text-red-600 font-medium">Save failed</span>
          )}
        </div>
      </div>

      {/* Trash */}
      <div className="card !p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-surface-bg">
          <h2 className="text-sm font-semibold text-txt-primary">Trash</h2>
          <p className="text-[11px] text-txt-secondary mt-0.5">
            Soft-deleted batches awaiting hard-purge. Restore to recover.
          </p>
        </div>
        {trashed.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-txt-secondary">
            Trash is empty.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-bg/60">
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">
                  Reference
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">Name</th>
                <th className="text-center px-4 py-2.5 font-medium text-txt-secondary">
                  Documents
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">
                  Deleted At
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">
                  Purge Scheduled
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-txt-secondary">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {trashed.map((b) => (
                <TrashRow
                  key={b.id}
                  batch={b}
                  onChanged={() => router.refresh()}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Purge history */}
      <div className="card !p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-surface-bg">
          <h2 className="text-sm font-semibold text-txt-primary">Purge History</h2>
          <p className="text-[11px] text-txt-secondary mt-0.5">
            One row per purged batch. Audit-archive blob path + integrity result.
          </p>
        </div>
        {purgeLog.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-txt-secondary flex items-start gap-2 justify-center">
            <Info className="w-4 h-4 mt-0.5 text-txt-secondary" />
            <span>
              No purges yet. Rows appear here once Phase 6c&apos;s retention worker
              completes its first purge.
            </span>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-bg/60">
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">
                  Batch
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">
                  Archive
                </th>
                <th className="text-center px-4 py-2.5 font-medium text-txt-secondary">
                  Entries
                </th>
                <th className="text-center px-4 py-2.5 font-medium text-txt-secondary">
                  Chain
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">By</th>
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">When</th>
              </tr>
            </thead>
            <tbody>
              {purgeLog.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border hover:bg-surface-hover transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs">{row.batchRef}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-txt-secondary truncate max-w-xs">
                    {row.archivePath}
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-xs">
                    {row.totalEntries}
                  </td>
                  <td className="px-4 py-3 text-center text-xs">
                    {row.chainValid ? (
                      <span className="text-green-600 font-medium">valid</span>
                    ) : (
                      <span className="text-red-600 font-medium">BROKEN</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{row.archivedBy}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-txt-secondary">
                    {new Date(row.archivedAt).toLocaleString("en-NZ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Cross-batch audit log download placeholder */}
      <div className="card p-4 bg-surface-bg/40 border-dashed">
        <div className="flex items-start gap-3">
          <Info className="w-4 h-4 mt-1 text-txt-secondary" />
          <div className="text-xs text-txt-secondary">
            <span className="font-medium text-txt-primary">
              Cross-batch audit log download
            </span>
            <span className="block mt-0.5">
              Available after Phase 6c — will return a single ZIP of all archived
              audit-log CSVs + integrity reports for purged batches.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrashRow({
  batch,
  onChanged,
}: {
  batch: TrashedBatch;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [skipGrace, setSkipGrace] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const purgeStatus = batch.purgeStatus;
  const isPurging = purgeStatus !== null;
  const canSubmit = !skipGrace || reason.trim().length > 0;

  const handleRestore = () => {
    startTransition(async () => {
      setError(null);
      try {
        await restoreBatch(batch.id);
        onChanged();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Restore failed");
      }
    });
  };

  const handlePurgeSubmit = () => {
    startTransition(async () => {
      setError(null);
      try {
        await purgeNowBatch(batch.id, {
          skipGrace,
          reason: skipGrace ? reason.trim() : undefined,
        });
        setPurgeOpen(false);
        setReason("");
        setSkipGrace(false);
        onChanged();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Purge failed");
      }
    });
  };

  return (
    <>
      <tr className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors">
        <td className="px-4 py-3 font-mono text-xs">{batch.reference}</td>
        <td className="px-4 py-3 text-sm text-txt-primary">{batch.name}</td>
        <td className="px-4 py-3 text-center font-mono text-xs">
          {batch.documentCount}
        </td>
        <td className="px-4 py-3 font-mono text-[11px] text-txt-secondary">
          {new Date(batch.deletedAt).toLocaleString("en-NZ")}
        </td>
        <td className="px-4 py-3 font-mono text-[11px] text-txt-secondary">
          {batch.purgeScheduledAt
            ? new Date(batch.purgeScheduledAt).toLocaleString("en-NZ")
            : "—"}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={handleRestore}
              disabled={pending || isPurging}
              title={isPurging ? "Cannot restore — purge in flight" : "Restore"}
              className="text-xs text-txt-secondary hover:text-brand-primary inline-flex items-center gap-1 disabled:opacity-50"
            >
              <RotateCcw className="w-3 h-3" />
              Restore
            </button>
            <button
              onClick={() => setPurgeOpen(true)}
              disabled={pending || isPurging}
              className="text-xs text-red-600 hover:text-red-700 inline-flex items-center gap-1 disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3" />
              Purge Now
            </button>
          </div>
        </td>
      </tr>
      {purgeOpen && (
        <tr>
          <td colSpan={6} className="px-4 py-3 bg-amber-50/40">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-1 flex-shrink-0" />
              <div className="flex-1 text-xs">
                <div className="font-medium text-amber-800">
                  Purge {batch.reference}?
                </div>
                <div className="text-amber-700 mt-1">
                  By default the purge runs once the existing grace window expires.
                  Toggle the override to skip the grace and purge immediately —
                  this is destructive and requires a reason.
                </div>
                <label className="mt-2 flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipGrace}
                    onChange={(e) => setSkipGrace(e.target.checked)}
                    className="w-4 h-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500/30"
                  />
                  <span className="font-medium text-amber-800">
                    Skip grace and purge immediately
                  </span>
                </label>
                {skipGrace && (
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder="Required: reason for skipping the grace period (audit-trailed)"
                    className="mt-2 w-full rounded-lg border border-amber-400 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                )}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={handlePurgeSubmit}
                    disabled={pending || !canSubmit}
                    className="btn-primary text-xs disabled:opacity-50"
                  >
                    Confirm Purge
                  </button>
                  <button
                    onClick={() => {
                      setPurgeOpen(false);
                      setReason("");
                      setSkipGrace(false);
                    }}
                    className="btn-secondary text-xs"
                  >
                    Cancel
                  </button>
                </div>
                {error && (
                  <div className="mt-2 text-xs text-red-700 font-medium">
                    {error}
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
