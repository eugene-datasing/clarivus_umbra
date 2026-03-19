"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Eye,
  Edit,
  AlertCircle,
  Star,
  FileText,
  Shield,
  Send,
  Clock,
  History,
  GitCompare,
} from "lucide-react";
import {
  detectionTypeConfig,
  type DetectionStatus,
  type DocParagraph,
} from "@/lib/db/mappers";
import {
  acceptDetection,
  rejectDetection,
  revertDetection,
  applyGround,
  submitForSeniorReview,
  signOffDocument,
  requestChanges,
} from "@/lib/actions/detection-actions";
import { lgoimaGrounds } from "@/lib/lgoima-grounds";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type TabFilter = "all" | "personal" | "commercial" | "other";

interface DetectionState {
  status: DetectionStatus;
  appliedGround: string | null;
}

/** Shape returned by getDetectionsForDocument() */
export interface Detection {
  id: string;
  documentId: string;
  type: string;
  text: string;
  confidence: number;
  page: number;
  position: { x: number; y: number; w: number; h: number };
  suggestedGround: string | null;
  appliedGround: string | null;
  status: string;
  reasoning: string;
  piConsideration: string;
  aiExplanation: string;
}

export interface ReviewClientProps {
  requestId: string;
  docId: string;
  docName: string;
  docStatus: string;
  documentContent: DocParagraph[];
  header: { title: string; subtitle: string; date: string };
  detections: Detection[];
  documentIds: string[];
  currentDocIndex: number;
}

/* -------------------------------------------------------------------------- */
/*  Ground selector (inline)                                                  */
/* -------------------------------------------------------------------------- */

function GroundSelector({
  detectionId,
  suggestedGround,
  appliedGround,
  onSelect,
  onClose,
}: {
  detectionId: string;
  suggestedGround: string | null;
  appliedGround: string | null;
  onSelect: (detectionId: string, groundId: string) => void;
  onClose: () => void;
}) {
  const commonGrounds = lgoimaGrounds.filter((g) => g.common);
  return (
    <div className="absolute z-50 right-0 top-full mt-1 w-80 bg-surface-card border border-border rounded-card shadow-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-txt-primary uppercase tracking-wide">
          Select Withholding Ground
        </span>
        <button onClick={onClose} className="text-txt-secondary hover:text-txt-primary">
          <X size={14} />
        </button>
      </div>
      {suggestedGround && (
        <div className="mb-2 px-2 py-1.5 bg-brand-primary/5 border border-brand-primary/20 rounded-input">
          <span className="text-[10px] uppercase tracking-wider text-brand-primary font-semibold">
            AI Suggested
          </span>
        </div>
      )}
      <div className="space-y-0.5 max-h-48 overflow-y-auto">
        {commonGrounds.map((g) => (
          <button
            key={g.id}
            onClick={() => {
              onSelect(detectionId, g.id);
              onClose();
            }}
            className={cn(
              "w-full text-left px-2 py-1.5 rounded-input text-xs hover:bg-surface-hover transition-colors flex items-center gap-2",
              appliedGround === g.id && "bg-brand-primary/10 text-brand-primary font-medium",
              suggestedGround === g.id && appliedGround !== g.id && "bg-amber-50"
            )}
          >
            <span className="font-mono text-[10px] text-txt-secondary w-16 shrink-0">
              {g.reference}
            </span>
            <span className="truncate">{g.label}</span>
            {suggestedGround === g.id && (
              <Star size={10} className="text-amber-500 ml-auto shrink-0" />
            )}
            {appliedGround === g.id && (
              <Check size={10} className="text-brand-primary ml-auto shrink-0" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Client Component                                                     */
/* -------------------------------------------------------------------------- */

export default function ReviewClient({
  requestId,
  docId,
  docName,
  docStatus: initialDocStatus,
  documentContent,
  header,
  detections,
  documentIds,
  currentDocIndex,
}: ReviewClientProps) {
  const router = useRouter();

  // ----- State (initialised from DB data via props) -----
  const [detectionStates, setDetectionStates] = useState<Record<string, DetectionState>>(() => {
    const init: Record<string, DetectionState> = {};
    for (const d of detections) {
      init[d.id] = { status: d.status as DetectionStatus, appliedGround: d.appliedGround };
    }
    return init;
  });

  const [docStatus, setDocStatus] = useState(initialDocStatus);
  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabFilter>("all");
  const [groundSelectorId, setGroundSelectorId] = useState<string | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showSignOffConfirm, setShowSignOffConfirm] = useState(false);
  const [showRequestChanges, setShowRequestChanges] = useState(false);
  const [requestChangesReason, setRequestChangesReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitSuccess, setShowSubmitSuccess] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyData, setHistoryData] = useState<
    { id: string; field: string; previousValue: string | null; newValue: string | null; changedBy: string; changedAt: string }[]
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Refs for scrolling
  const detectionRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const redactionRefs = useRef<Record<string, HTMLSpanElement | null>>({});

  // ----- Fetch detection history on demand -----
  useEffect(() => {
    if (!historyOpen || !selectedDetectionId) {
      setHistoryData([]);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    fetch(`/api/detections/${selectedDetectionId}/history`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        if (!cancelled) setHistoryData(data);
      })
      .catch(() => {
        if (!cancelled) setHistoryData([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => { cancelled = true; };
  }, [historyOpen, selectedDetectionId]);

  // Reset history when detection selection changes
  useEffect(() => {
    setHistoryOpen(false);
  }, [selectedDetectionId]);

  // ----- Prev / Next navigation -----
  const hasPrev = currentDocIndex > 0;
  const hasNext = currentDocIndex < documentIds.length - 1;
  const prevHref = hasPrev
    ? `/requests/${requestId}/review/${documentIds[currentDocIndex - 1]}`
    : undefined;
  const nextHref = hasNext
    ? `/requests/${requestId}/review/${documentIds[currentDocIndex + 1]}`
    : undefined;

  // ----- Derived -----
  const filteredDetections = useMemo(() => {
    if (activeTab === "all") return detections;
    if (activeTab === "personal") {
      return detections.filter((d) =>
        ["personal-name", "phone", "email-addr", "ird", "address"].includes(d.type)
      );
    }
    if (activeTab === "commercial") {
      return detections.filter((d) => ["commercial"].includes(d.type));
    }
    // "other"
    return detections.filter(
      (d) =>
        !["personal-name", "phone", "email-addr", "ird", "address", "commercial"].includes(d.type)
    );
  }, [detections, activeTab]);

  const stats = useMemo(() => {
    const total = detections.length;
    let accepted = 0;
    let rejected = 0;
    let pending = 0;
    for (const d of detections) {
      const s = detectionStates[d.id]?.status ?? "pending";
      if (s === "accepted") accepted++;
      else if (s === "rejected") rejected++;
      else pending++;
    }
    return { total, accepted, rejected, pending };
  }, [detections, detectionStates]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const personal = detections.filter((d) =>
      ["personal-name", "phone", "email-addr", "ird", "address"].includes(d.type)
    ).length;
    const commercial = detections.filter((d) => d.type === "commercial").length;
    const other = detections.length - personal - commercial;
    return { all: detections.length, personal, commercial, other };
  }, [detections]);

  // ----- Handlers (optimistic update + server action) -----
  const handleAccept = useCallback(async (detectionId: string) => {
    // Optimistic update
    setDetectionStates((prev) => ({
      ...prev,
      [detectionId]: { ...prev[detectionId], status: "accepted" },
    }));
    // Open ground selector
    setGroundSelectorId(detectionId);
    // Persist
    try {
      await acceptDetection(detectionId);
    } catch {
      // Revert on error
      setDetectionStates((prev) => ({
        ...prev,
        [detectionId]: { ...prev[detectionId], status: "pending" },
      }));
    }
  }, []);

  const handleReject = useCallback(async (detectionId: string) => {
    // Optimistic update
    setDetectionStates((prev) => ({
      ...prev,
      [detectionId]: { ...prev[detectionId], status: "rejected", appliedGround: null },
    }));
    setGroundSelectorId(null);
    // Persist
    try {
      await rejectDetection(detectionId);
    } catch {
      // Revert on error
      setDetectionStates((prev) => ({
        ...prev,
        [detectionId]: { ...prev[detectionId], status: "pending" },
      }));
    }
  }, []);

  const handleRevert = useCallback(async (detectionId: string) => {
    // Save previous state for rollback
    const previousState = detectionStates[detectionId];
    // Optimistic update
    setDetectionStates((prev) => ({
      ...prev,
      [detectionId]: { ...prev[detectionId], status: "pending", appliedGround: null },
    }));
    setGroundSelectorId(null);
    // Persist
    try {
      await revertDetection(detectionId);
    } catch {
      // Revert on error
      if (previousState) {
        setDetectionStates((prev) => ({
          ...prev,
          [detectionId]: previousState,
        }));
      }
    }
  }, [detectionStates]);

  const handleGroundSelect = useCallback(async (detectionId: string, groundId: string) => {
    const previousGround = detectionStates[detectionId]?.appliedGround;
    // Optimistic update
    setDetectionStates((prev) => ({
      ...prev,
      [detectionId]: { ...prev[detectionId], appliedGround: groundId },
    }));
    // Persist
    try {
      await applyGround(detectionId, groundId);
    } catch {
      // Revert on error
      setDetectionStates((prev) => ({
        ...prev,
        [detectionId]: { ...prev[detectionId], appliedGround: previousGround ?? null },
      }));
    }
  }, [detectionStates]);

  const handleDetectionClick = useCallback((detectionId: string) => {
    setSelectedDetectionId(detectionId);
    // Scroll to the highlighted span in the redacted view
    const el = redactionRefs.current[detectionId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  // Scroll detection table row into view when clicking a highlight
  const handleHighlightClick = useCallback((detectionId: string) => {
    setSelectedDetectionId(detectionId);
    const row = detectionRowRefs.current[detectionId];
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  // ----- Confidence colour helpers -----
  function confBgClass(score: number): string {
    if (score >= 85) return "bg-confidence-high/20 border-confidence-high/40";
    if (score >= 50) return "bg-confidence-medium/20 border-confidence-medium/40";
    return "bg-confidence-low/20 border-confidence-low/40";
  }

  function confTextClass(score: number): string {
    if (score >= 85) return "text-confidence-high";
    if (score >= 50) return "text-confidence-medium";
    return "text-confidence-low";
  }

  function confDotClass(score: number): string {
    if (score >= 85) return "bg-confidence-high";
    if (score >= 50) return "bg-confidence-medium";
    return "bg-confidence-low";
  }

  // ----- Ground lookup -----
  function groundLabel(groundId: string | null): string {
    if (!groundId) return "\u2014";
    const g = lgoimaGrounds.find((x) => x.id === groundId);
    return g ? g.reference : groundId;
  }

  // ----- Build detection lookup by id for highlighting -----
  const detectionById = useMemo(() => {
    const map = new Map<string, Detection>();
    for (const d of detections) {
      map.set(d.id, d);
    }
    return map;
  }, [detections]);

  /* ---------------------------------------------------------------------- */
  /*  Render helpers                                                         */
  /* ---------------------------------------------------------------------- */

  /** Render paragraph segments -- original (no highlights) */
  function renderOriginalParagraph(para: DocParagraph, idx: number) {
    return (
      <div key={idx} className={para.heading ? "mt-5" : "mt-3"}>
        {para.heading && (
          <h3 className="font-heading text-sm font-bold text-txt-primary mb-1 leading-snug">
            {para.heading}
          </h3>
        )}
        <p className="text-[11.5px] leading-[1.7] text-txt-primary/90 whitespace-pre-line">
          {para.segments.map((seg, si) => (
            <span key={si}>{seg.text}</span>
          ))}
        </p>
      </div>
    );
  }

  /** Render paragraph segments -- redacted view with highlights */
  function renderRedactedParagraph(para: DocParagraph, idx: number) {
    return (
      <div key={idx} className={para.heading ? "mt-5" : "mt-3"}>
        {para.heading && (
          <h3 className="font-heading text-sm font-bold text-txt-primary mb-1 leading-snug">
            {para.heading}
          </h3>
        )}
        <p className="text-[11.5px] leading-[1.7] text-txt-primary/90 whitespace-pre-line">
          {para.segments.map((seg, si) => {
            if (!seg.detectionId) return <span key={si}>{seg.text}</span>;

            const det = detectionById.get(seg.detectionId);
            if (!det) return <span key={si}>{seg.text}</span>;

            const state = detectionStates[det.id];
            const isSelected = selectedDetectionId === det.id;
            const isRejected = state?.status === "rejected";
            const isAccepted = state?.status === "accepted";
            const typeConf = detectionTypeConfig[det.type as keyof typeof detectionTypeConfig];

            return (
              <span
                key={si}
                ref={(el) => { redactionRefs.current[det.id] = el; }}
                onClick={() => handleHighlightClick(det.id)}
                className={cn(
                  "relative cursor-pointer inline rounded-sm px-0.5 -mx-0.5 border transition-all duration-150",
                  isRejected
                    ? "line-through opacity-40 bg-gray-100 border-gray-300"
                    : confBgClass(det.confidence),
                  isSelected && !isRejected && "ring-2 ring-brand-primary ring-offset-1",
                  isAccepted && !isRejected && "ring-1 ring-confidence-high"
                )}
                title={typeConf ? `${typeConf.label} \u2014 ${det.confidence}% confidence` : `${det.type} \u2014 ${det.confidence}% confidence`}
              >
                {seg.text}
                {isAccepted && !isRejected && (
                  <Check
                    size={10}
                    className="inline-block ml-0.5 text-confidence-high align-text-top"
                  />
                )}
              </span>
            );
          })}
        </p>
      </div>
    );
  }

  /* ---------------------------------------------------------------------- */
  /*  Page Layout                                                            */
  /* ---------------------------------------------------------------------- */

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-surface-bg">
      {/* ===== TOP NAV BAR ===== */}
      <header className="shrink-0 bg-surface-card border-b border-border px-5 py-2.5 flex items-center justify-between gap-4">
        {/* Left: back + doc info */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/requests/${requestId}`}
            className="btn-ghost flex items-center gap-1.5 shrink-0"
          >
            <ArrowLeft size={15} />
            <span className="hidden sm:inline">Back to Case</span>
          </Link>
          <div className="h-5 w-px bg-border shrink-0" />
          <FileText size={15} className="text-brand-primary shrink-0" />
          <span className="font-body font-medium text-sm text-txt-primary truncate">
            {docName}
          </span>
          <span className="badge bg-gray-100 text-txt-secondary text-[10px] shrink-0">
            {currentDocIndex + 1} of {documentIds.length}
          </span>
          <Link
            href={`/requests/${requestId}/review/${docId}/compare`}
            className="btn-ghost flex items-center gap-1 text-[10px] shrink-0"
            title="Compare version snapshots"
          >
            <GitCompare size={12} />
            <span className="hidden xl:inline">Compare</span>
          </Link>
        </div>

        {/* Center: Prev / Next */}
        <div className="flex items-center gap-1.5 shrink-0">
          {prevHref ? (
            <Link href={prevHref} className="btn-ghost flex items-center gap-1" title="Previous document">
              <ChevronLeft size={15} />
              <span className="text-xs hidden md:inline">Prev</span>
            </Link>
          ) : (
            <span className="btn-ghost flex items-center gap-1 opacity-40 pointer-events-none">
              <ChevronLeft size={15} />
              <span className="text-xs hidden md:inline">Prev</span>
            </span>
          )}
          {nextHref ? (
            <Link href={nextHref} className="btn-ghost flex items-center gap-1" title="Next document">
              <span className="text-xs hidden md:inline">Next</span>
              <ChevronRight size={15} />
            </Link>
          ) : (
            <span className="btn-ghost flex items-center gap-1 opacity-40 pointer-events-none">
              <span className="text-xs hidden md:inline">Next</span>
              <ChevronRight size={15} />
            </span>
          )}
        </div>

        {/* Right: stats + submit */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Mini progress */}
          <div className="hidden lg:flex items-center gap-2.5 text-[11px] text-txt-secondary">
            <span className="flex items-center gap-1">
              <Check size={11} className="text-confidence-high" />
              {stats.accepted}
            </span>
            <span className="flex items-center gap-1">
              <X size={11} className="text-confidence-low" />
              {stats.rejected}
            </span>
            <span className="flex items-center gap-1">
              <AlertCircle size={11} className="text-confidence-medium" />
              {stats.pending}
            </span>
          </div>
          {/* Status-aware action buttons */}
          {(docStatus === "in-review" || docStatus === "ready") && (
            <div className="relative">
              <button
                onClick={() => setShowSubmitConfirm((v) => !v)}
                className="btn-primary flex items-center gap-1.5"
                disabled={isSubmitting}
              >
                <Send size={14} />
                <span className="hidden sm:inline">Submit to Senior Review</span>
              </button>
              {showSubmitConfirm && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-surface-card border border-border rounded-card shadow-lg p-4 z-50">
                  <div className="flex items-start gap-2 mb-3">
                    <Shield size={16} className="text-brand-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-txt-primary">Confirm Submission</p>
                      <p className="text-xs text-txt-secondary mt-1">
                        {stats.pending > 0
                          ? `${stats.pending} detection(s) are still pending review. Are you sure you want to submit?`
                          : "All detections reviewed. Ready to submit for senior review."}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowSubmitConfirm(false)} className="btn-ghost text-xs">
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        setShowSubmitConfirm(false);
                        setIsSubmitting(true);
                        try {
                          await submitForSeniorReview(docId);
                          setDocStatus("reviewed");
                          setShowSubmitSuccess(true);
                          setTimeout(() => setShowSubmitSuccess(false), 3000);
                        } catch (e) {
                          console.error("Submit failed:", e);
                        } finally {
                          setIsSubmitting(false);
                        }
                      }}
                      className="btn-primary text-xs"
                    >
                      Submit
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {docStatus === "reviewed" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-purple-600 font-medium bg-purple-50 px-2 py-1 rounded hidden lg:inline">
                Awaiting Senior Review
              </span>
              <div className="relative">
                <button
                  onClick={() => { setShowRequestChanges((v) => !v); setShowSignOffConfirm(false); }}
                  className="btn-ghost text-xs flex items-center gap-1 text-amber-600 border-amber-200 hover:bg-amber-50"
                  disabled={isSubmitting}
                >
                  <ArrowLeft size={12} />
                  Request Changes
                </button>
                {showRequestChanges && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-surface-card border border-border rounded-card shadow-lg p-4 z-50">
                    <p className="text-sm font-medium text-txt-primary mb-2">Request Changes</p>
                    <textarea
                      className="input-field text-xs min-h-[60px] mb-3"
                      placeholder="Reason for requesting changes (optional)..."
                      value={requestChangesReason}
                      onChange={(e) => setRequestChangesReason(e.target.value)}
                    />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setShowRequestChanges(false); setRequestChangesReason(""); }} className="btn-ghost text-xs">
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          setIsSubmitting(true);
                          try {
                            await requestChanges(docId, requestChangesReason || undefined);
                            setDocStatus("in-review");
                            setShowRequestChanges(false);
                            setRequestChangesReason("");
                          } catch (e) {
                            console.error("Request changes failed:", e);
                          } finally {
                            setIsSubmitting(false);
                          }
                        }}
                        className="btn-primary text-xs bg-amber-600 hover:bg-amber-700"
                      >
                        Send Back
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="relative">
                <button
                  onClick={() => { setShowSignOffConfirm((v) => !v); setShowRequestChanges(false); }}
                  className="btn-primary flex items-center gap-1.5 bg-green-600 hover:bg-green-700"
                  disabled={isSubmitting}
                >
                  <Check size={14} />
                  <span className="hidden sm:inline">Sign Off</span>
                </button>
                {showSignOffConfirm && (
                  <div className="absolute right-0 top-full mt-2 w-72 bg-surface-card border border-border rounded-card shadow-lg p-4 z-50">
                    <div className="flex items-start gap-2 mb-3">
                      <Shield size={16} className="text-green-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-txt-primary">Confirm Sign-Off</p>
                        <p className="text-xs text-txt-secondary mt-1">
                          This confirms all redaction decisions for this document are approved. This action will be recorded in the audit trail.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setShowSignOffConfirm(false)} className="btn-ghost text-xs">
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          setShowSignOffConfirm(false);
                          setIsSubmitting(true);
                          try {
                            await signOffDocument(docId);
                            setDocStatus("signed-off");
                            setShowSubmitSuccess(true);
                            setTimeout(() => setShowSubmitSuccess(false), 3000);
                          } catch (e) {
                            console.error("Sign-off failed:", e);
                          } finally {
                            setIsSubmitting(false);
                          }
                        }}
                        className="btn-primary text-xs bg-green-600 hover:bg-green-700"
                      >
                        Confirm Sign-Off
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {docStatus === "signed-off" && (
            <span className="text-xs text-green-600 font-semibold bg-green-50 px-3 py-1.5 rounded flex items-center gap-1.5">
              <Check size={14} />
              Signed Off
            </span>
          )}
        </div>
      </header>

      {/* ===== MAIN CONTENT: Split Panels + Bottom Detection Table ===== */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* --- Split Panels --- */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* LEFT PANEL -- Original Document */}
          <div className="w-1/2 border-r border-border flex flex-col overflow-hidden">
            <div className="shrink-0 px-4 py-2 border-b border-border bg-surface-card flex items-center gap-2">
              <Eye size={13} className="text-txt-secondary" />
              <span className="text-xs font-semibold text-txt-secondary uppercase tracking-wider">
                Original Document
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-[640px] mx-auto px-8 py-6">
                {/* Simulated page chrome */}
                <div className="bg-white border border-gray-200 rounded shadow-sm px-10 py-8 min-h-[600px]">
                  {/* Document header bar */}
                  <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-200">
                    <div className="w-8 h-8 rounded-full bg-brand-primary flex items-center justify-center">
                      <span className="text-white font-heading text-xs font-bold">
                        {header.title.split(" ").map(w => w[0]).slice(0, 2).join("")}
                      </span>
                    </div>
                    <div>
                      <p className="text-[10px] text-txt-secondary uppercase tracking-widest font-semibold">
                        {header.title}
                      </p>
                      <p className="text-[9px] text-txt-secondary/60">
                        {header.subtitle}
                      </p>
                    </div>
                    <span className="ml-auto text-[9px] text-txt-secondary/50">{header.date}</span>
                  </div>

                  {documentContent.map((para, i) => renderOriginalParagraph(para, i))}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL -- Redacted View */}
          <div className="w-1/2 flex flex-col overflow-hidden">
            <div className="shrink-0 px-4 py-2 border-b border-border bg-surface-card flex items-center gap-2">
              <Edit size={13} className="text-brand-primary" />
              <span className="text-xs font-semibold text-brand-primary uppercase tracking-wider">
                Redacted View
              </span>
              <span className="ml-auto flex items-center gap-3 text-[10px] text-txt-secondary">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-confidence-high inline-block" />
                  High
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-confidence-medium inline-block" />
                  Medium
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-confidence-low inline-block" />
                  Low
                </span>
              </span>
            </div>
            <div className="flex-1 overflow-y-auto bg-gray-50/50">
              <div className="max-w-[640px] mx-auto px-8 py-6">
                <div className="bg-white border border-gray-200 rounded shadow-sm px-10 py-8 min-h-[600px]">
                  {/* Document header bar */}
                  <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-200">
                    <div className="w-8 h-8 rounded-full bg-brand-primary flex items-center justify-center">
                      <span className="text-white font-heading text-xs font-bold">
                        {header.title.split(" ").map(w => w[0]).slice(0, 2).join("")}
                      </span>
                    </div>
                    <div>
                      <p className="text-[10px] text-txt-secondary uppercase tracking-widest font-semibold">
                        {header.title}
                      </p>
                      <p className="text-[9px] text-txt-secondary/60">
                        {header.subtitle}
                      </p>
                    </div>
                    <span className="ml-auto text-[9px] text-txt-secondary/50">{header.date}</span>
                  </div>

                  {documentContent.map((para, i) => renderRedactedParagraph(para, i))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* --- Bottom Detection Panel --- */}
        <div className="shrink-0 h-[280px] border-t border-border bg-surface-card flex flex-col">
          {/* Tab bar */}
          <div className="shrink-0 flex items-center gap-0 border-b border-border px-4">
            {(
              [
                { key: "all", label: "All Detections" },
                { key: "personal", label: "Personal" },
                { key: "commercial", label: "Commercial" },
                { key: "other", label: "Other" },
              ] as { key: TabFilter; label: string }[]
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "px-3 py-2.5 text-xs font-medium border-b-2 transition-colors",
                  activeTab === tab.key
                    ? "border-brand-primary text-brand-primary"
                    : "border-transparent text-txt-secondary hover:text-txt-primary"
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]",
                    activeTab === tab.key
                      ? "bg-brand-primary/10 text-brand-primary"
                      : "bg-gray-100 text-txt-secondary"
                  )}
                >
                  {tabCounts[tab.key]}
                </span>
              </button>
            ))}

            {/* Right side: summary */}
            <div className="ml-auto flex items-center gap-4 text-[11px] text-txt-secondary pr-1">
              <span>
                <span className="font-semibold text-confidence-high">{stats.accepted}</span>{" "}
                accepted
              </span>
              <span>
                <span className="font-semibold text-confidence-low">{stats.rejected}</span>{" "}
                rejected
              </span>
              <span>
                <span className="font-semibold text-confidence-medium">{stats.pending}</span>{" "}
                pending
              </span>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-card z-10">
                <tr className="text-left text-[10px] uppercase tracking-wider text-txt-secondary border-b border-border">
                  <th className="pl-4 pr-2 py-2 w-10">#</th>
                  <th className="px-2 py-2 min-w-[200px]">Entity</th>
                  <th className="px-2 py-2 w-28">Type</th>
                  <th className="px-2 py-2 w-20 text-center">Confidence</th>
                  <th className="px-2 py-2 w-20">Page</th>
                  <th className="px-2 py-2 w-24">Ground</th>
                  <th className="px-2 py-2 w-20">Status</th>
                  <th className="pr-4 pl-2 py-2 w-28 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDetections.map((det, idx) => {
                  const state = detectionStates[det.id];
                  const isSelected = selectedDetectionId === det.id;
                  const isAccepted = state?.status === "accepted";
                  const isRejected = state?.status === "rejected";
                  const typeConf = detectionTypeConfig[det.type as keyof typeof detectionTypeConfig];

                  return (
                    <tr
                      key={det.id}
                      ref={(el) => { detectionRowRefs.current[det.id] = el; }}
                      onClick={() => handleDetectionClick(det.id)}
                      className={cn(
                        "border-b border-border/50 cursor-pointer transition-colors",
                        isSelected
                          ? "bg-brand-primary/5"
                          : "hover:bg-surface-hover",
                        isRejected && "opacity-50"
                      )}
                    >
                      {/* # */}
                      <td className="pl-4 pr-2 py-2 font-mono text-txt-secondary text-[10px]">
                        {idx + 1}
                      </td>

                      {/* Entity */}
                      <td className="px-2 py-2">
                        <span
                          className={cn(
                            "font-medium",
                            isRejected && "line-through text-txt-secondary"
                          )}
                        >
                          {det.text.length > 60 ? det.text.slice(0, 60) + "..." : det.text}
                        </span>
                      </td>

                      {/* Type */}
                      <td className="px-2 py-2">
                        <span className={cn("badge text-[10px]", typeConf?.color ?? "bg-gray-100 text-gray-700")}>
                          {typeConf?.label ?? det.type}
                        </span>
                      </td>

                      {/* Confidence */}
                      <td className="px-2 py-2 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <span
                            className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              confDotClass(det.confidence)
                            )}
                          />
                          <span
                            className={cn("font-mono font-medium", confTextClass(det.confidence))}
                          >
                            {det.confidence}%
                          </span>
                        </div>
                      </td>

                      {/* Page */}
                      <td className="px-2 py-2 text-txt-secondary">p.{det.page}</td>

                      {/* Ground */}
                      <td className="px-2 py-2">
                        <span className="font-mono text-[10px] text-txt-secondary">
                          {groundLabel(state?.appliedGround ?? det.suggestedGround)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-2 py-2">
                        {isAccepted && (
                          <span className="badge bg-green-50 text-green-700 text-[10px]">
                            <Check size={10} /> Accepted
                          </span>
                        )}
                        {isRejected && (
                          <span className="badge bg-red-50 text-red-600 text-[10px]">
                            <X size={10} /> Rejected
                          </span>
                        )}
                        {!isAccepted && !isRejected && (
                          <span className="badge bg-amber-50 text-amber-700 text-[10px]">
                            <AlertCircle size={10} /> Pending
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="pr-4 pl-2 py-2">
                        <div
                          className="flex items-center gap-1 justify-end relative"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isAccepted || isRejected ? (
                            <button
                              onClick={() => handleRevert(det.id)}
                              className="btn-ghost text-[10px] px-2 py-1"
                              title="Revert to pending"
                            >
                              Undo
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => handleAccept(det.id)}
                                className="flex items-center gap-0.5 px-2 py-1 rounded-input text-[10px] font-medium bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                                title="Accept detection and apply redaction"
                              >
                                <Check size={11} />
                                Accept
                              </button>
                              <button
                                onClick={() => handleReject(det.id)}
                                className="flex items-center gap-0.5 px-2 py-1 rounded-input text-[10px] font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                                title="Reject detection -- do not redact"
                              >
                                <X size={11} />
                                Reject
                              </button>
                            </>
                          )}

                          {/* Inline ground selector */}
                          {groundSelectorId === det.id && (
                            <GroundSelector
                              detectionId={det.id}
                              suggestedGround={det.suggestedGround}
                              appliedGround={detectionStates[det.id]?.appliedGround}
                              onSelect={handleGroundSelect}
                              onClose={() => setGroundSelectorId(null)}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredDetections.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-txt-secondary text-sm">
                      No detections in this category.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ===== Submitting / Success overlay ===== */}
      {(isSubmitting || showSubmitSuccess) && (
        <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-card shadow-xl px-8 py-6 text-center max-w-sm">
            {isSubmitting ? (
              <>
                <div className="w-10 h-10 border-3 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <div className="text-sm font-semibold text-txt-primary">Submitting to Senior Review...</div>
                <div className="text-xs text-txt-secondary mt-1">Recording decisions in audit trail</div>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3">
                  <Check className="w-6 h-6 text-confidence-high" />
                </div>
                <div className="text-sm font-semibold text-txt-primary">Submitted Successfully</div>
                <div className="text-xs text-txt-secondary mt-1">Document forwarded to senior reviewer. Redirecting to withholding schedule...</div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== AI Explanation Popover (when a detection is selected) ===== */}
      {selectedDetectionId && (() => {
        const det = detectionById.get(selectedDetectionId);
        if (!det) return null;
        const state = detectionStates[det.id];
        const typeConf = detectionTypeConfig[det.type as keyof typeof detectionTypeConfig];
        return (
          <div className="fixed bottom-[290px] right-6 w-80 bg-surface-card border border-border rounded-card shadow-lg p-4 z-40">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <AlertCircle size={13} className="text-brand-primary" />
                <span className="text-xs font-semibold text-txt-primary">AI Explanation</span>
              </div>
              <button
                onClick={() => setSelectedDetectionId(null)}
                className="text-txt-secondary hover:text-txt-primary"
              >
                <X size={13} />
              </button>
            </div>
            <div className="mb-2">
              <span className={cn("badge text-[10px]", typeConf?.color ?? "bg-gray-100 text-gray-700")}>
                {typeConf?.label ?? det.type}
              </span>
              <span className={cn("ml-2 text-[11px] font-mono font-medium", confTextClass(det.confidence))}>
                {det.confidence}% confidence
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-txt-secondary mb-3">
              {det.aiExplanation}
            </p>
            {det.suggestedGround && (
              <div className="text-[10px] text-txt-secondary border-t border-border pt-2">
                <span className="uppercase tracking-wider font-semibold">Suggested ground: </span>
                <span className="font-mono text-brand-primary">
                  {groundLabel(det.suggestedGround)}
                </span>
              </div>
            )}
            {/* Change History (WP12) */}
            <div className="border-t border-border mt-2 pt-2">
              <button
                onClick={() => setHistoryOpen((v) => !v)}
                className="flex items-center gap-1 text-[10px] text-txt-secondary hover:text-txt-primary transition-colors w-full"
              >
                <History size={11} />
                <span className="uppercase tracking-wider font-semibold">Change History</span>
                <ChevronRight size={10} className={cn("ml-auto transition-transform", historyOpen && "rotate-90")} />
              </button>
              {historyOpen && (
                <div className="mt-1.5 max-h-32 overflow-y-auto">
                  {historyLoading ? (
                    <p className="text-[10px] text-txt-secondary py-1">Loading...</p>
                  ) : historyData.length === 0 ? (
                    <p className="text-[10px] text-txt-secondary py-1">No changes recorded yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {historyData.map((h) => (
                        <div key={h.id} className="flex items-start gap-1.5 text-[10px]">
                          <Clock size={9} className="text-txt-secondary mt-0.5 shrink-0" />
                          <div>
                            <span className="font-medium text-txt-primary">{h.changedBy}</span>
                            <span className="text-txt-secondary"> changed </span>
                            <span className="font-mono text-brand-primary">{h.field}</span>
                            {h.previousValue && (
                              <span className="text-txt-secondary"> from <span className="line-through">{h.previousValue}</span></span>
                            )}
                            <span className="text-txt-secondary"> to <span className="font-medium">{h.newValue ?? "none"}</span></span>
                            <div className="text-txt-secondary/60 text-[9px]">
                              {new Date(h.changedAt).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
