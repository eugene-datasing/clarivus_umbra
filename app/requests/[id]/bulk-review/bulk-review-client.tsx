"use client";

import { useState, useTransition } from "react";
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
} from "lucide-react";
import {
  bulkAcceptDetections,
  bulkRejectDetections,
} from "@/lib/actions/detection-actions";

interface SnippetPart {
  text: string;
  highlight: boolean;
}

interface Snippet {
  doc: string;
  parts: SnippetPart[];
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
}

interface BulkReviewClientProps {
  entityGroups: EntityGroup[];
  caseReference: string;
  requestId: string;
  totalDocuments: number;
}

export default function BulkReviewClient({
  entityGroups,
  caseReference,
  requestId,
  totalDocuments,
}: BulkReviewClientProps) {
  const router = useRouter();
  const [reviewed, setReviewed] = useState<Set<number>>(new Set());
  const [actionInProgress, setActionInProgress] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

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
    // Navigate to the first document containing this entity for individual review
    // Use the first detection's document
    const firstDetection = group.detectionIds[0];
    if (firstDetection) {
      // Mark as reviewed locally (they'll review individually)
      setReviewed((prev) => new Set(prev).add(group.id));
    }
  };

  const reviewedCount = reviewed.size;
  const totalGroups = entityGroups.length;
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

      {/* Entity group cards */}
      <div className="space-y-5">
        {entityGroups.map((group) => {
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
