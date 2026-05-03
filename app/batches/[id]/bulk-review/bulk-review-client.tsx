"use client";

/**
 * Phase 12.3 — Tray UI.
 *
 * Presents medium-confidence detections (status = "pending" after the
 * Phase 12.2 tier-router) clustered by (type, normalisedText). The
 * reviewer approves or rejects whole clusters in one click; drill-in
 * navigates to per-doc review for individual inspection / overrides.
 *
 * Empty-state branches give the reviewer a clear next-step pointer
 * based on the batch's lifecycle position (auto-redacted, exported,
 * still processing).
 */

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  CheckCircle,
  X,
  Loader2,
  Inbox,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { bulkAcceptBySimilar } from "@/lib/actions/detection-actions";
import { detectionTypeConfig, type DetectionType } from "@/lib/db/mappers";
import { cn } from "@/lib/utils";

interface TrayOccurrence {
  detectionId: string;
  documentId: string;
  documentName: string;
  page: number;
  confidence: number;
  aiExplanation: string;
  pageContext: string | null;
}

interface TrayCluster {
  type: string;
  text: string;
  normalisedText: string;
  occurrences: number;
  documentCount: number;
  averageConfidence: number;
  occurrenceList: TrayOccurrence[];
}

interface BulkReviewClientProps {
  batchId: string;
  batchReference: string;
  batchStatus: string;
  totalDocuments: number;
  clusters: TrayCluster[];
}

type SortMode = "occurrences" | "type";

const clusterKey = (c: TrayCluster) => `${c.type}::${c.normalisedText}`;

/**
 * Type-label fallback for unknown / future types so the UI always has
 * a string to render even if a detection type post-dates the
 * detectionTypeConfig map.
 */
function typeLabel(type: string): string {
  const cfg = detectionTypeConfig[type as DetectionType];
  return cfg?.label ?? type;
}

function typeBadgeClasses(type: string): string {
  const cfg = detectionTypeConfig[type as DetectionType];
  return cfg?.color ?? "bg-gray-100 text-gray-700";
}

// ---------------------------------------------------------------------------
// Empty-state view
// ---------------------------------------------------------------------------

function EmptyStateView({
  batchId,
  batchReference,
  batchStatus,
}: {
  batchId: string;
  batchReference: string;
  batchStatus: string;
}) {
  const headline =
    batchStatus === "auto-redacted"
      ? "Auto-redact complete"
      : batchStatus === "exported"
        ? "Batch exported"
        : batchStatus === "reviewed"
          ? "Review complete"
          : batchStatus === "processing"
            ? "Auto-redact in progress…"
            : "Tray is empty";

  const subtext =
    batchStatus === "auto-redacted"
      ? "Every detection landed in the high-confidence tier and was auto-accepted. The auto-export job has been queued — check the Export tab for status."
      : batchStatus === "exported"
        ? "Open the Export tab to download the redacted package."
        : batchStatus === "reviewed"
          ? "All medium-confidence detections have been actioned. Manual export available from the Export tab."
          : batchStatus === "processing"
            ? "Documents are being processed. Check back in a few minutes."
            : "No medium-confidence detections in this batch.";

  return (
    <div className="p-6 max-w-[1100px]">
      <Breadcrumb batchId={batchId} batchReference={batchReference} />
      <BackLink batchId={batchId} />
      <Header />

      <div className="card flex flex-col items-center text-center py-16 gap-3">
        <Inbox className="w-12 h-12 text-txt-secondary opacity-50" />
        <h2 className="text-xl font-heading font-semibold text-txt-primary">
          {headline}
        </h2>
        <p className="text-sm text-txt-secondary max-w-md">{subtext}</p>
        <div className="flex gap-3 mt-4">
          <Link
            href={`/batches/${batchId}`}
            className="btn btn-secondary text-sm"
          >
            Back to batch
          </Link>
          <Link
            href={`/batches/${batchId}/export`}
            className="btn btn-primary text-sm"
          >
            Open Export
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable layout fragments
// ---------------------------------------------------------------------------

function Breadcrumb({
  batchId,
  batchReference,
}: {
  batchId: string;
  batchReference: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-txt-secondary mb-6">
      <Link
        href="/batches"
        className="hover:text-brand-primary transition-colors"
      >
        Batches
      </Link>
      <ChevronRight className="w-3.5 h-3.5" />
      <Link
        href={`/batches/${batchId}`}
        className="hover:text-brand-primary transition-colors"
      >
        {batchReference}
      </Link>
      <ChevronRight className="w-3.5 h-3.5" />
      <span className="text-txt-primary font-medium">Tray</span>
    </div>
  );
}

function BackLink({ batchId }: { batchId: string }) {
  return (
    <Link
      href={`/batches/${batchId}`}
      className="inline-flex items-center gap-1.5 text-sm text-txt-secondary hover:text-brand-primary transition-colors mb-4"
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      Back to batch
    </Link>
  );
}

function Header() {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-2">
        <Sparkles className="w-6 h-6 text-brand-primary" />
        <h1 className="text-2xl font-heading font-bold text-txt-primary">
          Tray
        </h1>
      </div>
      <p className="text-sm text-txt-secondary">
        Medium-confidence detections grouped by entity. Approve or
        reject whole clusters in one click; drill in for per-document
        inspection.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cluster row
// ---------------------------------------------------------------------------

/**
 * Render a pageContext snippet with the cluster's text span emphasised.
 * Falls back to the aiExplanation when no pageContext is available
 * (AI paraphrase / normalised-punctuation captures land with null
 * pageContext from the pipeline).
 */
function renderSnippet(
  occ: TrayOccurrence,
  clusterText: string,
): React.ReactNode {
  if (!occ.pageContext) {
    return occ.aiExplanation ? (
      occ.aiExplanation
    ) : (
      <span className="italic opacity-60">(no context)</span>
    );
  }

  // Case-insensitive split on the cluster text. Keeps the matched
  // span bold/coloured; surrounding context renders muted.
  const lowerSnippet = occ.pageContext.toLowerCase();
  const lowerMatch = clusterText.toLowerCase();
  const idx = lowerSnippet.indexOf(lowerMatch);
  if (idx === -1) {
    // pageContext was captured but the cluster text doesn't substring
    // match (unlikely — the writer extracted ±100 chars around the
    // match so it must include the match). Fall back to plain render.
    return occ.pageContext;
  }
  const before = occ.pageContext.slice(0, idx);
  const matched = occ.pageContext.slice(idx, idx + clusterText.length);
  const after = occ.pageContext.slice(idx + clusterText.length);
  return (
    <>
      <span className="text-txt-secondary">{before}</span>
      <strong className="text-txt-primary font-semibold">{matched}</strong>
      <span className="text-txt-secondary">{after}</span>
    </>
  );
}

function ClusterRow({
  cluster,
  expanded,
  onToggle,
  onApprove,
  onReject,
  actionPending,
  batchId,
}: {
  cluster: TrayCluster;
  expanded: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
  actionPending: boolean;
  batchId: string;
}) {
  // Drill-in target: the first occurrence (already sorted by document
  // name + page in getBatchTrayClusters).
  const firstOccurrence = cluster.occurrenceList[0];

  return (
    <li className="card p-0 overflow-hidden">
      <div className="p-4 flex items-start gap-3">
        <button
          onClick={onToggle}
          className="text-txt-secondary hover:text-txt-primary mt-0.5"
          aria-label={expanded ? "Collapse cluster" : "Expand cluster"}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className="font-medium text-txt-primary truncate"
              title={cluster.text}
            >
              {cluster.text.length > 80
                ? `${cluster.text.slice(0, 80)}…`
                : cluster.text}
            </span>
            <span
              className={cn(
                "text-[10px] uppercase tracking-wider font-semibold rounded-full px-2 py-0.5",
                typeBadgeClasses(cluster.type),
              )}
            >
              {typeLabel(cluster.type)}
            </span>
          </div>
          <div className="text-xs text-txt-secondary">
            {cluster.occurrences} occurrence
            {cluster.occurrences === 1 ? "" : "s"} in{" "}
            {cluster.documentCount} doc
            {cluster.documentCount === 1 ? "" : "s"} · avg confidence{" "}
            {cluster.averageConfidence}%
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onApprove}
            disabled={actionPending}
            className="btn btn-primary btn-sm flex items-center gap-1.5"
          >
            {actionPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5" />
            )}
            <span>Approve cluster</span>
          </button>
          <button
            onClick={onReject}
            disabled={actionPending}
            className="btn btn-secondary btn-sm flex items-center gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            <span>Reject cluster</span>
          </button>
          <Link
            href={`/batches/${batchId}/review/${firstOccurrence.documentId}`}
            className="btn btn-secondary btn-sm flex items-center gap-1.5"
          >
            <span>Drill in</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border bg-surface-subtle px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-txt-secondary mb-2">
            Occurrences
          </div>
          <ul className="space-y-2.5">
            {cluster.occurrenceList.map((occ) => (
              <li
                key={occ.detectionId}
                className="flex items-start gap-3 text-xs"
              >
                <div className="flex flex-col w-32 shrink-0">
                  <span
                    className="font-mono text-[10px] text-txt-secondary truncate"
                    title={occ.documentName}
                  >
                    {occ.documentName}
                  </span>
                  <span className="text-[10px] text-txt-secondary opacity-70">
                    p.{occ.page} · {occ.confidence}%
                  </span>
                </div>
                <div className="text-[11px] leading-relaxed flex-1 line-clamp-2 italic">
                  {renderSnippet(occ, cluster.text)}
                </div>
                <Link
                  href={`/batches/${batchId}/review/${occ.documentId}`}
                  className="text-brand-primary hover:underline shrink-0 self-center text-xs"
                >
                  Open →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function BulkReviewClient({
  batchId,
  batchReference,
  batchStatus,
  totalDocuments,
  clusters,
}: BulkReviewClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(
    null,
  );
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortMode, setSortMode] = useState<SortMode>("occurrences");
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const availableTypes = useMemo(() => {
    const ts = new Set<string>();
    clusters.forEach((c) => ts.add(c.type));
    return [...ts].sort();
  }, [clusters]);

  const visibleClusters = useMemo(() => {
    let cs = clusters;
    if (typeFilter !== "all") cs = cs.filter((c) => c.type === typeFilter);
    return [...cs].sort((a, b) => {
      if (sortMode === "occurrences") {
        return (
          b.occurrences - a.occurrences ||
          a.type.localeCompare(b.type) ||
          a.normalisedText.localeCompare(b.normalisedText)
        );
      }
      return (
        a.type.localeCompare(b.type) ||
        b.occurrences - a.occurrences ||
        a.normalisedText.localeCompare(b.normalisedText)
      );
    });
  }, [clusters, typeFilter, sortMode]);

  const totalOccurrences = clusters.reduce((s, c) => s + c.occurrences, 0);
  const distinctDocCount = useMemo(() => {
    const ids = new Set<string>();
    clusters.forEach((c) =>
      c.occurrenceList.forEach((o) => ids.add(o.documentId)),
    );
    return ids.size;
  }, [clusters]);

  if (clusters.length === 0) {
    return (
      <EmptyStateView
        batchId={batchId}
        batchReference={batchReference}
        batchStatus={batchStatus}
      />
    );
  }

  const runClusterAction = async (
    cluster: TrayCluster,
    action: "accept" | "reject",
  ) => {
    const key = clusterKey(cluster);
    setActionInProgress(key);
    setErrorBanner(null);
    try {
      await bulkAcceptBySimilar(batchId, cluster.text, action);
      // Auto-collapse the row after action so the refreshed list reads cleanly.
      setExpandedKey((prev) => (prev === key ? null : prev));
      startTransition(() => router.refresh());
    } catch (err) {
      setErrorBanner(
        `Failed to ${action} cluster: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="p-6 max-w-[1100px]">
      <Breadcrumb batchId={batchId} batchReference={batchReference} />
      <BackLink batchId={batchId} />
      <Header />

      {/* Summary + filters */}
      <div className="card mb-4 flex flex-wrap items-center gap-4">
        <div className="text-sm text-txt-secondary flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span>
            <strong className="text-txt-primary">{totalOccurrences}</strong>{" "}
            detection{totalOccurrences === 1 ? "" : "s"}
          </span>
          <span>
            <strong className="text-txt-primary">{clusters.length}</strong>{" "}
            cluster{clusters.length === 1 ? "" : "s"}
          </span>
          <span>
            spanning{" "}
            <strong className="text-txt-primary">{distinctDocCount}</strong> of{" "}
            {totalDocuments} doc{totalDocuments === 1 ? "" : "s"}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 text-txt-secondary">
            Type
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="input-field text-xs py-1"
            >
              <option value="all">All</option>
              {availableTypes.map((t) => (
                <option key={t} value={t}>
                  {typeLabel(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-txt-secondary">
            Sort
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="input-field text-xs py-1"
            >
              <option value="occurrences">Occurrences</option>
              <option value="type">Type</option>
            </select>
          </label>
        </div>
      </div>

      {errorBanner && (
        <div className="mb-4 rounded-card border border-red-200 bg-red-50 p-3 flex items-start gap-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1">{errorBanner}</div>
          <button
            onClick={() => setErrorBanner(null)}
            className="text-red-700 hover:text-red-900"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {visibleClusters.length === 0 ? (
        <div className="card p-8 text-center text-sm text-txt-secondary">
          No clusters match the current filter.
        </div>
      ) : (
        <ul className="space-y-2">
          {visibleClusters.map((cluster) => {
            const key = clusterKey(cluster);
            return (
              <ClusterRow
                key={key}
                cluster={cluster}
                expanded={expandedKey === key}
                onToggle={() =>
                  setExpandedKey((prev) => (prev === key ? null : key))
                }
                onApprove={() => runClusterAction(cluster, "accept")}
                onReject={() => runClusterAction(cluster, "reject")}
                actionPending={actionInProgress === key}
                batchId={batchId}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
