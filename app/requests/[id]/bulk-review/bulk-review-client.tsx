"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight,
  ArrowLeft,
  CheckCircle,
  Eye,
  X,
  Sparkles,
  FileText,
  Loader2,
  SlidersHorizontal,
  AlertTriangle,
  BarChart3,
  Zap,
} from "lucide-react";
import {
  bulkAcceptDetections,
  bulkRejectDetections,
  applyConfidenceThreshold,
  bulkApplyGroundToSimilar,
  bulkApplyGroundByType,
} from "@/lib/actions/detection-actions";
import { lgoimaGrounds } from "@/lib/lgoima-grounds";

interface SnippetPart {
  text: string;
  highlight: boolean;
}

interface Snippet {
  doc: string;
  parts: SnippetPart[];
}

interface DetectionStatus {
  id: string;
  status: string;
  confidence: number;
}

interface EntityGroup {
  id: number;
  entity: string;
  type: string;
  ground: string;
  groundRef: string;
  docCount: number;
  occurrences: number;
  confidence: number;
  snippets: Snippet[];
  detectionIds: string[];
  detectionStatuses: DetectionStatus[];
}

interface ThresholdDetection {
  id: string;
  type: string;
  typeLabel: string;
  confidence: number;
  suggestedGround: string | null;
  documentId: string;
}

interface BulkReviewClientProps {
  entityGroups: EntityGroup[];
  caseReference: string;
  requestId: string;
  totalDocuments: number;
  thresholdData: ThresholdDetection[];
}

// Tick marks for the slider
const SLIDER_TICKS = [0, 50, 70, 85, 90, 95, 100];

export default function BulkReviewClient({
  entityGroups,
  caseReference,
  requestId,
  totalDocuments,
  thresholdData,
}: BulkReviewClientProps) {
  const router = useRouter();
  const [reviewed, setReviewed] = useState<Set<number>>(new Set());
  const [actionInProgress, setActionInProgress] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  // Bulk ground apply state (per entity)
  const [bulkGroundEntity, setBulkGroundEntity] = useState<number | null>(null);
  const [bulkGroundValue, setBulkGroundValue] = useState("");
  const [bulkGroundAction, setBulkGroundAction] = useState<"accept" | "reject">("accept");
  const [bulkGroundApplying, setBulkGroundApplying] = useState(false);
  const [bulkGroundSuccess, setBulkGroundSuccess] = useState<string | null>(null);

  // Bulk ground apply state (by type)
  const [bulkTypeGround, setBulkTypeGround] = useState<string | null>(null);
  const [bulkTypeGroundValue, setBulkTypeGroundValue] = useState("");
  const [bulkTypeGroundAction, setBulkTypeGroundAction] = useState<"accept" | "reject">("accept");
  const [bulkTypeApplying, setBulkTypeApplying] = useState(false);
  const [bulkTypeSuccess, setBulkTypeSuccess] = useState<string | null>(null);

  // Threshold state
  const [threshold, setThreshold] = useState(85);
  const [thresholdApplied, setThresholdApplied] = useState(false);
  const [appliedCount, setAppliedCount] = useState(0);
  const [appliedDocs, setAppliedDocs] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [applyingThreshold, setApplyingThreshold] = useState(false);

  // Compute live preview stats from the threshold slider
  const thresholdPreview = useMemo(() => {
    const above = thresholdData.filter((d) => d.confidence > threshold);
    const below = thresholdData.filter((d) => d.confidence <= threshold);

    // Group by type for breakdown
    const aboveByType = new Map<string, { label: string; count: number; totalConf: number }>();
    for (const d of above) {
      const existing = aboveByType.get(d.type);
      if (existing) {
        existing.count++;
        existing.totalConf += d.confidence;
      } else {
        aboveByType.set(d.type, { label: d.typeLabel, count: 1, totalConf: d.confidence });
      }
    }

    const belowByType = new Map<string, { label: string; count: number; totalConf: number }>();
    for (const d of below) {
      const existing = belowByType.get(d.type);
      if (existing) {
        existing.count++;
        existing.totalConf += d.confidence;
      } else {
        belowByType.set(d.type, { label: d.typeLabel, count: 1, totalConf: d.confidence });
      }
    }

    const docsAbove = new Set(above.map((d) => d.documentId)).size;

    // Confidence distribution histogram (buckets of 10)
    const distribution = new Array(10).fill(0);
    for (const d of thresholdData) {
      const bucket = Math.min(Math.floor(d.confidence / 10), 9);
      distribution[bucket]++;
    }

    return {
      aboveCount: above.length,
      belowCount: below.length,
      docsAbove,
      aboveByType: Array.from(aboveByType.entries())
        .map(([type, data]) => ({
          type,
          label: data.label,
          count: data.count,
          avgConf: Math.round(data.totalConf / data.count),
        }))
        .sort((a, b) => b.count - a.count),
      belowByType: Array.from(belowByType.entries())
        .map(([type, data]) => ({
          type,
          label: data.label,
          count: data.count,
          avgConf: Math.round(data.totalConf / data.count),
        }))
        .sort((a, b) => b.count - a.count),
      distribution,
    };
  }, [thresholdData, threshold]);

  // After threshold is applied, filter entity groups to only show those with pending detections
  const visibleGroups = useMemo(() => {
    if (!thresholdApplied) return entityGroups;
    // After applying threshold, entity groups with all detections accepted
    // will be refreshed from the server. But locally, we can filter to groups
    // that still have pending detections.
    return entityGroups.filter((group) =>
      group.detectionStatuses.some((d) => d.status === "pending"),
    );
  }, [entityGroups, thresholdApplied]);

  const handleAcceptAll = async (group: EntityGroup) => {
    setActionInProgress(group.id);
    try {
      await bulkAcceptDetections(group.detectionIds, group.groundRef || undefined);
      setReviewed((prev) => new Set(prev).add(group.id));
      startTransition(() => router.refresh());
    } catch (err) {
      console.error("Bulk accept failed:", err);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleSkip = async (group: EntityGroup) => {
    setActionInProgress(group.id);
    try {
      await bulkRejectDetections(group.detectionIds);
      setReviewed((prev) => new Set(prev).add(group.id));
      startTransition(() => router.refresh());
    } catch (err) {
      console.error("Bulk reject failed:", err);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReviewEach = (group: EntityGroup) => {
    setReviewed((prev) => new Set(prev).add(group.id));
  };

  const handleBulkApplyGroundToSimilar = async (group: EntityGroup) => {
    if (!bulkGroundValue) return;
    setBulkGroundApplying(true);
    try {
      const result = await bulkApplyGroundToSimilar(
        requestId,
        group.entity,
        bulkGroundValue,
        bulkGroundAction,
      );
      const groundLabel = lgoimaGrounds.find((g) => g.id === bulkGroundValue)?.reference || bulkGroundValue;
      setBulkGroundSuccess(
        `Applied ${groundLabel} to ${result.updatedCount} detections of "${group.entity}"`,
      );
      setReviewed((prev) => new Set(prev).add(group.id));
      setBulkGroundEntity(null);
      setBulkGroundValue("");
      startTransition(() => router.refresh());
      setTimeout(() => setBulkGroundSuccess(null), 5000);
    } catch (err) {
      console.error("Bulk apply ground failed:", err);
    } finally {
      setBulkGroundApplying(false);
    }
  };

  const handleBulkApplyGroundByType = async (type: string) => {
    if (!bulkTypeGroundValue) return;
    setBulkTypeApplying(true);
    try {
      const result = await bulkApplyGroundByType(
        requestId,
        type,
        bulkTypeGroundValue,
        bulkTypeGroundAction,
      );
      const groundLabel = lgoimaGrounds.find((g) => g.id === bulkTypeGroundValue)?.reference || bulkTypeGroundValue;
      setBulkTypeSuccess(
        `Applied ${groundLabel} to ${result.updatedCount} detections of type "${type}"`,
      );
      setBulkTypeGround(null);
      setBulkTypeGroundValue("");
      startTransition(() => router.refresh());
      setTimeout(() => setBulkTypeSuccess(null), 5000);
    } catch (err) {
      console.error("Bulk apply ground by type failed:", err);
    } finally {
      setBulkTypeApplying(false);
    }
  };

  // Compute type summaries for the "apply by type" section
  const typeSummary = useMemo(() => {
    const byType = new Map<string, { count: number; entities: Set<string> }>();
    for (const group of visibleGroups) {
      const existing = byType.get(group.type);
      if (existing) {
        existing.count += group.occurrences;
        existing.entities.add(group.entity);
      } else {
        byType.set(group.type, {
          count: group.occurrences,
          entities: new Set([group.entity]),
        });
      }
    }
    return Array.from(byType.entries()).map(([type, data]) => ({
      type,
      totalOccurrences: data.count,
      uniqueEntities: data.entities.size,
    })).sort((a, b) => b.totalOccurrences - a.totalOccurrences);
  }, [visibleGroups]);

  const handleApplyThreshold = async () => {
    setApplyingThreshold(true);
    try {
      const result = await applyConfidenceThreshold(requestId, threshold);
      setAppliedCount(result.accepted);
      setAppliedDocs(result.documentsAffected);
      setThresholdApplied(true);
      setShowConfirm(false);
      startTransition(() => router.refresh());
    } catch (err) {
      console.error("Threshold application failed:", err);
    } finally {
      setApplyingThreshold(false);
    }
  };

  const reviewedCount = reviewed.size;
  const totalGroups = visibleGroups.length;
  const progressPct = totalGroups > 0 ? Math.round((reviewedCount / totalGroups) * 100) : 0;

  return (
    <div className="p-6 max-w-[1100px]">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-txt-secondary mb-6">
        <Link href="/requests" className="hover:text-brand-primary transition-colors">
          Cases
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link href={`/requests/${requestId}`} className="hover:text-brand-primary transition-colors">
          {caseReference}
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-txt-primary font-medium">Bulk Review</span>
      </div>

      {/* Back link */}
      <Link
        href={`/requests/${requestId}`}
        className="inline-flex items-center gap-1.5 text-sm text-txt-secondary hover:text-brand-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to case
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Sparkles className="w-6 h-6 text-brand-primary" />
          <h1 className="text-2xl font-heading font-bold text-txt-primary">
            Bulk Redaction Review
          </h1>
        </div>
        <p className="text-sm text-txt-secondary">
          Propagation candidates across {totalDocuments} documents
        </p>
      </div>

      {/* ================================================================= */}
      {/* Confidence Threshold Bar */}
      {/* ================================================================= */}
      {thresholdData.length > 0 && !thresholdApplied && (
        <div className="card mb-6 border-l-4 border-l-brand-primary">
          <div className="flex items-center gap-2 mb-4">
            <SlidersHorizontal className="w-5 h-5 text-brand-primary" />
            <h2 className="text-base font-heading font-semibold text-txt-primary">
              Confidence Threshold
            </h2>
            <span className="text-xs text-txt-secondary ml-auto">
              {thresholdData.length} pending detections
            </span>
          </div>

          {/* Slider */}
          <div className="mb-4">
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={0}
                max={100}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="flex-1 h-2 rounded-lg appearance-none cursor-pointer accent-brand-primary bg-gray-200"
              />
              <span className="text-2xl font-mono font-bold text-brand-primary min-w-[3.5rem] text-right">
                {threshold}%
              </span>
            </div>
            {/* Tick labels */}
            <div className="flex justify-between px-1 mt-1">
              {SLIDER_TICKS.map((tick) => (
                <button
                  key={tick}
                  onClick={() => setThreshold(tick)}
                  className={`text-[10px] font-mono cursor-pointer hover:text-brand-primary transition-colors ${
                    tick === threshold ? "text-brand-primary font-bold" : "text-txt-secondary"
                  }`}
                >
                  {tick}
                </button>
              ))}
            </div>
          </div>

          {/* Live stats */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-700">
                {thresholdPreview.aboveCount}
              </div>
              <div className="text-xs text-green-600">auto-accept</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-amber-700">
                {thresholdPreview.belowCount}
              </div>
              <div className="text-xs text-amber-600">manual review</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-700">
                {thresholdPreview.docsAbove}
              </div>
              <div className="text-xs text-blue-600">docs affected</div>
            </div>
          </div>

          {/* Distribution chart */}
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <BarChart3 className="w-3.5 h-3.5 text-txt-secondary" />
              <span className="text-xs font-semibold tracking-wider text-txt-secondary uppercase">
                Confidence Distribution
              </span>
            </div>
            <div className="flex items-end gap-1 h-12">
              {thresholdPreview.distribution.map((count, idx) => {
                const maxCount = Math.max(...thresholdPreview.distribution, 1);
                const height = (count / maxCount) * 100;
                const bucketStart = idx * 10;
                const isAbove = bucketStart > threshold;
                const isPartial = bucketStart <= threshold && (bucketStart + 10) > threshold;
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-0.5">
                    <div
                      className={`w-full rounded-t transition-all ${
                        isAbove
                          ? "bg-green-400"
                          : isPartial
                            ? "bg-amber-400"
                            : "bg-gray-300"
                      }`}
                      style={{ height: `${Math.max(height, 2)}%` }}
                      title={`${bucketStart}-${bucketStart + 9}%: ${count} detections`}
                    />
                    <span className="text-[8px] text-txt-secondary font-mono">
                      {bucketStart}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Type breakdown */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Above threshold */}
            {thresholdPreview.aboveByType.length > 0 && (
              <div>
                <div className="text-xs font-semibold tracking-wider text-green-600 uppercase mb-1.5">
                  Auto-accept ({thresholdPreview.aboveCount})
                </div>
                <div className="space-y-1">
                  {thresholdPreview.aboveByType.map((t) => (
                    <div
                      key={t.type}
                      className="flex items-center justify-between text-xs px-2 py-1 bg-green-50 rounded"
                    >
                      <span className="text-green-700">{t.count} {t.label}</span>
                      <span className="font-mono text-green-600">avg {t.avgConf}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Below threshold */}
            {thresholdPreview.belowByType.length > 0 && (
              <div>
                <div className="text-xs font-semibold tracking-wider text-amber-600 uppercase mb-1.5">
                  Manual review ({thresholdPreview.belowCount})
                </div>
                <div className="space-y-1">
                  {thresholdPreview.belowByType.map((t) => (
                    <div
                      key={t.type}
                      className="flex items-center justify-between text-xs px-2 py-1 bg-amber-50 rounded"
                    >
                      <span className="text-amber-700">{t.count} {t.label}</span>
                      <span className="font-mono text-amber-600">avg {t.avgConf}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Apply button */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
            {thresholdPreview.aboveCount === 0 ? (
              <span className="text-sm text-txt-secondary">
                No detections above this threshold
              </span>
            ) : (
              <button
                onClick={() => setShowConfirm(true)}
                className="btn-primary flex items-center gap-2"
              >
                <Zap className="w-4 h-4" />
                Apply Threshold
              </button>
            )}
          </div>
        </div>
      )}

      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-amber-500" />
              <h3 className="text-lg font-heading font-semibold text-txt-primary">
                Confirm Threshold Application
              </h3>
            </div>
            <p className="text-sm text-txt-secondary mb-4">
              You are about to auto-accept{" "}
              <strong className="text-txt-primary">{thresholdPreview.aboveCount} detections</strong>{" "}
              across{" "}
              <strong className="text-txt-primary">{thresholdPreview.docsAbove} documents</strong>.
            </p>
            <p className="text-sm text-txt-secondary mb-4">
              Detections above <strong className="text-txt-primary">{threshold}%</strong> confidence
              will be marked as accepted with their suggested LGOIMA grounds.
              This action is logged in the audit trail.
            </p>
            <p className="text-xs text-txt-secondary mb-6">
              Auto-accepted detections can still be individually reverted in the document review page.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                className="btn-ghost"
                onClick={() => setShowConfirm(false)}
                disabled={applyingThreshold}
              >
                Cancel
              </button>
              <button
                className="btn-primary flex items-center gap-2"
                onClick={handleApplyThreshold}
                disabled={applyingThreshold}
              >
                {applyingThreshold ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Apply Threshold
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post-apply banner */}
      {thresholdApplied && (
        <div className="card mb-6 !bg-green-50 border border-green-200">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <div>
              <div className="text-sm font-medium text-green-800">
                {appliedCount} detections auto-accepted above {threshold}% confidence
              </div>
              <div className="text-xs text-green-600">
                Across {appliedDocs} documents.{" "}
                {visibleGroups.length > 0
                  ? `${visibleGroups.length} entity groups remaining for manual review.`
                  : "All detections have been processed."}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div className="card mb-6 !py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-txt-primary font-medium">
            {reviewedCount} of {totalGroups} entity groups reviewed
          </span>
          <span className="text-xs font-mono text-txt-secondary">
            {progressPct}%
          </span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-primary rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Bulk ground success toast */}
      {bulkGroundSuccess && (
        <div className="card mb-6 !bg-green-50 border border-green-200">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <div className="text-sm font-medium text-green-800 flex-1">
              {bulkGroundSuccess}
            </div>
            <button
              onClick={() => setBulkGroundSuccess(null)}
              className="text-green-600 hover:text-green-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Bulk type ground success toast */}
      {bulkTypeSuccess && (
        <div className="card mb-6 !bg-green-50 border border-green-200">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <div className="text-sm font-medium text-green-800 flex-1">
              {bulkTypeSuccess}
            </div>
            <button
              onClick={() => setBulkTypeSuccess(null)}
              className="text-green-600 hover:text-green-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Type Summary — Apply ground to all of a type */}
      {typeSummary.length > 0 && (
        <div className="card mb-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-brand-primary" />
            <h2 className="text-base font-heading font-semibold text-txt-primary">
              Detection Type Summary
            </h2>
          </div>
          <div className="space-y-2">
            {typeSummary.map((ts) => (
              <div key={ts.type}>
                <div className="flex items-center justify-between px-3 py-2.5 bg-surface-bg rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="badge bg-blue-50 text-blue-700">
                      {ts.type}
                    </span>
                    <span className="text-sm text-txt-secondary">
                      {ts.totalOccurrences} occurrences across {ts.uniqueEntities} entities
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      if (bulkTypeGround === ts.type) {
                        setBulkTypeGround(null);
                      } else {
                        setBulkTypeGround(ts.type);
                        setBulkTypeGroundValue("");
                        setBulkTypeGroundAction("accept");
                      }
                    }}
                    className="btn-secondary text-xs flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Apply ground to all {ts.type}
                  </button>
                </div>
                {/* Inline form for applying ground by type */}
                {bulkTypeGround === ts.type && (
                  <div className="mt-2 ml-4 p-3 border border-border rounded-lg bg-white">
                    <div className="flex items-end gap-3 flex-wrap">
                      <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-medium text-txt-secondary mb-1">
                          LGOIMA Ground
                        </label>
                        <select
                          className="input-field text-sm"
                          value={bulkTypeGroundValue}
                          onChange={(e) => setBulkTypeGroundValue(e.target.value)}
                        >
                          <option value="">Select ground...</option>
                          {lgoimaGrounds.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.reference} — {g.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="w-32">
                        <label className="block text-xs font-medium text-txt-secondary mb-1">
                          Action
                        </label>
                        <select
                          className="input-field text-sm"
                          value={bulkTypeGroundAction}
                          onChange={(e) =>
                            setBulkTypeGroundAction(e.target.value as "accept" | "reject")
                          }
                        >
                          <option value="accept">Accept</option>
                          <option value="reject">Reject</option>
                        </select>
                      </div>
                      <button
                        onClick={() => handleBulkApplyGroundByType(ts.type)}
                        disabled={!bulkTypeGroundValue || bulkTypeApplying}
                        className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {bulkTypeApplying ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Zap className="w-3.5 h-3.5" />
                        )}
                        Confirm
                      </button>
                      <button
                        onClick={() => setBulkTypeGround(null)}
                        className="btn-ghost text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Entity group cards */}
      <div className="space-y-5">
        {visibleGroups.map((group) => {
          const isReviewed = reviewed.has(group.id);

          return (
            <div
              key={group.id}
              className={`card transition-all ${
                isReviewed ? "opacity-60" : ""
              }`}
            >
              {/* Entity header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-lg font-semibold text-txt-primary font-mono">
                      &ldquo;{group.entity}&rdquo;
                    </h3>
                    {isReviewed && (
                      <span className="badge bg-green-50 text-confidence-high">
                        <CheckCircle className="w-3 h-3" />
                        Reviewed
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-txt-secondary">
                    <span className="badge bg-blue-50 text-blue-700">
                      {group.type}
                    </span>
                    <span className="font-mono text-xs bg-purple-50 text-brand-primary px-1.5 py-0.5 rounded">
                      {group.groundRef}
                    </span>
                    <span>
                      {group.ground}
                    </span>
                    <span className="font-mono text-xs text-txt-secondary">
                      {group.confidence}% avg
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-txt-primary">
                    {group.docCount} documents
                  </div>
                  <div className="text-xs text-txt-secondary">
                    {group.occurrences} occurrences
                  </div>
                </div>
              </div>

              {/* Sample context snippets */}
              <div className="mb-4">
                <div className="text-xs font-semibold tracking-wider text-txt-secondary uppercase mb-2">
                  Sample Contexts
                </div>
                <div className="space-y-2">
                  {group.snippets.map((snippet, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 px-3 py-2.5 bg-surface-bg rounded-lg"
                    >
                      <FileText className="w-3.5 h-3.5 text-txt-secondary flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="text-[11px] font-mono text-txt-secondary/70 mb-0.5">
                          {snippet.doc}
                        </div>
                        <div className="text-xs text-txt-secondary leading-relaxed">
                          {snippet.parts.map((part, pIdx) =>
                            part.highlight ? (
                              <span
                                key={pIdx}
                                className="bg-amber-100 text-amber-800 px-0.5 rounded font-medium"
                              >
                                {part.text}
                              </span>
                            ) : (
                              <span key={pIdx}>{part.text}</span>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              {!isReviewed && (
                <div>
                  <div className="flex items-center gap-3 pt-3 border-t border-border">
                    <button
                      onClick={() => handleAcceptAll(group)}
                      disabled={actionInProgress === group.id}
                      className="btn-primary flex items-center gap-2"
                    >
                      {actionInProgress === group.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      Apply to All
                    </button>
                    <button
                      onClick={() => {
                        if (bulkGroundEntity === group.id) {
                          setBulkGroundEntity(null);
                        } else {
                          setBulkGroundEntity(group.id);
                          setBulkGroundValue(
                            lgoimaGrounds.find((g) => g.id === group.groundRef || g.reference === group.groundRef)?.id || "",
                          );
                          setBulkGroundAction("accept");
                        }
                      }}
                      disabled={actionInProgress === group.id}
                      className="btn-secondary flex items-center gap-2"
                    >
                      <Sparkles className="w-4 h-4" />
                      Apply to All Similar
                    </button>
                    <button
                      onClick={() => handleReviewEach(group)}
                      disabled={actionInProgress === group.id}
                      className="btn-secondary flex items-center gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      Review Each
                    </button>
                    <button
                      onClick={() => handleSkip(group)}
                      disabled={actionInProgress === group.id}
                      className="btn-ghost flex items-center gap-2"
                    >
                      {actionInProgress === group.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <X className="w-4 h-4" />
                      )}
                      Skip
                    </button>
                  </div>

                  {/* Inline form for applying ground to similar */}
                  {bulkGroundEntity === group.id && (
                    <div className="mt-3 p-3 border border-border rounded-lg bg-surface-bg">
                      <div className="text-xs font-semibold tracking-wider text-txt-secondary uppercase mb-2">
                        Apply ground to all detections of &ldquo;{group.entity}&rdquo;
                      </div>
                      <div className="flex items-end gap-3 flex-wrap">
                        <div className="flex-1 min-w-[200px]">
                          <label className="block text-xs font-medium text-txt-secondary mb-1">
                            LGOIMA Ground
                          </label>
                          <select
                            className="input-field text-sm"
                            value={bulkGroundValue}
                            onChange={(e) => setBulkGroundValue(e.target.value)}
                          >
                            <option value="">Select ground...</option>
                            {lgoimaGrounds.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.reference} — {g.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="w-32">
                          <label className="block text-xs font-medium text-txt-secondary mb-1">
                            Action
                          </label>
                          <select
                            className="input-field text-sm"
                            value={bulkGroundAction}
                            onChange={(e) =>
                              setBulkGroundAction(e.target.value as "accept" | "reject")
                            }
                          >
                            <option value="accept">Accept</option>
                            <option value="reject">Reject</option>
                          </select>
                        </div>
                        <button
                          onClick={() => handleBulkApplyGroundToSimilar(group)}
                          disabled={!bulkGroundValue || bulkGroundApplying}
                          className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {bulkGroundApplying ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Zap className="w-3.5 h-3.5" />
                          )}
                          Confirm
                        </button>
                        <button
                          onClick={() => setBulkGroundEntity(null)}
                          className="btn-ghost text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {visibleGroups.length === 0 && thresholdApplied && (
          <div className="card text-center py-12">
            <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
            <h3 className="text-lg font-heading font-semibold text-txt-primary mb-1">
              All detections processed
            </h3>
            <p className="text-sm text-txt-secondary mb-4">
              {appliedCount} detections were auto-accepted above {threshold}% confidence.
              No remaining detections require manual review.
            </p>
            <Link
              href={`/requests/${requestId}`}
              className="btn-primary inline-flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to case
            </Link>
          </div>
        )}

        {visibleGroups.length === 0 && !thresholdApplied && entityGroups.length === 0 && (
          <div className="card text-center py-12">
            <p className="text-sm text-txt-secondary">
              No entity groups to review.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
