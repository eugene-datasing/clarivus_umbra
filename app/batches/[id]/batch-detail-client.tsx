"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { docTypeConfig, type DocType } from "@/lib/db/mappers";
import { formatDate, cn, confidenceColor } from "@/lib/utils";
import { bulkExcludeDocuments, deleteDocument, bulkAssignReviewer } from "@/lib/actions/document-actions";
import {
  FileText, Mail, Search, Filter, Upload,
  XCircle, ChevronRight, ArrowRight, Trash2, UserPlus,
} from "lucide-react";

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
}

export default function BatchDetailClient({ batchData, documents }: BatchDetailClientProps) {
  const router = useRouter();
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [isExcluding, setIsExcluding] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

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

      {/* Bulk Action Bar */}
      {selectedDocs.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 ml-[130px] bg-brand-primary text-white rounded-card shadow-xl px-6 py-3 flex items-center gap-6 z-50">
          <span className="text-sm font-medium">
            {selectedDocs.size} document{selectedDocs.size > 1 ? "s" : ""} selected
          </span>
          <div className="h-5 w-px bg-white/30" />
          <button
            onClick={() => setShowAssign(!showAssign)}
            className="text-sm hover:underline flex items-center gap-1.5"
          >
            <UserPlus className="w-4 h-4" />
            Assign Reviewer
          </button>
          <button
            onClick={() => router.push(`/batches/${batchData.id}/bulk-review`)}
            className="text-sm hover:underline flex items-center gap-1.5"
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
            disabled={isExcluding}
            className="text-sm hover:underline flex items-center gap-1.5"
          >
            <XCircle className="w-4 h-4" />
            {isExcluding ? "Excluding..." : "Mark Excluded"}
          </button>
          <button
            onClick={async () => {
              if (!confirm(`Permanently delete ${selectedDocs.size} document(s)? This cannot be undone.`)) return;
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
            disabled={isDeleting}
            className="text-sm hover:underline flex items-center gap-1.5 text-red-200 hover:text-white"
          >
            <Trash2 className="w-4 h-4" />
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
          <div className="h-5 w-px bg-white/30" />
          <button
            onClick={() => setSelectedDocs(new Set())}
            className="text-sm text-white/70 hover:text-white"
          >
            Clear
          </button>
        </div>
      )}

      {/* Assign Reviewer Modal */}
      {showAssign && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={() => setShowAssign(false)}>
          <div className="bg-white rounded-card shadow-xl p-6 w-80" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-heading font-bold text-txt-primary mb-3">Assign Reviewer</h3>
            <p className="text-sm text-txt-secondary mb-4">
              Assign {selectedDocs.size} document{selectedDocs.size > 1 ? "s" : ""} to a reviewer.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const reviewerEmail = (form.elements.namedItem("reviewerEmail") as HTMLInputElement).value;
                if (!reviewerEmail) return;
                setIsAssigning(true);
                try {
                  await bulkAssignReviewer(Array.from(selectedDocs), reviewerEmail);
                  setShowAssign(false);
                  setSelectedDocs(new Set());
                  router.refresh();
                } catch (err) {
                  alert(err instanceof Error ? err.message : "Assignment failed");
                } finally {
                  setIsAssigning(false);
                }
              }}
            >
              <label className="text-sm font-medium text-txt-primary block mb-1">Reviewer email</label>
              <input
                name="reviewerEmail"
                type="email"
                placeholder="reviewer@example.com"
                className="input-field w-full mb-4"
                required
              />
              <div className="flex items-center gap-2 justify-end">
                <button type="button" onClick={() => setShowAssign(false)} className="btn-secondary text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={isAssigning} className="btn-primary text-sm">
                  {isAssigning ? "Assigning..." : "Assign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
