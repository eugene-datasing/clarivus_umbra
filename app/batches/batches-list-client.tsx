"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDate, cn } from "@/lib/utils";
import {
  Search,
  Filter,
  FileText,
  ChevronRight,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { softDeleteBatch } from "@/lib/actions/batch-actions";

export interface BatchRow {
  id: string;
  reference: string;
  name: string;
  status: string;
  documentCount: number;
  reviewedCount: number;
  redactionCount: number;
  createdAt: string;
  updatedAt: string;
}

interface BatchesListClientProps {
  batches: BatchRow[];
  totalCount: number;
  activeCount: number;
  canDelete: boolean;
}

const batchStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Draft", color: "text-gray-600", bg: "bg-gray-100" },
  processing: { label: "Processing", color: "text-blue-700", bg: "bg-blue-50" },
  "ready-for-review": { label: "Ready for Review", color: "text-amber-600", bg: "bg-amber-50" },
  reviewed: { label: "Reviewed", color: "text-brand-600", bg: "bg-brand-50" },
  exported: { label: "Exported", color: "text-green-700", bg: "bg-green-50" },
  deleted: { label: "Deleted", color: "text-red-700", bg: "bg-red-50" },
};

export default function BatchesListClient({
  batches,
  totalCount,
  activeCount,
  canDelete,
}: BatchesListClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [pendingDelete, startDeleteTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = (batchId: string) => {
    startDeleteTransition(async () => {
      setDeleteError(null);
      try {
        await softDeleteBatch(batchId);
        setConfirmId(null);
        router.refresh();
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : "Delete failed");
      }
    });
  };

  const filtered = batches.filter((b) => {
    if (filterStatus && b.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        b.reference.toLowerCase().includes(q) ||
        b.name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="p-6 max-w-[1400px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-txt-primary">Batches</h1>
          <p className="text-sm text-txt-secondary mt-1">
            {totalCount} total batches &middot; {activeCount} active
          </p>
        </div>
        <Link href="/batches/new" className="btn-primary flex items-center gap-2">
          New Batch
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-txt-secondary" />
          <input
            type="text"
            placeholder="Search by reference or name…"
            className="input-field pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn("btn-secondary flex items-center gap-2", showFilters && "bg-surface-hover")}
        >
          <Filter className="w-4 h-4" />
          Filters
        </button>
      </div>

      {showFilters && (
        <div className="card mb-6 flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <label className="text-txt-secondary font-medium">Status:</label>
            <select className="input-field w-auto" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="processing">Processing</option>
              <option value="ready-for-review">Ready for Review</option>
              <option value="reviewed">Reviewed</option>
              <option value="exported">Exported</option>
            </select>
          </div>
        </div>
      )}

      {deleteError && (
        <div className="card mb-4 border-red-200 bg-red-50/60">
          <div className="text-xs text-red-700 font-medium">{deleteError}</div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-bg/50">
              <th className="text-left px-4 py-3 font-medium text-txt-secondary">Reference</th>
              <th className="text-left px-4 py-3 font-medium text-txt-secondary">Name</th>
              <th className="text-left px-4 py-3 font-medium text-txt-secondary">Status</th>
              <th className="text-left px-4 py-3 font-medium text-txt-secondary">Documents</th>
              <th className="text-left px-4 py-3 font-medium text-txt-secondary">Created</th>
              {canDelete && <th className="text-right px-4 py-3 font-medium text-txt-secondary">Actions</th>}
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => {
              const cfg = batchStatusConfig[b.status] ?? {
                label: b.status,
                color: "text-gray-600",
                bg: "bg-gray-100",
              };
              const isConfirming = confirmId === b.id;
              return (
                <>
                  <tr
                    key={b.id}
                    className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/batches/${b.id}`} className="block">
                        <span className="font-mono text-xs font-medium text-brand-primary">
                          {b.reference}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/batches/${b.id}`} className="block">
                        <div className="font-medium text-txt-primary">{b.name}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/batches/${b.id}`} className="block">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn("badge", cfg.bg, cfg.color)}>{cfg.label}</span>
                          {/* Phase 12.6b — surface "Ready to download"
                              when the export ZIP is sitting in storage
                              waiting on a reviewer click. */}
                          {b.status === "exported" && (
                            <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Ready to download
                            </span>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/batches/${b.id}`} className="block">
                        <div className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-txt-secondary" />
                          <span className="text-txt-primary font-medium">{b.reviewedCount}</span>
                          <span className="text-txt-secondary">/ {b.documentCount}</span>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-txt-secondary">
                      <Link href={`/batches/${b.id}`} className="block">
                        {formatDate(b.createdAt)}
                      </Link>
                    </td>
                    {canDelete && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmId(b.id);
                          }}
                          className="text-xs text-red-600 hover:text-red-700 inline-flex items-center gap-1"
                          title="Soft-delete this batch"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      </td>
                    )}
                    <td className="px-2 py-3">
                      <Link href={`/batches/${b.id}`} className="block">
                        <ChevronRight className="w-4 h-4 text-txt-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                    </td>
                  </tr>
                  {isConfirming && (
                    <tr key={`${b.id}-confirm`}>
                      <td colSpan={canDelete ? 7 : 6} className="px-4 py-3 bg-amber-50/60">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-4 h-4 text-amber-600 mt-1" />
                          <div className="flex-1 text-xs">
                            <div className="font-medium text-amber-800">
                              Soft-delete {b.reference}?
                            </div>
                            <div className="text-amber-700 mt-1">
                              The batch moves to Trash and is hidden from the list.
                              An admin can restore it from the Retention page within
                              the grace period before it is permanently purged.
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <button
                                onClick={() => handleDelete(b.id)}
                                disabled={pendingDelete}
                                className="btn-primary text-xs disabled:opacity-50"
                              >
                                Confirm Delete
                              </button>
                              <button
                                onClick={() => setConfirmId(null)}
                                className="btn-secondary text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-txt-secondary">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>No batches match your search.</p>
          </div>
        )}
      </div>
    </div>
  );
}
