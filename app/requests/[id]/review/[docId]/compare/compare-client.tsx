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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { detectionTypeConfig } from "@/lib/db/mappers";
import { lgoimaGrounds } from "@/lib/lgoima-grounds";
import type { Snapshot, SnapshotDetection } from "@/lib/pipeline/version-snapshot";

interface CompareClientProps {
  requestId: string;
  docId: string;
  docName: string;
  snapshots: Snapshot[];
  currentDetections: SnapshotDetection[];
}

type VersionChoice = "current" | string; // snapshot id

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

export default function CompareClient({
  requestId,
  docId,
  docName,
  snapshots,
  currentDetections,
}: CompareClientProps) {
  const [leftVersion, setLeftVersion] = useState<VersionChoice>(
    snapshots.length > 0 ? snapshots[0].id : "current",
  );
  const [rightVersion, setRightVersion] = useState<VersionChoice>("current");

  const versionOptions = useMemo(() => {
    const opts: { id: VersionChoice; label: string; description: string }[] = [];
    for (const snap of snapshots) {
      opts.push({
        id: snap.id,
        label: snapshotLabel(snap.snapshotType),
        description: `${snap.createdBy} \u2014 ${new Date(snap.createdAt).toLocaleDateString()}`,
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

  // Build a merged comparison view by detection ID
  const comparison = useMemo(() => {
    const leftMap = new Map(leftDetections.map((d) => [d.id, d]));
    const rightMap = new Map(rightDetections.map((d) => [d.id, d]));
    const allIds = new Set([...leftMap.keys(), ...rightMap.keys()]);

    return Array.from(allIds).map((id) => {
      const left = leftMap.get(id);
      const right = rightMap.get(id);
      const det = left ?? right!;
      const statusChanged = left?.status !== right?.status;
      const groundChanged = left?.appliedGround !== right?.appliedGround;
      return { id, left, right, det, statusChanged, groundChanged, changed: statusChanged || groundChanged };
    });
  }, [leftDetections, rightDetections]);

  const changedCount = comparison.filter((c) => c.changed).length;

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
            Version snapshots are created automatically when a document is submitted for senior review (draft) or signed off (final).
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
        {changedCount > 0 && (
          <span className="badge bg-amber-50 text-amber-700">
            {changedCount} change{changedCount !== 1 ? "s" : ""}
          </span>
        )}
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
              <th className="px-3 py-2.5 min-w-[180px]">Entity</th>
              <th className="px-3 py-2.5 w-24">Type</th>
              <th className="px-3 py-2.5 w-12 text-center">Page</th>
              <th className="px-3 py-2.5 w-24 text-center bg-blue-50/50">Left Status</th>
              <th className="px-3 py-2.5 w-24 bg-blue-50/50">Left Ground</th>
              <th className="px-3 py-2.5 w-24 text-center bg-purple-50/50">Right Status</th>
              <th className="px-3 py-2.5 w-24 bg-purple-50/50">Right Ground</th>
              <th className="px-3 py-2.5 w-16 text-center">Changed</th>
            </tr>
          </thead>
          <tbody>
            {comparison.map((row, idx) => {
              const typeConf = detectionTypeConfig[row.det.type as keyof typeof detectionTypeConfig];
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-border/50",
                    row.changed && "bg-amber-50/30",
                  )}
                >
                  <td className="px-4 py-2 font-mono text-txt-secondary text-[10px]">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-txt-primary">
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
                    {row.left ? statusBadge(row.left.status) : <span className="text-txt-secondary">--</span>}
                  </td>
                  <td className="px-3 py-2 bg-blue-50/20">
                    <span className="font-mono text-[10px] text-txt-secondary">
                      {row.left ? groundLabel(row.left.appliedGround) : "--"}
                    </span>
                  </td>
                  {/* Right */}
                  <td className="px-3 py-2 text-center bg-purple-50/20">
                    {row.right ? statusBadge(row.right.status) : <span className="text-txt-secondary">--</span>}
                  </td>
                  <td className="px-3 py-2 bg-purple-50/20">
                    <span className="font-mono text-[10px] text-txt-secondary">
                      {row.right ? groundLabel(row.right.appliedGround) : "--"}
                    </span>
                  </td>
                  {/* Changed indicator */}
                  <td className="px-3 py-2 text-center">
                    {row.changed ? (
                      <span className="inline-flex items-center gap-0.5 text-amber-600 font-semibold text-[10px]">
                        <AlertCircle size={10} />
                        Yes
                      </span>
                    ) : (
                      <span className="text-txt-secondary/50 text-[10px]">--</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {comparison.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-8 text-txt-secondary text-sm">
                  No detections to compare.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="mt-4 flex items-center gap-4 text-xs text-txt-secondary">
        <span>Total: {comparison.length} detection(s)</span>
        <span>Changed: {changedCount}</span>
        <span>Unchanged: {comparison.length - changedCount}</span>
        <div className="flex-1" />
        <Link href={`/requests/${requestId}/review/${docId}`} className="btn-ghost flex items-center gap-1.5 text-xs">
          <ArrowLeft size={12} />
          Back to Review
        </Link>
      </div>
    </div>
  );
}
