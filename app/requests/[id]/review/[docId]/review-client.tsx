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
  EyeOff,
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
  changeDetectionType,
  acceptRemainingDetections,
  submitForSeniorReview,
  signOffDocument,
  requestChanges,
} from "@/lib/actions/detection-actions";
import { getDefaultGroundForType } from "@/lib/detection-type-grounds";
import { createManualDetection, deleteManualDetection } from "@/lib/actions/manual-detection-actions";
import ManualDetectionPopover from "@/components/review/manual-detection-popover";
import AILearningPanel from "@/components/review/ai-learning-panel";
import dynamic from "next/dynamic";

const PdfViewer = dynamic(() => import("@/components/review/pdf-viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-3 border-brand-primary border-t-transparent rounded-full animate-spin" />
      <span className="ml-3 text-sm text-txt-secondary">Loading PDF viewer...</span>
    </div>
  ),
});
import { lgoimaGrounds } from "@/lib/lgoima-grounds";
import { cn } from "@/lib/utils";
import { compareDetectionsByPosition } from "@/lib/review/sort-detections";
import {
  type DetectionHistoryEntry,
  formatFieldChange,
  relativeTime,
} from "@/lib/data/detection-history";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type TabFilter = "all" | "personal" | "commercial" | "other";

interface DetectionState {
  status: DetectionStatus;
  appliedGround: string | null;
  type: string;
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
  source: string;
}

export interface ReviewClientProps {
  requestId: string;
  caseId: string;
  docId: string;
  docName: string;
  docStatus: string;
  documentContent: DocParagraph[];
  header: { title: string; subtitle: string; date: string };
  detections: Detection[];
  documentIds: string[];
  currentDocIndex: number;
  canonicalPdfPath?: string;
  canonicalPdfTextSelectable?: boolean;
  pdfUrl?: string;
  viewerMode: "html" | "pdf";
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
  const s6Grounds = lgoimaGrounds.filter((g) => g.section === "s6");
  const s7Grounds = lgoimaGrounds.filter((g) => g.section === "s7");
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
      <div className="space-y-0.5 max-h-72 overflow-y-auto">
        {/* Section 6 — Conclusive */}
        <div className="px-2 pt-2 pb-1">
          <span className="text-[9px] font-bold text-txt-secondary uppercase tracking-widest">
            Section 6 — Conclusive
          </span>
        </div>
        {s6Grounds.map((g) => (
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
            <span className="font-mono text-[10px] text-txt-secondary w-24 shrink-0 whitespace-nowrap">
              {g.reference}
            </span>
            <span className="truncate">{g.label}</span>
            {g.common && (
              <span className="w-1.5 h-1.5 rounded-full bg-brand-primary/50 shrink-0" title="Commonly used" />
            )}
            {suggestedGround === g.id && (
              <Star size={10} className="text-amber-500 ml-auto shrink-0" />
            )}
            {appliedGround === g.id && (
              <Check size={10} className="text-brand-primary ml-auto shrink-0" />
            )}
          </button>
        ))}
        {/* Section 7 — Public interest test */}
        <div className="px-2 pt-3 pb-1">
          <span className="text-[9px] font-bold text-txt-secondary uppercase tracking-widest">
            Section 7 — Public interest test required
          </span>
        </div>
        {s7Grounds.map((g) => (
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
            <span className="font-mono text-[10px] text-txt-secondary w-24 shrink-0 whitespace-nowrap">
              {g.reference}
            </span>
            <span className="truncate">{g.label}</span>
            {g.common && (
              <span className="w-1.5 h-1.5 rounded-full bg-brand-primary/50 shrink-0" title="Commonly used" />
            )}
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
/*  Type selector (inline)                                                     */
/* -------------------------------------------------------------------------- */

function TypeSelector({
  detectionId,
  currentType,
  onSelect,
  onClose,
}: {
  detectionId: string;
  currentType: string;
  onSelect: (detectionId: string, newType: string) => void;
  onClose: () => void;
}) {
  const types = Object.entries(detectionTypeConfig) as [string, { label: string; color: string }][];
  return (
    <div className="absolute z-50 left-0 top-full mt-1 w-56 bg-surface-card border border-border rounded-card shadow-lg p-2">
      <div className="flex items-center justify-between mb-1.5 px-1">
        <span className="text-[10px] font-semibold text-txt-primary uppercase tracking-wide">
          Change Type
        </span>
        <button onClick={onClose} className="text-txt-secondary hover:text-txt-primary">
          <X size={12} />
        </button>
      </div>
      <div className="space-y-0.5 max-h-64 overflow-y-auto">
        {types.map(([key, conf]) => (
          <button
            key={key}
            onClick={() => {
              onSelect(detectionId, key);
              onClose();
            }}
            className={cn(
              "w-full text-left px-2 py-1.5 rounded-input text-xs hover:bg-surface-hover transition-colors flex items-center gap-2",
              currentType === key && "bg-brand-primary/10 font-medium"
            )}
          >
            <span className={cn("badge text-[9px] px-1.5 py-0.5", conf.color)}>
              {conf.label}
            </span>
            {currentType === key && (
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
  caseId,
  docId,
  docName,
  docStatus: initialDocStatus,
  documentContent,
  header,
  detections,
  documentIds,
  currentDocIndex,
  canonicalPdfPath,
  pdfUrl,
  viewerMode,
}: ReviewClientProps) {
  // Slice A routing: the pdf.js viewer is reached only when the admin
  // flag is flipped AND a canonical PDF exists. Default viewerMode is
  // "html" per lib/data/settings, so reviewers continue to see the HTML
  // reconstruction branch. Slice D flips the default.
  const showPdf = viewerMode === "pdf" && !!canonicalPdfPath;
  const router = useRouter();

  // ----- State (initialised from DB data via props) -----
  const [detectionStates, setDetectionStates] = useState<Record<string, DetectionState>>(() => {
    const init: Record<string, DetectionState> = {};
    for (const d of detections) {
      init[d.id] = { status: d.status as DetectionStatus, appliedGround: d.appliedGround, type: d.type };
    }
    return init;
  });

  // Sync new detections into state when props update (e.g. after router.refresh)
  useEffect(() => {
    setDetectionStates((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const d of detections) {
        if (!next[d.id]) {
          next[d.id] = { status: d.status as DetectionStatus, appliedGround: d.appliedGround, type: d.type };
          changed = true;
        }
      }
      // Remove detections that no longer exist (e.g. deleted manual detection)
      for (const id of Object.keys(next)) {
        if (!detections.some((d) => d.id === id)) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [detections]);

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
  const [showOriginal, setShowOriginal] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyData, setHistoryData] = useState<DetectionHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Type selector state
  const [typeSelectorId, setTypeSelectorId] = useState<string | null>(null);

  // Accept remaining state
  const [showAcceptRemainingConfirm, setShowAcceptRemainingConfirm] = useState(false);
  const [acceptRemainingAlert, setAcceptRemainingAlert] = useState<{ skipped: number; texts: string[] } | null>(null);

  // Confidence popover for table badge
  const [confidencePopoverId, setConfidencePopoverId] = useState<string | null>(null);

  // Keyboard shortcuts hint panel
  const [showKeyboardHints, setShowKeyboardHints] = useState(false);

  // Screen reader status announcements
  const [statusAnnouncement, setStatusAnnouncement] = useState("");

  // Manual detection state (WP22)
  const [manualPopover, setManualPopover] = useState<{
    text: string;
    page: number;
    position: { x: number; y: number };
  } | null>(null);
  const [aiLearningDetection, setAiLearningDetection] = useState<{
    id: string;
    text: string;
  } | null>(null);

  // Refs for scrolling
  const [panelHeight, setPanelHeight] = useState(280);
  const panelDragRef = useRef<{ startY: number; startH: number } | null>(null);

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

  // Reset history and confidence popover when detection selection changes
  useEffect(() => {
    setHistoryOpen(false);
    setConfidencePopoverId(null);
  }, [selectedDetectionId]);

  // ----- Panel resize drag handling -----
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!panelDragRef.current) return;
      const delta = panelDragRef.current.startY - e.clientY;
      const newH = Math.max(120, Math.min(window.innerHeight * 0.7, panelDragRef.current.startH + delta));
      setPanelHeight(newH);
    };
    const onMouseUp = () => {
      panelDragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    panelDragRef.current = { startY: e.clientY, startH: panelHeight };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, [panelHeight]);

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

  // Sort filtered detections by document position (top → bottom).
  // Slice B switched from walking `documentContent` (the HTML-branch
  // paragraph tree) to a direct comparator shared with unit tests via
  // `lib/review/sort-detections`. See that file for the rationale.
  const sortedDetections = useMemo(() => {
    return [...filteredDetections].sort(compareDetectionsByPosition);
  }, [filteredDetections]);

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

  // ----- Text selection handler for manual detection (WP22) -----
  const handleTextSelection = useCallback((e: React.MouseEvent) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) return;

    const selectedText = selection.toString().trim();
    if (selectedText.length < 2) return;

    // Walk up from anchor node to find the paragraph with a data-page attribute
    const findPage = (n: Node | null): number | null => {
      while (n) {
        if (n instanceof HTMLElement && n.dataset.page) {
          return parseInt(n.dataset.page, 10);
        }
        n = n.parentNode;
      }
      return null;
    };

    const anchorPage = findPage(selection.anchorNode);
    const focusPage = findPage(selection.focusNode);

    // Reject cross-page selections — detection must belong to a single page
    if (anchorPage === null || focusPage === null || anchorPage !== focusPage) {
      return;
    }

    setManualPopover({
      text: selectedText,
      page: anchorPage,
      position: { x: e.clientX, y: e.clientY },
    });
  }, []);

  const handleManualDetectionSubmit = useCallback(
    async (data: { text: string; type: string; page: number; ground?: string; reasoning?: string }) => {
      try {
        const result = await createManualDetection({
          documentId: docId,
          ...data,
        });
        setManualPopover(null);
        window.getSelection()?.removeAllRanges();
        // Show AI learning panel
        if (result.detectionId) {
          setAiLearningDetection({ id: result.detectionId, text: data.text });
        }
        // Refresh page to show new detection
        router.refresh();
      } catch (err) {
        console.error("Failed to create manual detection:", err);
      }
    },
    [docId, router],
  );

  const handleDeleteManualDetection = useCallback(
    async (detectionId: string) => {
      try {
        await deleteManualDetection(detectionId);
        router.refresh();
      } catch (err) {
        console.error("Failed to delete manual detection:", err);
      }
    },
    [router],
  );

  // ----- Handle type change with auto-ground -----
  const handleTypeChange = useCallback(
    async (detectionId: string, newType: string) => {
      const state = detectionStates[detectionId];
      if (!state) return;

      const oldType = state.type;
      const oldDefaultGround = getDefaultGroundForType(oldType);
      const newDefaultGround = getDefaultGroundForType(newType);

      // Auto-update ground if it's empty or matches the old type's default
      const shouldAutoGround =
        !state.appliedGround || state.appliedGround === oldDefaultGround;
      const newGround = shouldAutoGround && newDefaultGround ? newDefaultGround : state.appliedGround;

      // Optimistic update
      setDetectionStates((prev) => ({
        ...prev,
        [detectionId]: { ...prev[detectionId], type: newType, appliedGround: newGround },
      }));
      setTypeSelectorId(null);

      try {
        await changeDetectionType(detectionId, newType);
        if (shouldAutoGround && newDefaultGround) {
          await applyGround(detectionId, newDefaultGround);
        }
      } catch {
        // Revert on error
        setDetectionStates((prev) => ({
          ...prev,
          [detectionId]: { ...prev[detectionId], type: oldType, appliedGround: state.appliedGround },
        }));
      }
    },
    [detectionStates],
  );

  // ----- Handle accept remaining -----
  const handleAcceptRemaining = useCallback(async () => {
    setShowAcceptRemainingConfirm(false);
    setAcceptRemainingAlert(null);

    // Save previous states for rollback
    const prevStates = { ...detectionStates };

    // Optimistic update: accept all pending, fill in grounds from suggested
    setDetectionStates((prev) => {
      const next = { ...prev };
      for (const d of detections) {
        const state = next[d.id];
        if (state?.status === "pending") {
          const ground = state.appliedGround || (d.suggestedGround ? d.suggestedGround : null);
          if (ground) {
            next[d.id] = { ...state, status: "accepted", appliedGround: ground };
          }
        }
      }
      return next;
    });

    try {
      const result = await acceptRemainingDetections(docId);
      if (result.skipped > 0) {
        const skippedTexts = detections
          .filter((d) => result.skippedIds.includes(d.id))
          .map((d) => d.text.length > 50 ? d.text.slice(0, 50) + "..." : d.text);
        setAcceptRemainingAlert({ skipped: result.skipped, texts: skippedTexts });

        // Revert skipped detections back to pending
        setDetectionStates((prev) => {
          const next = { ...prev };
          for (const id of result.skippedIds) {
            if (prevStates[id]) {
              next[id] = prevStates[id];
            }
          }
          return next;
        });

        // Scroll to first skipped detection
        if (result.skippedIds[0]) {
          const row = detectionRowRefs.current[result.skippedIds[0]];
          if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    } catch {
      // Revert all on error
      setDetectionStates(prevStates);
    }
  }, [detectionStates, detections, docId]);

  // ----- Focus management: move focus to next detection after action -----
  const focusNextDetection = useCallback(
    (currentId: string) => {
      const currentIdx = sortedDetections.findIndex((d) => d.id === currentId);
      if (currentIdx >= 0 && currentIdx < sortedDetections.length - 1) {
        const nextId = sortedDetections[currentIdx + 1].id;
        setSelectedDetectionId(nextId);
        // Focus the row after a brief delay to let React re-render
        setTimeout(() => {
          const row = detectionRowRefs.current[nextId];
          if (row) {
            row.focus();
            row.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }, 50);
        setStatusAnnouncement(
          `Moved to detection ${currentIdx + 2} of ${sortedDetections.length}`
        );
      }
    },
    [sortedDetections],
  );

  // ----- Wrap accept/reject to also advance focus -----
  const handleAcceptAndAdvance = useCallback(
    async (detectionId: string) => {
      await handleAccept(detectionId);
      setStatusAnnouncement("Detection redacted");
      focusNextDetection(detectionId);
    },
    [handleAccept, focusNextDetection],
  );

  const handleRejectAndAdvance = useCallback(
    async (detectionId: string) => {
      await handleReject(detectionId);
      setStatusAnnouncement("Detection rejected");
      focusNextDetection(detectionId);
    },
    [handleReject, focusNextDetection],
  );

  // ----- Global keyboard event handler for detection review -----
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore keyboard shortcuts when user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      switch (e.key) {
        case "?":
          e.preventDefault();
          setShowKeyboardHints((v) => !v);
          break;
        case "Escape":
          if (showKeyboardHints) {
            setShowKeyboardHints(false);
          } else if (selectedDetectionId) {
            setSelectedDetectionId(null);
            setGroundSelectorId(null);
            setStatusAnnouncement("Detection deselected");
          }
          break;
        case "a":
          if (selectedDetectionId) {
            const state = detectionStates[selectedDetectionId];
            if (state?.status === "pending") {
              e.preventDefault();
              handleAcceptAndAdvance(selectedDetectionId);
            }
          }
          break;
        case "r":
          if (selectedDetectionId) {
            const state = detectionStates[selectedDetectionId];
            if (state?.status === "pending") {
              e.preventDefault();
              handleRejectAndAdvance(selectedDetectionId);
            }
          }
          break;
        case "ArrowDown": {
          e.preventDefault();
          const currentIdx = selectedDetectionId
            ? sortedDetections.findIndex((d) => d.id === selectedDetectionId)
            : -1;
          const nextIdx = Math.min(currentIdx + 1, sortedDetections.length - 1);
          if (sortedDetections[nextIdx]) {
            const nextId = sortedDetections[nextIdx].id;
            setSelectedDetectionId(nextId);
            const row = detectionRowRefs.current[nextId];
            if (row) {
              row.focus();
              row.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            const el = redactionRefs.current[nextId];
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const currentIdx = selectedDetectionId
            ? sortedDetections.findIndex((d) => d.id === selectedDetectionId)
            : sortedDetections.length;
          const prevIdx = Math.max(currentIdx - 1, 0);
          if (sortedDetections[prevIdx]) {
            const prevId = sortedDetections[prevIdx].id;
            setSelectedDetectionId(prevId);
            const row = detectionRowRefs.current[prevId];
            if (row) {
              row.focus();
              row.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            const el = redactionRefs.current[prevId];
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          break;
        }
        case "Enter":
        case " ":
          if (selectedDetectionId && (e.target as HTMLElement)?.tagName?.toLowerCase() !== "button") {
            e.preventDefault();
            handleDetectionClick(selectedDetectionId);
          }
          break;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedDetectionId,
    sortedDetections,
    detectionStates,
    showKeyboardHints,
    handleAcceptAndAdvance,
    handleRejectAndAdvance,
    handleDetectionClick,
  ]);

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

  function confBarColor(score: number): string {
    if (score >= 90) return "bg-confidence-high";
    if (score >= 75) return "bg-confidence-medium";
    if (score >= 50) return "bg-amber-400";
    return "bg-confidence-low";
  }

  function confLabel(score: number): string {
    if (score >= 90) return "Very High";
    if (score >= 75) return "High";
    if (score >= 50) return "Medium";
    return "Low";
  }

  function sourceLabel(source: string): string {
    switch (source) {
      case "ai":
        return "AI Detection";
      case "pattern":
        return "Pattern Match";
      case "manual":
        return "Manual Entry";
      case "custom-rule":
        return "Custom Rule";
      default:
        return source;
    }
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

  /** Render segments with original-view state-based highlights (shared by all block types) */
  function renderOriginalSegments(segments: DocParagraph["segments"]) {
    return segments.map((seg, si) => {
      if (!seg.detectionId) return <span key={si}>{seg.text}</span>;

      const det = detectionById.get(seg.detectionId);
      if (!det) return <span key={si}>{seg.text}</span>;

      const state = detectionStates[det.id];
      const isSelected = selectedDetectionId === det.id;
      const isRejected = state?.status === "rejected";
      const isAccepted = state?.status === "accepted";

      return (
        <span
          key={si}
          onClick={() => handleHighlightClick(det.id)}
          className={cn(
            "relative cursor-pointer inline rounded-sm px-0.5 -mx-0.5 border transition-all duration-150",
            isRejected
              ? "bg-emerald-100/70 border-emerald-300"
              : isAccepted
              ? "bg-red-200/70 border-red-400"
              : "bg-amber-200/70 border-amber-300",
            isSelected && "ring-2 ring-brand-primary ring-offset-1"
          )}
          title={
            isRejected
              ? "Cleared — will not be redacted"
              : isAccepted
              ? `Redacted — ${groundLabel(state?.appliedGround ?? null)}`
              : `Pending review — ${det.confidence}% confidence`
          }
        >
          {seg.text}
        </span>
      );
    });
  }

  /** Render segments with redacted-view highlights (shared by all block types) */
  function renderRedactedSegments(segments: DocParagraph["segments"]) {
    return segments.map((seg, si) => {
      if (!seg.detectionId) return <span key={si}>{seg.text}</span>;

      const det = detectionById.get(seg.detectionId);
      if (!det) return <span key={si}>{seg.text}</span>;

      const state = detectionStates[det.id];
      const isSelected = selectedDetectionId === det.id;
      const isRejected = state?.status === "rejected";
      const isAccepted = state?.status === "accepted";
      const appliedGround = state?.appliedGround;

      if (isRejected) {
        return (
          <span
            key={si}
            ref={(el) => { redactionRefs.current[det.id] = el; }}
            onClick={() => handleHighlightClick(det.id)}
            className="cursor-pointer"
          >
            {seg.text}
          </span>
        );
      }

      if (isAccepted) {
        const groundRef = appliedGround ? groundLabel(appliedGround) : null;
        return (
          <span
            key={si}
            ref={(el) => { redactionRefs.current[det.id] = el; }}
            onClick={() => handleHighlightClick(det.id)}
            className={cn(
              "relative cursor-pointer inline rounded-sm transition-all duration-150",
              isSelected && "ring-2 ring-brand-primary ring-offset-1"
            )}
            title={groundRef ? `Redacted — ${groundRef}` : "Redacted"}
          >
            <span
              className="bg-gray-900 text-transparent select-none px-0.5 rounded-[2px]"
              aria-hidden="true"
            >
              {seg.text}
            </span>
            {groundRef && (
              <span className="absolute -top-2.5 right-0 text-[8px] font-mono font-semibold text-gray-500 select-none whitespace-nowrap pointer-events-none">
                {groundRef}
              </span>
            )}
            <span className="sr-only">
              Redacted: {seg.text}{groundRef ? ` (${groundRef})` : ""}
            </span>
          </span>
        );
      }

      return (
        <span
          key={si}
          ref={(el) => { redactionRefs.current[det.id] = el; }}
          onClick={() => handleHighlightClick(det.id)}
          className={cn(
            "relative cursor-pointer inline rounded-sm px-0.5 -mx-0.5 border transition-all duration-150",
            "bg-amber-200/70 border-amber-300",
            isSelected && "ring-2 ring-brand-primary ring-offset-1"
          )}
          title={`Pending review — ${det.confidence}% confidence`}
        >
          {seg.text}
        </span>
      );
    });
  }

  /** Map heading level to the appropriate HTML element and styling */
  function renderHeadingTag(level: number | undefined, children: React.ReactNode) {
    const lvl = level ?? 2;
    const baseClass = "font-heading font-bold text-txt-primary leading-snug";
    switch (lvl) {
      case 2: return <h2 className={`${baseClass} text-base mt-6 mb-2`}>{children}</h2>;
      case 3: return <h3 className={`${baseClass} text-sm mt-5 mb-1.5`}>{children}</h3>;
      case 4: return <h4 className={`${baseClass} text-[13px] mt-4 mb-1`}>{children}</h4>;
      case 5: return <h5 className={`${baseClass} text-xs mt-3 mb-1`}>{children}</h5>;
      case 6: return <h6 className={`${baseClass} text-xs mt-3 mb-0.5 text-txt-secondary`}>{children}</h6>;
      default: return <h3 className={`${baseClass} text-sm mt-5 mb-1.5`}>{children}</h3>;
    }
  }

  /** Render a paragraph — original view with state-based highlights */
  function renderOriginalParagraph(para: DocParagraph, idx: number) {
    const blockType = para.type ?? (para.heading ? "heading" : "paragraph");

    switch (blockType) {
      case "heading":
        return (
          <div key={idx} className="mt-5" data-page={para.page ?? 1}>
            {renderHeadingTag(para.level, renderOriginalSegments(para.segments))}
          </div>
        );

      case "list":
        return (
          <div key={idx} className="mt-3" data-page={para.page ?? 1}>
            {para.listStyle === "number" ? (
              <ol className="list-decimal list-outside ml-5 text-[11.5px] leading-[1.7] text-txt-primary/90 space-y-0.5">
                {(para.items ?? []).map((item, li) => (
                  <li key={li}>{renderOriginalSegments(item.segments)}</li>
                ))}
              </ol>
            ) : (
              <ul className="list-disc list-outside ml-5 text-[11.5px] leading-[1.7] text-txt-primary/90 space-y-0.5">
                {(para.items ?? []).map((item, li) => (
                  <li key={li}>{renderOriginalSegments(item.segments)}</li>
                ))}
              </ul>
            )}
          </div>
        );

      case "image":
        return (
          <div
            key={idx}
            className="mt-3 flex items-center justify-center rounded border border-dashed border-gray-300 bg-gray-50 py-6 px-4"
            data-page={para.page ?? 1}
          >
            <span className="text-xs text-gray-400 italic">
              {para.segments[0]?.text || "[Embedded image]"}
            </span>
          </div>
        );

      case "table": {
        // Defensive: if rows is missing, fall back to paragraph rendering
        if (!para.rows || para.rows.length === 0) {
          return (
            <div key={idx} className="mt-3" data-page={para.page ?? 1}>
              <p className="text-[11.5px] leading-[1.7] text-txt-primary/90 whitespace-pre-line">
                {renderOriginalSegments(para.segments)}
              </p>
            </div>
          );
        }

        const headerRow = para.rows[0];
        const bodyRows = para.rows.slice(1);

        return (
          <div key={idx} className="mt-3 overflow-x-auto" data-page={para.page ?? 1}>
            <table className="w-full text-[11px] leading-[1.6] border-collapse border border-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  {headerRow.cells.map((cell, ci) => (
                    <th
                      key={ci}
                      className="border border-gray-200 px-2 py-1.5 text-left font-semibold text-txt-primary/90"
                    >
                      {cell.segments.length > 0 ? renderOriginalSegments(cell.segments) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              {bodyRows.length > 0 && (
                <tbody>
                  {bodyRows.map((row, ri) => (
                    <tr key={ri} className={ri % 2 === 1 ? "bg-gray-50/50" : ""}>
                      {row.cells.map((cell, ci) => (
                        <td
                          key={ci}
                          className="border border-gray-200 px-2 py-1 text-txt-primary/90"
                        >
                          {cell.segments.length > 0 ? renderOriginalSegments(cell.segments) : null}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        );
      }

      default: {
        // "paragraph" or legacy format (no type field)
        return (
          <div key={idx} className={para.heading ? "mt-5" : "mt-3"} data-page={para.page ?? 1}>
            {para.heading && (
              <h3 className="font-heading text-sm font-bold text-txt-primary mb-1 leading-snug">
                {para.heading}
              </h3>
            )}
            <p className="text-[11.5px] leading-[1.7] text-txt-primary/90 whitespace-pre-line">
              {renderOriginalSegments(para.segments)}
            </p>
          </div>
        );
      }
    }
  }

  /** Render a paragraph — redacted view with highlights */
  function renderRedactedParagraph(para: DocParagraph, idx: number) {
    const blockType = para.type ?? (para.heading ? "heading" : "paragraph");

    switch (blockType) {
      case "heading":
        return (
          <div key={idx} className="mt-5" data-page={para.page ?? 1}>
            {renderHeadingTag(para.level, renderRedactedSegments(para.segments))}
          </div>
        );

      case "list":
        return (
          <div key={idx} className="mt-3" data-page={para.page ?? 1}>
            {para.listStyle === "number" ? (
              <ol className="list-decimal list-outside ml-5 text-[11.5px] leading-[1.7] text-txt-primary/90 space-y-0.5">
                {(para.items ?? []).map((item, li) => (
                  <li key={li}>{renderRedactedSegments(item.segments)}</li>
                ))}
              </ol>
            ) : (
              <ul className="list-disc list-outside ml-5 text-[11.5px] leading-[1.7] text-txt-primary/90 space-y-0.5">
                {(para.items ?? []).map((item, li) => (
                  <li key={li}>{renderRedactedSegments(item.segments)}</li>
                ))}
              </ul>
            )}
          </div>
        );

      case "image":
        return (
          <div
            key={idx}
            className="mt-3 flex items-center justify-center rounded border border-dashed border-gray-300 bg-gray-50 py-6 px-4"
            data-page={para.page ?? 1}
          >
            <span className="text-xs text-gray-400 italic">
              {para.segments[0]?.text || "[Embedded image]"}
            </span>
          </div>
        );

      case "table": {
        // Defensive: if rows is missing, fall back to paragraph rendering
        if (!para.rows || para.rows.length === 0) {
          return (
            <div key={idx} className="mt-3" data-page={para.page ?? 1}>
              <p className="text-[11.5px] leading-[1.7] text-txt-primary/90 whitespace-pre-line">
                {renderRedactedSegments(para.segments)}
              </p>
            </div>
          );
        }

        const headerRow = para.rows[0];
        const bodyRows = para.rows.slice(1);

        return (
          <div key={idx} className="mt-3 overflow-x-auto" data-page={para.page ?? 1}>
            <table className="w-full text-[11px] leading-[1.6] border-collapse border border-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  {headerRow.cells.map((cell, ci) => (
                    <th
                      key={ci}
                      className="border border-gray-200 px-2 py-1.5 text-left font-semibold text-txt-primary/90"
                    >
                      {cell.segments.length > 0 ? renderRedactedSegments(cell.segments) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              {bodyRows.length > 0 && (
                <tbody>
                  {bodyRows.map((row, ri) => (
                    <tr key={ri} className={ri % 2 === 1 ? "bg-gray-50/50" : ""}>
                      {row.cells.map((cell, ci) => (
                        <td
                          key={ci}
                          className="border border-gray-200 px-2 py-1 text-txt-primary/90"
                        >
                          {cell.segments.length > 0 ? renderRedactedSegments(cell.segments) : null}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        );
      }

      default: {
        // "paragraph" or legacy format (no type field)
        return (
          <div key={idx} className={para.heading ? "mt-5" : "mt-3"} data-page={para.page ?? 1}>
            {para.heading && (
              <h3 className="font-heading text-sm font-bold text-txt-primary mb-1 leading-snug">
                {para.heading}
              </h3>
            )}
            <p className="text-[11.5px] leading-[1.7] text-txt-primary/90 whitespace-pre-line">
              {renderRedactedSegments(para.segments)}
            </p>
          </div>
        );
      }
    }
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

        {/* Right: toggle + stats + submit */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Hide/Show Original toggle */}
          <button
            onClick={() => setShowOriginal((v) => !v)}
            className="btn-ghost flex items-center gap-1 text-xs shrink-0"
          >
            {showOriginal ? <EyeOff size={13} /> : <Eye size={13} />}
            <span className="hidden md:inline">{showOriginal ? "Hide Original" : "Show Original"}</span>
          </button>
          <div className="h-5 w-px bg-border shrink-0" />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* Mini progress */}
          <div className="hidden lg:flex items-center gap-2.5 text-[11px] text-txt-secondary">
            <span className="flex items-center gap-1" title="Redacted">
              <span className="w-2 h-2 rounded-sm bg-gray-900 inline-block" />
              {stats.accepted}
            </span>
            <span className="flex items-center gap-1" title="Cleared">
              <span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block" />
              {stats.rejected}
            </span>
            <span className="flex items-center gap-1" title="Pending">
              <span className="w-2 h-2 rounded-sm bg-amber-400 inline-block" />
              {stats.pending}
            </span>
          </div>
          {/* Accept Remaining */}
          {stats.pending > 0 && (docStatus === "in-review" || docStatus === "ready") && (
            <div className="relative">
              <button
                onClick={() => setShowAcceptRemainingConfirm((v) => !v)}
                className="btn-ghost flex items-center gap-1 text-xs border border-brand-primary/30 text-brand-primary hover:bg-brand-primary/5"
              >
                <Check size={13} />
                <span className="hidden sm:inline">Accept Remaining</span>
                <span className="px-1.5 py-0.5 rounded-full bg-brand-primary/10 text-[10px] font-semibold">
                  {stats.pending}
                </span>
              </button>
              {showAcceptRemainingConfirm && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-surface-card border border-border rounded-card shadow-lg p-4 z-50">
                  <div className="flex items-start gap-2 mb-3">
                    <Shield size={16} className="text-brand-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-txt-primary">Accept Remaining</p>
                      <p className="text-xs text-txt-secondary mt-1">
                        Accept all {stats.pending} remaining pending detection(s) with their current grounds?
                        Detections without an assigned ground will use the AI-suggested ground.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowAcceptRemainingConfirm(false)} className="btn-ghost text-xs">
                      Cancel
                    </button>
                    <button
                      onClick={handleAcceptRemaining}
                      className="btn-primary text-xs"
                    >
                      Accept All
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="h-5 w-px bg-border shrink-0" />
          {/* Status-aware action buttons */}
          {(docStatus === "in-review" || docStatus === "ready") && (
            <div className="relative">
              <button
                onClick={() => setShowSubmitConfirm((v) => !v)}
                className="btn-primary flex items-center gap-1.5"
                disabled={isSubmitting}
              >
                <Send size={14} />
                <span className="hidden sm:inline">Sign Off</span>
              </button>
              {showSubmitConfirm && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-surface-card border border-border rounded-card shadow-lg p-4 z-50">
                  <div className="flex items-start gap-2 mb-3">
                    <Shield size={16} className="text-brand-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-txt-primary">Confirm Submission</p>
                      <p className="text-xs text-txt-secondary mt-1">
                        {stats.pending > 0
                          ? `${stats.pending} detection(s) are still pending review. Are you sure you want to sign off?`
                          : "All detections reviewed. Ready to sign off."}
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
                Signed Off — Awaiting Final Approval
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
                  <span className="hidden sm:inline">Final Approval</span>
                </button>
                {showSignOffConfirm && (
                  <div className="absolute right-0 top-full mt-2 w-72 bg-surface-card border border-border rounded-card shadow-lg p-4 z-50">
                    <div className="flex items-start gap-2 mb-3">
                      <Shield size={16} className="text-green-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-txt-primary">Confirm Final Approval</p>
                        <p className="text-xs text-txt-secondary mt-1">
                          This gives final approval for all redaction decisions on this document. This action will be recorded in the audit trail.
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
                        Confirm Approval
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

      {/* ===== Accept Remaining alert banner ===== */}
      {acceptRemainingAlert && (
        <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-5 py-2 flex items-start gap-2">
          <AlertCircle size={14} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-xs text-amber-800 font-medium">
              {acceptRemainingAlert.skipped} detection(s) skipped — no ground assigned or suggested
            </p>
            <p className="text-[10px] text-amber-700 mt-0.5">
              {acceptRemainingAlert.texts.join(", ")}
            </p>
          </div>
          <button
            onClick={() => setAcceptRemainingAlert(null)}
            className="text-amber-600 hover:text-amber-800 shrink-0"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ===== MAIN CONTENT: Split Panels + Bottom Detection Table ===== */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* --- Document Panels (single scroll container) --- */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="flex min-h-full review-split-pane">
            {showPdf && pdfUrl ? (
              /* ===== PDF MODE: single panel with detection overlays ===== */
              <div className="w-full h-full">
                <PdfViewer
                  fileUrl={pdfUrl}
                  detections={detections}
                  selectedDetectionId={selectedDetectionId}
                  onDetectionClick={handleHighlightClick}
                  detectionStates={detectionStates}
                />
              </div>
            ) : (
              /* ===== HTML MODE: original + redacted split panels ===== */
              <>
                {/* LEFT PANEL -- Original Document (hideable) */}
                {showOriginal && (
                  <div className="w-1/2 border-r border-border">
                    <div className="sticky top-0 z-10 px-4 py-2 border-b border-border bg-surface-card flex items-center gap-2">
                      <Eye size={13} className="text-txt-secondary" />
                      <span className="text-xs font-semibold text-txt-secondary uppercase tracking-wider">
                        Original Document
                      </span>
                      <span className="ml-auto flex items-center gap-3 text-[10px] text-txt-secondary" aria-label="Detection status legend">
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-sm bg-amber-300 inline-block" aria-hidden="true" />
                          Pending
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-sm bg-red-300 inline-block" aria-hidden="true" />
                          Redacted
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-200 inline-block border border-emerald-300" aria-hidden="true" />
                          Cleared
                        </span>
                      </span>
                    </div>
                    <div className="max-w-[640px] mx-auto px-8 py-6">
                      <div className="bg-white border border-gray-200 rounded shadow-sm px-10 py-8 min-h-[600px]">
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
                )}

                {/* RIGHT PANEL -- Redacted View */}
                <div className={showOriginal ? "w-1/2" : "w-full"} onMouseUp={handleTextSelection}>
                  <div className="sticky top-0 z-10 px-4 py-2 border-b border-border bg-surface-card flex items-center gap-2">
                    <Edit size={13} className="text-brand-primary" />
                    <span className="text-xs font-semibold text-brand-primary uppercase tracking-wider">
                      Redacted View
                    </span>
                    <span className="ml-auto flex items-center gap-3 text-[10px] text-txt-secondary" aria-label="Detection status legend">
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-sm bg-amber-300 inline-block" aria-hidden="true" />
                        Pending
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-sm bg-gray-900 inline-block" aria-hidden="true" />
                        Redacted
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-sm bg-emerald-200 inline-block border border-emerald-300" aria-hidden="true" />
                        Cleared
                      </span>
                    </span>
                  </div>
                  <div className={cn("mx-auto px-8 py-6", showOriginal ? "max-w-[640px]" : "max-w-[800px]")}>
                    <div className="bg-white border border-gray-200 rounded shadow-sm px-10 py-8 min-h-[600px]">
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
              </>
            )}
          </div>
        </div>

        {/* --- Resize Handle --- */}
        <div
          onMouseDown={onResizeStart}
          className="shrink-0 h-1.5 border-t border-border bg-surface-card cursor-row-resize hover:bg-brand-primary/10 active:bg-brand-primary/20 transition-colors flex items-center justify-center"
        >
          <div className="w-8 h-0.5 rounded-full bg-txt-secondary/30" />
        </div>

        {/* --- Bottom Detection Panel --- */}
        <div style={{ height: panelHeight }} className="shrink-0 border-t border-border bg-surface-card flex flex-col">
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
            <div className="ml-auto flex items-center gap-4 text-[11px] text-txt-secondary pr-1" role="status" aria-live="polite" aria-label="Detection review progress">
              <span>
                <span className="font-semibold text-gray-900">{stats.accepted}</span>{" "}
                redacted
              </span>
              <span>
                <span className="font-semibold text-emerald-600">{stats.rejected}</span>{" "}
                cleared
              </span>
              <span>
                <span className="font-semibold text-amber-600">{stats.pending}</span>{" "}
                pending
              </span>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto table-responsive">
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
              <tbody role="listbox" aria-label="Detections list">
                {sortedDetections.map((det, idx) => {
                  const state = detectionStates[det.id];
                  const isSelected = selectedDetectionId === det.id;
                  const isAccepted = state?.status === "accepted";
                  const isRejected = state?.status === "rejected";
                  const effectiveType = state?.type ?? det.type;
                  const typeConf = detectionTypeConfig[effectiveType as keyof typeof detectionTypeConfig];

                  return (
                    <tr
                      key={det.id}
                      ref={(el) => { detectionRowRefs.current[det.id] = el; }}
                      onClick={() => handleDetectionClick(det.id)}
                      tabIndex={0}
                      role="option"
                      aria-selected={isSelected}
                      aria-label={`Detection ${idx + 1}: ${det.text.length > 40 ? det.text.slice(0, 40) + "..." : det.text}, ${typeConf?.label ?? effectiveType}, ${det.confidence}% confidence, ${state?.status ?? "pending"}`}
                      className={cn(
                        "border-b border-border/50 cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-primary/60",
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
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "font-medium",
                              isRejected && "text-txt-secondary"
                            )}
                          >
                            {det.text.length > 60 ? det.text.slice(0, 60) + "..." : det.text}
                          </span>
                          {det.source === "manual" && (
                            <span className="badge bg-gray-100 text-gray-600 text-[9px] shrink-0">
                              Manual
                            </span>
                          )}
                          {det.source === "custom-rule" && (
                            <span className="badge bg-teal-50 text-teal-700 text-[9px] shrink-0">
                              Rule
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Type */}
                      <td className="px-2 py-2">
                        <div className="relative" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setTypeSelectorId(typeSelectorId === det.id ? null : det.id)}
                            className={cn(
                              "badge text-[10px] cursor-pointer hover:ring-1 hover:ring-brand-primary/30 transition-all",
                              typeConf?.color ?? "bg-gray-100 text-gray-700"
                            )}
                            title="Click to change type"
                          >
                            {typeConf?.label ?? effectiveType}
                          </button>
                          {typeSelectorId === det.id && (
                            <TypeSelector
                              detectionId={det.id}
                              currentType={effectiveType}
                              onSelect={handleTypeChange}
                              onClose={() => setTypeSelectorId(null)}
                            />
                          )}
                        </div>
                      </td>

                      {/* Confidence */}
                      <td className="px-2 py-2 text-center">
                        <div className="relative flex items-center justify-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfidencePopoverId(confidencePopoverId === det.id ? null : det.id);
                            }}
                            className={cn(
                              "flex items-center gap-1.5 px-1.5 py-0.5 rounded-input border transition-colors cursor-pointer",
                              confBgClass(det.confidence),
                              "hover:ring-1 hover:ring-brand-primary/30"
                            )}
                            aria-label={`${det.confidence}% confidence - ${confLabel(det.confidence)} - click for details`}
                            aria-expanded={confidencePopoverId === det.id}
                          >
                            <span
                              className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                confDotClass(det.confidence)
                              )}
                              aria-hidden="true"
                            />
                            <span
                              className={cn("font-mono font-medium text-[10px]", confTextClass(det.confidence))}
                            >
                              {det.confidence}%
                            </span>
                          </button>
                          {/* Confidence explainability popover */}
                          {confidencePopoverId === det.id && (
                            <div
                              className="absolute z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-72 bg-surface-card border border-border rounded-card shadow-lg p-3"
                              role="tooltip"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-semibold text-txt-primary uppercase tracking-wide">
                                  Confidence Details
                                </span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setConfidencePopoverId(null); }}
                                  className="text-txt-secondary hover:text-txt-primary"
                                  aria-label="Close confidence details"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                              {/* Confidence meter */}
                              <div className="mb-2">
                                <div className="flex items-center justify-between text-[10px] mb-1">
                                  <span className={cn("font-semibold", confTextClass(det.confidence))}>
                                    {confLabel(det.confidence)}
                                  </span>
                                  <span className="font-mono text-txt-secondary">{det.confidence}%</span>
                                </div>
                                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className={cn("h-full rounded-full transition-all", confBarColor(det.confidence))}
                                    style={{ width: `${det.confidence}%` }}
                                  />
                                </div>
                              </div>
                              {/* Source */}
                              <div className="flex items-center gap-1.5 mb-2 text-[10px]">
                                <span className="text-txt-secondary">Source:</span>
                                <span className="font-medium text-txt-primary">{sourceLabel(det.source)}</span>
                              </div>
                              {/* Reasoning */}
                              {det.source === "pattern" || det.source === "custom-rule" ? (
                                <p className="text-[10px] text-txt-secondary italic">
                                  Rule-based match — no AI reasoning available
                                </p>
                              ) : det.reasoning ? (
                                <div className="border-l-2 border-brand-primary/30 pl-2 mb-1">
                                  <p className="text-[10px] text-txt-secondary leading-relaxed">
                                    {det.reasoning}
                                  </p>
                                </div>
                              ) : null}
                              {/* Tail pointer */}
                              <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 bg-surface-card border-r border-b border-border rotate-45" />
                            </div>
                          )}
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
                          <span className="badge bg-gray-900 text-white text-[10px]">
                            <Check size={10} /> Redacted
                          </span>
                        )}
                        {isRejected && (
                          <span className="badge bg-emerald-50 text-emerald-700 text-[10px]">
                            <X size={10} /> Cleared
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
                            <>
                              <button
                                onClick={() => handleRevert(det.id)}
                                className="btn-ghost text-[10px] px-2 py-1"
                                title="Revert to pending"
                                aria-label={`Revert detection "${det.text.length > 30 ? det.text.slice(0, 30) + "..." : det.text}" to pending`}
                              >
                                Undo
                              </button>
                              {det.source === "manual" && (
                                <button
                                  onClick={() => handleDeleteManualDetection(det.id)}
                                  className="flex items-center gap-0.5 px-2 py-1 rounded-input text-[10px] font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                                  title="Delete manual detection"
                                  aria-label={`Delete manual detection "${det.text.length > 30 ? det.text.slice(0, 30) + "..." : det.text}"`}
                                >
                                  <X size={11} aria-hidden="true" />
                                  Delete
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleAccept(det.id)}
                                className="flex items-center gap-0.5 px-2 py-1 rounded-input text-[10px] font-medium bg-gray-800 text-white hover:bg-gray-900 transition-colors"
                                title="Redact this detection"
                                aria-label={`Redact detection "${det.text.length > 30 ? det.text.slice(0, 30) + "..." : det.text}"`}
                              >
                                <Check size={11} aria-hidden="true" />
                                Redact
                              </button>
                              <button
                                onClick={() => handleReject(det.id)}
                                className="flex items-center gap-0.5 px-2 py-1 rounded-input text-[10px] font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                                title="Reject detection -- do not redact"
                                aria-label={`Reject detection "${det.text.length > 30 ? det.text.slice(0, 30) + "..." : det.text}"`}
                              >
                                <X size={11} aria-hidden="true" />
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
                {sortedDetections.length === 0 && (
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
        <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center" role="dialog" aria-modal="true" aria-label={isSubmitting ? "Submitting review" : "Submission successful"}>
          <div className="bg-white rounded-card shadow-xl px-8 py-6 text-center max-w-sm" role="status" aria-live="polite">
            {isSubmitting ? (
              <>
                <div className="w-10 h-10 border-3 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <div className="text-sm font-semibold text-txt-primary">Signing off...</div>
                <div className="text-xs text-txt-secondary mt-1">Recording decisions in audit trail</div>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3">
                  <Check className="w-6 h-6 text-confidence-high" />
                </div>
                <div className="text-sm font-semibold text-txt-primary">Signed Off Successfully</div>
                <div className="text-xs text-txt-secondary mt-1">All redaction decisions approved. Redirecting to withholding schedule...</div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== Manual Detection Popover (WP22) ===== */}
      {manualPopover && (
        <ManualDetectionPopover
          selectedText={manualPopover.text}
          page={manualPopover.page}
          position={manualPopover.position}
          onSubmit={handleManualDetectionSubmit}
          onCancel={() => {
            setManualPopover(null);
            window.getSelection()?.removeAllRanges();
          }}
        />
      )}

      {/* ===== AI Learning Panel (WP22) ===== */}
      {aiLearningDetection && !selectedDetectionId && (
        <AILearningPanel
          detectionId={aiLearningDetection.id}
          detectionText={aiLearningDetection.text}
          caseId={caseId}
          onClose={() => setAiLearningDetection(null)}
          onCrossDocCreated={() => router.refresh()}
          panelHeight={panelHeight}
        />
      )}

      {/* ===== Screen reader status announcements ===== */}
      <div
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {statusAnnouncement}
      </div>

      {/* ===== Keyboard Shortcuts Hint Panel (toggled with ?) ===== */}
      {showKeyboardHints && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] bg-surface-card border border-border rounded-card shadow-xl p-4 w-80"
          role="dialog"
          aria-label="Keyboard shortcuts"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-txt-primary">Keyboard Shortcuts</h3>
            <button
              onClick={() => setShowKeyboardHints(false)}
              className="text-txt-secondary hover:text-txt-primary"
              aria-label="Close keyboard shortcuts"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <dt className="text-txt-secondary">Navigate detections</dt>
              <dd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-txt-primary">Arrow Up / Down</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-txt-secondary">Redact detection</dt>
              <dd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-txt-primary">A</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-txt-secondary">Reject detection</dt>
              <dd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-txt-primary">R</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-txt-secondary">Select / expand</dt>
              <dd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-txt-primary">Enter / Space</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-txt-secondary">Deselect / close</dt>
              <dd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-txt-primary">Escape</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-txt-secondary">Toggle this panel</dt>
              <dd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-txt-primary">?</dd>
            </div>
          </dl>
        </div>
      )}

      {/* ===== AI Explanation & Confidence Detail Panel (when a detection is selected) ===== */}
      {selectedDetectionId && (() => {
        const det = detectionById.get(selectedDetectionId);
        if (!det) return null;
        const detailType = detectionStates[det.id]?.type ?? det.type;
        const typeConf = detectionTypeConfig[detailType as keyof typeof detectionTypeConfig];
        return (
          <div style={{ bottom: panelHeight + 16 }} className="fixed right-6 w-80 bg-surface-card border border-border rounded-card shadow-lg p-4 z-40 max-h-[60vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <AlertCircle size={13} className="text-brand-primary" />
                <span className="text-xs font-semibold text-txt-primary">Detection Details</span>
              </div>
              <button
                onClick={() => setSelectedDetectionId(null)}
                className="text-txt-secondary hover:text-txt-primary"
                aria-label="Close detection details"
              >
                <X size={13} />
              </button>
            </div>

            {/* Type & source badges */}
            <div className="flex items-center gap-1.5 mb-3">
              <span className={cn("badge text-[10px]", typeConf?.color ?? "bg-gray-100 text-gray-700")}>
                {typeConf?.label ?? det.type}
              </span>
              <span className="badge bg-gray-50 text-gray-600 text-[10px]">
                {sourceLabel(det.source)}
              </span>
              {det.source === "manual" && (
                <span className="badge bg-gray-100 text-gray-600 text-[9px]">Manual</span>
              )}
            </div>

            {/* Confidence meter */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-txt-secondary font-medium">Confidence</span>
                <div className="flex items-center gap-1.5">
                  <span className={cn("font-semibold text-[10px] px-1.5 py-0.5 rounded", confBgClass(det.confidence), confTextClass(det.confidence))}>
                    {confLabel(det.confidence)}
                  </span>
                  <span className={cn("font-mono font-semibold", confTextClass(det.confidence))}>
                    {det.confidence}%
                  </span>
                </div>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-300", confBarColor(det.confidence))}
                  style={{ width: `${det.confidence}%` }}
                  role="meter"
                  aria-valuenow={det.confidence}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Confidence: ${det.confidence}%`}
                />
              </div>
            </div>

            {/* AI Reasoning */}
            {det.source === "pattern" || det.source === "custom-rule" ? (
              <div className="mb-3 px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-input">
                <p className="text-[10px] text-txt-secondary italic">
                  Rule-based match — no AI reasoning available
                </p>
              </div>
            ) : (
              <>
                {det.reasoning && (
                  <div className="mb-3">
                    <span className="text-[10px] font-semibold text-txt-secondary uppercase tracking-wider block mb-1">
                      Reasoning
                    </span>
                    <blockquote className="border-l-2 border-brand-primary/40 pl-2.5 py-1 bg-brand-primary/5 rounded-r-input">
                      <p className="text-[11px] leading-relaxed text-txt-secondary">
                        {det.reasoning}
                      </p>
                    </blockquote>
                  </div>
                )}
                {det.aiExplanation && (
                  <div className="mb-3">
                    <span className="text-[10px] font-semibold text-txt-secondary uppercase tracking-wider block mb-1">
                      AI Explanation
                    </span>
                    <p className="text-[11px] leading-relaxed text-txt-secondary">
                      {det.aiExplanation}
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Public interest consideration */}
            {det.piConsideration && (
              <div className="mb-3">
                <span className="text-[10px] font-semibold text-txt-secondary uppercase tracking-wider block mb-1">
                  Public Interest Consideration
                </span>
                <div className="px-2.5 py-2 bg-amber-50 border border-amber-200 rounded-input">
                  <p className="text-[10px] leading-relaxed text-amber-800">
                    {det.piConsideration}
                  </p>
                </div>
              </div>
            )}

            {/* Suggested ground */}
            {det.suggestedGround && (
              <div className="text-[10px] text-txt-secondary border-t border-border pt-2 mb-2">
                <span className="uppercase tracking-wider font-semibold">Suggested ground: </span>
                <span className="font-mono text-brand-primary">
                  {groundLabel(det.suggestedGround)}
                </span>
              </div>
            )}

            {/* Change History Timeline */}
            <div className="border-t border-border mt-2 pt-2">
              <button
                onClick={() => setHistoryOpen((v) => !v)}
                aria-expanded={historyOpen}
                aria-label="Toggle change history"
                className="flex items-center gap-1 text-[10px] text-txt-secondary hover:text-txt-primary transition-colors w-full"
              >
                <History size={11} aria-hidden="true" />
                <span className="uppercase tracking-wider font-semibold">Change History</span>
                {historyData.length > 0 && !historyOpen && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-gray-100 text-txt-secondary text-[9px]">
                    {historyData.length}
                  </span>
                )}
                <ChevronRight size={10} className={cn("ml-auto transition-transform", historyOpen && "rotate-90")} aria-hidden="true" />
              </button>
              {historyOpen && (
                <div className="mt-2 max-h-40 overflow-y-auto">
                  {historyLoading ? (
                    <div className="flex items-center gap-2 py-2">
                      <div className="w-3 h-3 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
                      <p className="text-[10px] text-txt-secondary">Loading history...</p>
                    </div>
                  ) : historyData.length === 0 ? (
                    <p className="text-[10px] text-txt-secondary py-2 pl-3">No changes recorded yet.</p>
                  ) : (
                    <div className="relative pl-3">
                      {/* Timeline left border */}
                      <div className="absolute left-[5px] top-1 bottom-1 w-px bg-gray-300" aria-hidden="true" />
                      <div className="space-y-2.5">
                        {historyData.map((h) => (
                          <div key={h.id} className="relative flex items-start gap-2.5">
                            {/* Timeline dot */}
                            <div className="absolute -left-3 top-1 w-2 h-2 rounded-full bg-brand-primary/60 border border-white ring-1 ring-gray-200" aria-hidden="true" />
                            <div className="flex-1 bg-gray-50 rounded-input px-2.5 py-1.5 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-0.5">
                                <span className="font-medium text-[10px] text-txt-primary truncate">
                                  {h.changedBy}
                                </span>
                                <span className="text-[9px] text-txt-secondary/60 shrink-0" title={new Date(h.changedAt).toLocaleString()}>
                                  {relativeTime(h.changedAt)}
                                </span>
                              </div>
                              <p className="text-[10px] text-txt-secondary leading-snug">
                                {formatFieldChange(h)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
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
