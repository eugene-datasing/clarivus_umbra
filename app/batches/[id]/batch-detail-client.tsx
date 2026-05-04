"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { docTypeConfig, type DocType } from "@/lib/db/mappers";
import { formatDate, cn, confidenceColor } from "@/lib/utils";
import { bulkExcludeDocuments, deleteDocument } from "@/lib/actions/document-actions";
import { confirmAndExportBatch } from "@/lib/actions/batch-actions";
import type { LatestExportSummary } from "@/lib/data/detections";
import {
  FileText, Mail, Search, Filter, Upload,
  XCircle, ChevronRight, ArrowRight, Trash2, ShieldCheck,
  CheckCircle2, Download, Loader,
} from "lucide-react";

const exportStepLabel: Record<string, string> = {
  "Preparing export": "Preparing export",
  "Generating redaction schedule": "Generating redaction schedule",
  "Generating audit timeline": "Generating audit timeline",
  "Generating audit log": "Generating audit log",
  "Assembling ZIP package": "Assembling ZIP package",
  "Computing integrity hash": "Computing integrity hash",
  "Uploading to storage": "Uploading to storage",
  "Export complete": "Export complete",
};

const docStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "text-gray-600", bg: "bg-gray-100" },
  processing: { label: "Processing", color: "text-blue-700", bg: "bg-blue-50" },
  ready: { label: "Ready for Review", color: "text-amber-600", bg: "bg-amber-50" },
  "in-review": { label: "In Review", color: "text-blue-700", bg: "bg-blue-50" },
  reviewed: { label: "Reviewed", color: "text-brand-600", bg: "bg-brand-50" },
  "signed-off": { label: "Signed Off", color: "text-green-700", bg: "bg-green-50" },
  // Phase 12.5.1 — was missing from the v1 config; falling back to
  // "Pending" pre-fix when DB had docs at "auto-redacted".
  "auto-redacted": { label: "Auto-redacted", color: "text-emerald-700", bg: "bg-emerald-50" },
  excluded: { label: "Excluded", color: "text-gray-500", bg: "bg-gray-100" },
  error: { label: "Error", color: "text-red-700", bg: "bg-red-50" },
};

const batchStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Draft", color: "text-gray-600", bg: "bg-gray-100" },
  processing: { label: "Processing", color: "text-blue-700", bg: "bg-blue-50" },
  "ready-for-review": { label: "Ready for Review", color: "text-amber-600", bg: "bg-amber-50" },
  reviewed: { label: "Reviewed", color: "text-brand-600", bg: "bg-brand-50" },
  // Phase 12.5.1 — new auto-redacted state from Phase 12.2.
  "auto-redacted": { label: "Auto-redacted", color: "text-emerald-700", bg: "bg-emerald-50" },
  exported: { label: "Exported", color: "text-green-700", bg: "bg-green-50" },
  deleted: { label: "Deleted", color: "text-red-700", bg: "bg-red-50" },
};

function DocTypeIcon({ type }: { type: string }) {
  if (type === "eml" || type === "msg") return <Mail className="w-4 h-4 text-blue-500" />;
  if (type === "xlsx") return <FileText className="w-4 h-4 text-green-500" />;
  if (type === "docx") return <FileText className="w-4 h-4 text-blue-500" />;
  return <FileText className="w-4 h-4 text-red-500" />;
}

export interface BatchData {
  id: string;
  reference: string;
  name: string;
  status: string;
  documentCount: number;
  reviewedCount: number;
  redactionCount: number;
}

export interface DocumentRow {
  id: string;
  batchId: string;
  name: string;
  type: string;
  pageCount: number;
  sizeKB: number;
  status: string;
  detectionCount: number;
  avgConfidence: number;
  assignee: string | null;
  updatedAt: string;
  duplicateGroup?: string;
  totalProcessingMs?: number;
}

interface BatchDetailClientProps {
  batchData: BatchData;
  documents: DocumentRow[];
  requireExportConfirmation: boolean;
  latestExport: LatestExportSummary | null;
}

interface ExportPollState {
  status: string;
  progress: number;
  currentStep: string | null;
  error: string | null;
  filename: string | null;
  downloadKey?: string;
}

export default function BatchDetailClient({
  batchData,
  documents,
  requireExportConfirmation,
  latestExport,
}: BatchDetailClientProps) {
  const router = useRouter();
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [isExcluding, setIsExcluding] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmingExport, setIsConfirmingExport] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Phase 12.6b — export step-meter polling state. Seeded from
  // latestExport server-side; advanced by polling the existing
  // /api/export/[batchId]/[exportId]/status endpoint while the
  // export is in flight. Drives both the inline progress bar and
  // the completion toast.
  const [exportState, setExportState] = useState<ExportPollState | null>(
    latestExport
      ? {
          status: latestExport.status,
          progress: latestExport.progress,
          currentStep: latestExport.currentStep,
          error: latestExport.error,
          filename: latestExport.filename,
        }
      : null,
  );
  const [showCompleteToast, setShowCompleteToast] = useState(false);
  const previousExportStatus = useRef(latestExport?.status ?? null);

  const hasSelection = selectedDocs.size > 0;
  const showExportGate =
    batchData.status === "auto-redacted" && requireExportConfirmation;
  const exportInFlight =
    exportState !== null &&
    (exportState.status === "generating" || exportState.status === "verifying");
  const exportFailed =
    exportState !== null && exportState.status === "error";

  // Poll the export-progress endpoint while a job is in flight.
  // Seeded from `latestExport`; on a transition to "complete" we
  // refresh the page so the batch.status update lands and the
  // toast fires.
  useEffect(() => {
    if (!latestExport) return;
    if (
      exportState?.status !== "generating" &&
      exportState?.status !== "verifying"
    ) {
      return;
    }
    const exportId = latestExport.id;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/export/${batchData.id}/${exportId}/status`,
        );
        if (!res.ok) return;
        const data = await res.json();
        const next: ExportPollState = {
          status: data.status,
          progress: data.progress,
          currentStep: data.currentStep,
          error: data.error ?? null,
          filename: data.filename ?? null,
          downloadKey: data.downloadKey,
        };
        setExportState(next);
        if (
          previousExportStatus.current !== "complete" &&
          next.status === "complete"
        ) {
          previousExportStatus.current = "complete";
          setShowCompleteToast(true);
          router.refresh();
        }
      } catch {
        // network blips ignored — next tick retries
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [latestExport, exportState?.status, batchData.id, router]);

  const cfg = batchStatusConfig[batchData.status] ?? { label: batchData.status, color: "text-gray-600", bg: "bg-gray-100" };
  const progress = batchData.documentCount > 0
    ? Math.round((batchData.reviewedCount / batchData.documentCount) * 100)
    : 0;

  const filteredDocs = documents.filter((doc) => {
    if (!searchQuery) return true;
    return doc.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const toggleDoc = (docId: string) => {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedDocs.size === filteredDocs.length) {
      setSelectedDocs(new Set());
    } else {
      setSelectedDocs(new Set(filteredDocs.map((d) => d.id)));
    }
  };

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-txt-secondary mb-6">
        <Link href="/batches" className="hover:text-brand-primary transition-colors">
          Batches
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-txt-primary font-medium font-mono">{batchData.reference}</span>
      </div>

      {/* Batch Header */}
      <div className="card mb-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-xl font-heading font-bold text-txt-primary">
                {batchData.name}
              </h1>
              <span className={cn("badge", cfg.bg, cfg.color)}>{cfg.label}</span>
            </div>
            <p className="text-sm text-txt-secondary font-mono">{batchData.reference}</p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-primary rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-sm text-txt-secondary whitespace-nowrap">
            {batchData.reviewedCount} / {batchData.documentCount} reviewed ({progress}%)
          </span>
        </div>
      </div>

      {/* Phase 12.6b — confirm-and-export gate banner. Visible only
          when the batch is auto-redacted (every doc landed at zero
          pending detections) and the org/batch policy requires a
          human checkpoint before the export ZIP fires. */}
      {showExportGate && (
        <div
          className="card mb-6 px-5 py-4 flex items-start gap-4 border-emerald-200 bg-emerald-50/40"
          role="region"
          aria-label="Export confirmation required"
        >
          <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-emerald-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-heading font-semibold text-txt-primary mb-0.5">
              Awaiting your confirmation
            </h3>
            <p className="text-xs text-txt-secondary">
              All detections were high-confidence and have been auto-accepted.
              Click <span className="font-medium">Confirm &amp; export</span> to
              generate the redacted ZIP package.
            </p>
            {confirmError && (
              <p
                role="alert"
                aria-live="assertive"
                className="text-xs text-red-700 mt-2"
              >
                {confirmError}
              </p>
            )}
          </div>
          <button
            onClick={async () => {
              setConfirmError(null);
              setIsConfirmingExport(true);
              try {
                await confirmAndExportBatch(batchData.id);
                router.refresh();
              } catch (err) {
                setConfirmError(
                  err instanceof Error ? err.message : "Export failed",
                );
              } finally {
                setIsConfirmingExport(false);
              }
            }}
            disabled={isConfirmingExport}
            className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ShieldCheck className="w-4 h-4" />
            {isConfirmingExport ? "Confirming..." : "Confirm & export"}
          </button>
        </div>
      )}

      {/* Phase 12.6b — export step-meter. Visible while the export
          job is in flight (status=generating|verifying). Polls the
          existing per-export endpoint at 2s and renders the current
          stage label + percentage. */}
      {exportInFlight && exportState && (
        <div
          className="card mb-6 px-5 py-4 border-blue-200 bg-blue-50/30"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3 mb-3">
            <Loader className="w-4 h-4 text-blue-600 animate-spin" />
            <span className="text-sm font-medium text-txt-primary">
              Generating export package
            </span>
            <span className="text-xs text-txt-secondary">
              {exportStepLabel[exportState.currentStep ?? ""] ??
                exportState.currentStep ??
                "Working"}
            </span>
            <div className="flex-1" />
            <span className="text-xs font-mono text-txt-secondary">
              {exportState.progress}%
            </span>
          </div>
          <div
            className="h-2 bg-gray-100 rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={exportState.progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${exportState.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Phase 12.6b — soft error surface when the latest export
          errored. Distinct from the in-flight banner so the colour
          shift is unambiguous. The Export tab's existing UI owns
          the retry button. */}
      {exportFailed && exportState && (
        <div
          className="card mb-6 px-5 py-3 flex items-center gap-3 border-red-200 bg-red-50/30"
          role="alert"
          aria-live="assertive"
        >
          <XCircle className="w-4 h-4 text-red-600" />
          <span className="text-sm text-txt-primary">
            Export failed: {exportState.error ?? "Unknown error"}
          </span>
          <div className="flex-1" />
          <Link
            href={`/batches/${batchData.id}/export`}
            className="text-xs text-red-700 hover:text-red-900 underline"
          >
            Open export page
          </Link>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 border-b border-border mb-6">
        <Link
          href={`/batches/${batchData.id}`}
          className="px-4 py-2.5 text-sm font-medium text-brand-primary border-b-2 border-brand-primary -mb-px"
        >
          Documents
        </Link>
        <Link
          href={`/batches/${batchData.id}/audit`}
          className="px-4 py-2.5 text-sm font-medium text-txt-secondary hover:text-txt-primary transition-colors"
        >
          Audit Trail
        </Link>
        <Link
          href={`/batches/${batchData.id}/export`}
          className="px-4 py-2.5 text-sm font-medium text-txt-secondary hover:text-txt-primary transition-colors"
        >
          Export
        </Link>
        <div className="flex-1" />
        <Link
          href={`/batches/${batchData.id}/ingest`}
          className="btn-primary flex items-center gap-2 text-xs mb-1"
        >
          <Upload className="w-3.5 h-3.5" />
          Upload Documents
        </Link>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-txt-secondary" />
          <input
            type="text"
            placeholder="Search documents..."
            className="input-field pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button className="btn-secondary flex items-center gap-2">
          <Filter className="w-4 h-4" />
          Filter
        </button>
      </div>

      {/* Phase 12.6a — persistent bulk-actions toolbar. Lives directly
          below the search bar so it's always visible and predictable;
          buttons disable + show helper text when no docs selected. */}
      <div
        className={cn(
          "card mb-4 px-4 py-2.5 flex items-center gap-3 transition-colors",
          hasSelection ? "border-brand-primary/40 bg-brand-50/30" : "",
        )}
        role="toolbar"
        aria-label="Bulk document actions"
      >
        <span
          className={cn(
            "text-sm",
            hasSelection ? "text-txt-primary font-medium" : "text-txt-secondary italic",
          )}
        >
          {hasSelection
            ? `${selectedDocs.size} document${selectedDocs.size > 1 ? "s" : ""} selected`
            : "Select documents to take bulk actions"}
        </span>
        <div className="flex-1" />
        <button
          onClick={() =>
            router.push(`/batches/${batchData.id}/bulk-review`)
          }
          disabled={!hasSelection}
          className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowRight className="w-4 h-4" />
          Bulk Review
        </button>
        <button
          onClick={async () => {
            setIsExcluding(true);
            try {
              await bulkExcludeDocuments(Array.from(selectedDocs));
              setSelectedDocs(new Set());
              router.refresh();
            } catch (e) {
              console.error("Exclude failed:", e);
            } finally {
              setIsExcluding(false);
            }
          }}
          disabled={!hasSelection || isExcluding}
          className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <XCircle className="w-4 h-4" />
          {isExcluding ? "Excluding..." : "Mark Excluded"}
        </button>
        <button
          onClick={async () => {
            if (
              !confirm(
                `Permanently delete ${selectedDocs.size} document(s)? This cannot be undone.`,
              )
            )
              return;
            setIsDeleting(true);
            try {
              for (const docId of selectedDocs) {
                await deleteDocument(docId);
              }
              setSelectedDocs(new Set());
              router.refresh();
            } catch (e) {
              console.error("Delete failed:", e);
            } finally {
              setIsDeleting(false);
            }
          }}
          disabled={!hasSelection || isDeleting}
          className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-md text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-4 h-4" />
          {isDeleting ? "Deleting..." : "Delete"}
        </button>
        {hasSelection && (
          <button
            onClick={() => setSelectedDocs(new Set())}
            className="text-sm text-txt-secondary hover:text-txt-primary px-2"
          >
            Clear
          </button>
        )}
      </div>

      {/* Document Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-bg/50">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedDocs.size === filteredDocs.length && filteredDocs.length > 0}
                  onChange={toggleAll}
                  className="rounded border-border text-brand-primary focus:ring-brand-primary/30"
                />
              </th>
              <th className="text-left px-4 py-3 font-medium text-txt-secondary">Name</th>
              <th className="text-left px-4 py-3 font-medium text-txt-secondary">Type</th>
              <th className="text-left px-4 py-3 font-medium text-txt-secondary">Status</th>
              <th className="text-center px-4 py-3 font-medium text-txt-secondary">AI Detections</th>
              <th className="text-center px-4 py-3 font-medium text-txt-secondary">Avg Confidence</th>
              <th className="text-left px-4 py-3 font-medium text-txt-secondary">Assignee</th>
              <th className="text-left px-4 py-3 font-medium text-txt-secondary">Updated</th>
              <th className="text-center px-4 py-3 font-medium text-txt-secondary">Processing</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filteredDocs.map((doc) => {
              const dCfg = docStatusConfig[doc.status] || docStatusConfig.pending;
              const tCfg = docTypeConfig[doc.type.toLowerCase() as DocType] ?? { label: doc.type, color: "text-gray-600 bg-gray-50", icon: "FileText" };
              const confColor = doc.avgConfidence > 0 ? confidenceColor(doc.avgConfidence) : "";
              return (
                <tr
                  key={doc.id}
                  className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors cursor-pointer group"
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedDocs.has(doc.id)}
                      onChange={() => toggleDoc(doc.id)}
                      className="rounded border-border text-brand-primary focus:ring-brand-primary/30"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/batches/${batchData.id}/review/${doc.id}`}
                      className="flex items-center gap-2"
                    >
                      <DocTypeIcon type={doc.type} />
                      <span className="font-medium text-txt-primary group-hover:text-brand-primary transition-colors">
                        {doc.name}
                      </span>
                      <span className="text-xs text-txt-secondary">({doc.pageCount}p)</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/batches/${batchData.id}/review/${doc.id}`}>
                      <span className={cn("badge text-xs", tCfg.color)}>{tCfg.label}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/batches/${batchData.id}/review/${doc.id}`}>
                      <span className={cn("badge", dCfg.bg, dCfg.color)}>{dCfg.label}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Link href={`/batches/${batchData.id}/review/${doc.id}`}>
                      {doc.detectionCount > 0 ? (
                        <span className="font-medium text-txt-primary">{doc.detectionCount}</span>
                      ) : (
                        <span className="text-txt-secondary">--</span>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Link href={`/batches/${batchData.id}/review/${doc.id}`}>
                      {doc.avgConfidence > 0 ? (
                        <span className={cn("font-medium text-sm", `text-${confColor}`)}>
                          {doc.avgConfidence}%
                        </span>
                      ) : (
                        <span className="text-txt-secondary">--</span>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/batches/${batchData.id}/review/${doc.id}`}>
                      {doc.assignee ? (
                        <span className="text-txt-primary">{doc.assignee}</span>
                      ) : (
                        <span className="text-txt-secondary italic">Unassigned</span>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-txt-secondary">
                    <Link href={`/batches/${batchData.id}/review/${doc.id}`}>
                      {formatDate(doc.updatedAt)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-txt-secondary">
                    <Link href={`/batches/${batchData.id}/review/${doc.id}`}>
                      {doc.totalProcessingMs != null ? (
                        <span className="font-mono">{(doc.totalProcessingMs / 1000).toFixed(1)}s</span>
                      ) : (
                        <span>--</span>
                      )}
                    </Link>
                  </td>
                  <td className="px-2 py-3 w-8" onClick={(e) => e.stopPropagation()}>
                    {deleteConfirm === doc.id ? (
                      <button
                        onClick={async () => {
                          setIsDeleting(true);
                          try {
                            await deleteDocument(doc.id);
                            setDeleteConfirm(null);
                            router.refresh();
                          } catch (e) {
                            console.error("Delete failed:", e);
                          } finally {
                            setIsDeleting(false);
                          }
                        }}
                        disabled={isDeleting}
                        className="text-xs text-red-600 font-medium hover:text-red-800"
                      >
                        {isDeleting ? "..." : "Confirm"}
                      </button>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(doc.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-txt-secondary hover:text-red-600"
                        title="Delete document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phase 12.6b — export-complete toast. Fires once when the
          poll loop sees status flip to "complete". Auto-positioned
          bottom-right with a Download CTA pointing at the existing
          per-export download endpoint. */}
      {showCompleteToast && exportState?.status === "complete" && latestExport && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 bg-white rounded-card shadow-xl border border-emerald-200 px-5 py-4 flex items-start gap-3 max-w-sm"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-txt-primary mb-0.5">
              Export ready
            </h3>
            <p className="text-xs text-txt-secondary mb-2">
              {exportState.filename ?? "Redacted ZIP package"} is ready to
              download.
            </p>
            <div className="flex items-center gap-3">
              <a
                href={`/api/export/${batchData.id}/${latestExport.id}/download`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                Download ZIP
              </a>
              <button
                onClick={() => setShowCompleteToast(false)}
                className="text-xs text-txt-secondary hover:text-txt-primary"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
