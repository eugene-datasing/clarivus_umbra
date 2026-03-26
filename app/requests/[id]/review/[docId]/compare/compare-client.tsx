"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  GitCompare,
  Check,
  X,
  AlertCircle,
  ChevronRight,
  Plus,
  Minus,
  RefreshCw,
  Equal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { detectionTypeConfig } from "@/lib/db/mappers";
import { lgoimaGrounds } from "@/lib/lgoima-grounds";
import type { Snapshot, SnapshotDetection } from "@/lib/pipeline/version-snapshot";
import type {
  DiffKind,
  DetectionDiff,
  SnapshotComparison,
  SnapshotComparisonSummary,
} from "@/lib/data/snapshot-diff";
import { buildDiffs } from "@/lib/data/snapshot-diff";

interface CompareClientProps {
  requestId: string;
  docId: string;
  docName: string;
  snapshots: Snapshot[];
  currentDetections: SnapshotDetection[];
  preComparison: SnapshotComparison | null;
}

type VersionChoice = "current" | string; // snapshot id
type DiffFilter = "all" | DiffKind;

function groundLabel(groundId: string | null): string {
  if (!groundId) return "\u2014";
  const g = lgoimaGrounds.find((x) => x.id === groundId);
  return g ? g.reference : groundId;
}

function statusBadge(status: string) {
  if (status === "accepted") {
    return (
      <span className="badge bg-green-50 text-green-700 text-[10px]">
        <Check size={10} /> Accepted
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="badge bg-red-50 text-red-600 text-[10px]">
        <X size={10} /> Rejected
      </span>
    );
  }
  return (
    <span className="badge bg-amber-50 text-amber-700 text-[10px]">
      <AlertCircle size={10} /> Pending
    </span>
  );
}

function snapshotLabel(snapshotType: string): string {
  if (snapshotType === "draft") return "Draft (Submitted for Review)";
  if (snapshotType === "final") return "Final (Signed Off)";
  return snapshotType;
}

/** Row background and left-border colour for diff kinds */
const diffRowStyle: Record<DiffKind, string> = {
  added: "bg-green-50/40 border-l-2 border-l-green-500",
  removed: "bg-red-50/40 border-l-2 border-l-red-500",
  modified: "bg-amber-50/40 border-l-2 border-l-amber-500",
  unchanged: "border-l-2 border-l-transparent",
};

const diffKindBadge: Record<DiffKind, { icon: React.ReactNode; label: string; className: string }> = {
  added: { icon: <Plus size={10} />, label: "Added", className: "bg-green-100 text-green-700" },
  removed: { icon: <Minus size={10} />, label: "Removed", className: "bg-red-100 text-red-700" },
  modified: { icon: <RefreshCw size={10} />, label: "Modified", className: "bg-amber-100 text-amber-700" },
  unchanged: { icon: <Equal size={10} />, label: "Unchanged", className: "bg-gray-100 text-gray-500" },
};

export default function CompareClient({
  requestId,
  docId,
  docName,
  snapshots,
  currentDetections,
  preComparison,
}: CompareClientProps) {
  const [leftVersion, setLeftVersion] = useState<VersionChoice>(
    snapshots.length > 0 ? snapshots[0].id : "current",
  );
  const [rightVersion, setRightVersion] = useState<VersionChoice>("current");
  const [filter, setFilter] = useState<DiffFilter>("all");

  const versionOptions = useMemo(() => {
    const opts: { id: VersionChoice; label: string; description: string }[] = [];
    for (const snap of snapshots) {
      opts.push({
        id: snap.id,
        label: snapshotLabel(snap.snapshotType),
        description: `${snap.createdBy} \u2014 ${new Date(snap.createdAt).toLocaleDateString("en-NZ")}`,
      });
    }
    opts.push({
      id: "current",
      label: "Current State",
      description: "Live detection states",
    });
    return opts;
  }, [snapshots]);

  const getDetections = (versionId: VersionChoice): SnapshotDetection[] => {
    if (versionId === "current") return currentDetections;
    const snap = snapshots.find((s) => s.id === versionId);
    return snap?.detections ?? [];
  };

  const leftDetections = getDetections(leftVersion);
  const rightDetections = getDetections(rightVersion);

  // Build comparison using the shared buildDiffs function
  const diffs: DetectionDiff[] = useMemo(
    () => buildDiffs(leftDetections, rightDetections),
    [leftDetections, rightDetections],
  );

  // Summary counts
  const summary: SnapshotComparisonSummary = useMemo(() => {
    let unchanged = 0;
    let modified = 0;
    let added = 0;
    let removed = 0;
    for (const d of diffs) {
      switch (d.kind) {
        case "unchanged": unchanged++; break;
        case "modified": modified++; break;
        case "added": added++; break;
        case "removed": removed++; break;
      }
    }
    return { total: diffs.length, unchanged, modified, added, removed };
  }, [diffs]);

  // Filter diffs by selected kind
  const visibleDiffs = useMemo(
    () => (filter === "all" ? diffs : diffs.filter((d) => d.kind === filter)),
    [diffs, filter],
  );

  // Empty state — no snapshots at all
  if (snapshots.length === 0) {
    return (
      <div className="p-6 max-w-[1000px]">
        <div className="flex items-center gap-1.5 text-sm text-txt-secondary mb-6">
          <Link href={`/requests/${requestId}`} className="hover:text-brand-primary transition-colors">Cases</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link href={`/requests/${requestId}/review/${docId}`} className="hover:text-brand-primary transition-colors">{docName}</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-txt-primary font-medium">Compare Versions</span>
        </div>
        <div className="card text-center py-12">
          <GitCompare className="w-12 h-12 text-txt-secondary/30 mx-auto mb-4" />
          <h2 className="text-lg font-heading font-semibold text-txt-primary mb-2">No Snapshots Available</h2>
          <p className="text-sm text-txt-secondary max-w-md mx-auto">
            Version snapshots are created automatically when a document is signed off (draft) or given final approval (final).
            Complete the review workflow to enable comparison.
          </p>
          <Link href={`/requests/${requestId}/review/${docId}`} className="btn-primary mt-4 inline-flex items-center gap-2">
            <ArrowLeft size={14} />
            Back to Review
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-txt-secondary mb-6">
        <Link href={`/requests/${requestId}`} className="hover:text-brand-primary transition-colors">Cases</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link href={`/requests/${requestId}/review/${docId}`} className="hover:text-brand-primary transition-colors">{docName}</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-txt-primary font-medium">Compare Versions</span>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <GitCompare className="w-5 h-5 text-brand-primary" />
        <h1 className="text-xl font-heading font-bold text-txt-primary">Version Comparison</h1>
      </div>

      {/* Summary bar */}
      <div className="card mb-6 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-txt-primary">Summary:</span>
          <SummaryPill
            count={summary.unchanged}
            label="unchanged"
            className="bg-gray-100 text-gray-600"
            icon={<Equal size={12} />}
            active={filter === "unchanged"}
            onClick={() => setFilter(filter === "unchanged" ? "all" : "unchanged")}
          />
          <SummaryPill
            count={summary.modified}
            label="modified"
            className="bg-amber-100 text-amber-700"
            icon={<RefreshCw size={12} />}
            active={filter === "modified"}
            onClick={() => setFilter(filter === "modified" ? "all" : "modified")}
          />
          <SummaryPill
            count={summary.added}
            label="added"
            className="bg-green-100 text-green-700"
            icon={<Plus size={12} />}
            active={filter === "added"}
            onClick={() => setFilter(filter === "added" ? "all" : "added")}
          />
          <SummaryPill
            count={summary.removed}
            label="removed"
            className="bg-red-100 text-red-700"
            icon={<Minus size={12} />}
            active={filter === "removed"}
            onClick={() => setFilter(filter === "removed" ? "all" : "removed")}
          />
          {filter !== "all" && (
            <button
              onClick={() => setFilter("all")}
              className="text-xs text-brand-primary hover:underline ml-2"
            >
              Show all
            </button>
          )}
        </div>
      </div>

      {/* Version selectors */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1">
          <label className="text-xs font-semibold text-txt-secondary uppercase tracking-wider mb-1 block">
            Left Version
          </label>
          <select
            value={leftVersion}
            onChange={(e) => setLeftVersion(e.target.value)}
            className="input-field text-sm"
          >
            {versionOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label} — {opt.description}
              </option>
            ))}
          </select>
        </div>
        <GitCompare className="w-5 h-5 text-txt-secondary mt-5" />
        <div className="flex-1">
          <label className="text-xs font-semibold text-txt-secondary uppercase tracking-wider mb-1 block">
            Right Version
          </label>
          <select
            value={rightVersion}
            onChange={(e) => setRightVersion(e.target.value)}
            className="input-field text-sm"
          >
            {versionOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label} — {opt.description}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Comparison table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface-card z-10">
            <tr className="text-left text-[10px] uppercase tracking-wider text-txt-secondary border-b border-border">
              <th className="px-4 py-2.5 w-10">#</th>
              <th className="px-3 py-2.5 w-20">Change</th>
              <th className="px-3 py-2.5 min-w-[180px]">Entity</th>
              <th className="px-3 py-2.5 w-24">Type</th>
              <th className="px-3 py-2.5 w-12 text-center">Page</th>
              <th className="px-3 py-2.5 w-24 text-center bg-blue-50/50">Left Status</th>
              <th className="px-3 py-2.5 w-24 bg-blue-50/50">Left Ground</th>
              <th className="px-3 py-2.5 w-24 text-center bg-purple-50/50">Right Status</th>
              <th className="px-3 py-2.5 w-24 bg-purple-50/50">Right Ground</th>
            </tr>
          </thead>
          <tbody>
            {visibleDiffs.map((row, idx) => {
              const typeConf = detectionTypeConfig[row.det.type as keyof typeof detectionTypeConfig];
              const badge = diffKindBadge[row.kind];
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-border/50",
                    diffRowStyle[row.kind],
                  )}
                >
                  <td className="px-4 py-2 font-mono text-txt-secondary text-[10px]">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <span className={cn("badge text-[10px] inline-flex items-center gap-0.5", badge.className)}>
                      {badge.icon}
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn("font-medium", row.kind === "removed" ? "text-txt-secondary line-through" : "text-txt-primary")}>
                      {row.det.text.length > 50 ? row.det.text.slice(0, 50) + "..." : row.det.text}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn("badge text-[10px]", typeConf?.color ?? "bg-gray-100 text-gray-700")}>
                      {typeConf?.label ?? row.det.type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center text-txt-secondary">p.{row.det.page}</td>
                  {/* Left */}
                  <td className="px-3 py-2 text-center bg-blue-50/20">
                    {row.left ? statusBadge(row.left.status) : <span className="text-green-600 text-[10px] font-medium">--</span>}
                  </td>
                  <td className="px-3 py-2 bg-blue-50/20">
                    <span className={cn(
                      "font-mono text-[10px]",
                      row.groundChanged ? "text-amber-700 font-semibold" : "text-txt-secondary",
                    )}>
                      {row.left ? groundLabel(row.left.appliedGround) : "--"}
                    </span>
                  </td>
                  {/* Right */}
                  <td className="px-3 py-2 text-center bg-purple-50/20">
                    {row.right ? statusBadge(row.right.status) : <span className="text-red-600 text-[10px] font-medium">--</span>}
                  </td>
                  <td className="px-3 py-2 bg-purple-50/20">
                    <span className={cn(
                      "font-mono text-[10px]",
                      row.groundChanged ? "text-amber-700 font-semibold" : "text-txt-secondary",
                    )}>
                      {row.right ? groundLabel(row.right.appliedGround) : "--"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {visibleDiffs.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-8 text-txt-secondary text-sm">
                  {filter !== "all"
                    ? `No ${filter} detections found.`
                    : "No detections to compare."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center gap-4 text-xs text-txt-secondary">
        <span>Total: {summary.total} detection(s)</span>
        <span className="text-gray-500">{summary.unchanged} unchanged</span>
        <span className="text-amber-600">{summary.modified} modified</span>
        <span className="text-green-600">{summary.added} added</span>
        <span className="text-red-600">{summary.removed} removed</span>
        <div className="flex-1" />
        <Link href={`/requests/${requestId}/review/${docId}`} className="btn-ghost flex items-center gap-1.5 text-xs">
          <ArrowLeft size={12} />
          Back to Review
        </Link>
      </div>
    </div>
  );
}

// --- Sub-components ---

function SummaryPill({
  count,
  label,
  className,
  icon,
  active,
  onClick,
}: {
  count: number;
  label: string;
  className: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
        className,
        active && "ring-2 ring-offset-1 ring-brand-primary/50",
        !active && "opacity-80 hover:opacity-100",
      )}
    >
      {icon}
      <span className="font-bold">{count}</span>
      {label}
    </button>
  );
}
