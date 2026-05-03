"use client";

import Link from "next/link";
import { formatDate, cn, confidenceColor } from "@/lib/utils";
import { FileText, Mail, ArrowRight } from "lucide-react";

interface QueueDocument {
  id: string;
  batchId: string;
  batchReference: string;
  name: string;
  type: string;
  pageCount: number;
  sizeKB: number;
  status: string;
  detectionCount: number;
  avgConfidence: number;
  assignee: string | null;
  updatedAt: string;
}

interface BatchItem {
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

interface QueueGroup {
  batch: BatchItem;
  docs: QueueDocument[];
}

interface QueueClientProps {
  queueDocuments: QueueDocument[];
  batches: BatchItem[];
}

const batchStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Draft", color: "text-gray-600", bg: "bg-gray-100" },
  processing: { label: "Processing", color: "text-blue-700", bg: "bg-blue-50" },
  "ready-for-review": { label: "Ready for Review", color: "text-amber-600", bg: "bg-amber-50" },
  reviewed: { label: "Reviewed", color: "text-brand-600", bg: "bg-brand-50" },
  exported: { label: "Exported", color: "text-green-700", bg: "bg-green-50" },
  deleted: { label: "Deleted", color: "text-red-700", bg: "bg-red-50" },
};

function buildQueueGroups(queueDocs: QueueDocument[], batches: BatchItem[]): QueueGroup[] {
  const batchIds = [...new Set(queueDocs.map((d) => d.batchId))];
  const groups: QueueGroup[] = batchIds
    .map((bid) => {
      const batch = batches.find((b) => b.id === bid);
      if (!batch) return null;
      const docs = queueDocs.filter((d) => d.batchId === bid);
      return { batch, docs };
    })
    .filter(Boolean) as QueueGroup[];

  // Sort by batch updatedAt descending (most recent first)
  groups.sort((a, b) => new Date(b.batch.updatedAt).getTime() - new Date(a.batch.updatedAt).getTime());
  return groups;
}

function DocTypeIcon({ type }: { type: string }) {
  if (type === "eml" || type === "msg") return <Mail className="w-4 h-4 text-blue-500" />;
  if (type === "xlsx") return <FileText className="w-4 h-4 text-green-500" />;
  if (type === "docx") return <FileText className="w-4 h-4 text-blue-500" />;
  return <FileText className="w-4 h-4 text-red-500" />;
}

export default function QueueClient({ queueDocuments, batches }: QueueClientProps) {
  const queueGroups = buildQueueGroups(queueDocuments, batches);
  const totalQueueCount = queueGroups.reduce((sum, g) => sum + g.docs.length, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-txt-primary">My Review Queue</h1>
        <p className="text-sm text-txt-secondary mt-1">
          {totalQueueCount} documents awaiting your review
        </p>
      </div>

      <div className="space-y-6">
        {queueGroups.map((group) => {
          const cfg = batchStatusConfig[group.batch.status] ?? { label: group.batch.status, color: "text-gray-600", bg: "bg-gray-100" };
          return (
            <div key={group.batch.id} className="card p-0 overflow-hidden">
              <div className="px-6 py-4 bg-surface-bg/50 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Link
                    href={`/batches/${group.batch.id}`}
                    className="font-mono text-sm font-medium text-brand-primary hover:underline"
                  >
                    {group.batch.reference}
                  </Link>
                  <span className={cn("badge", cfg.bg, cfg.color)}>{cfg.label}</span>
                  <span className="text-sm text-txt-primary">{group.batch.name}</span>
                </div>
                <span className="text-xs text-txt-secondary">{formatDate(group.batch.updatedAt)}</span>
              </div>

              <div className="divide-y divide-border">
                {group.docs.map((doc) => {
                  const confColor = doc.avgConfidence > 0 ? confidenceColor(doc.avgConfidence) : "";
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center gap-4 px-6 py-3 hover:bg-surface-hover transition-colors group"
                    >
                      <DocTypeIcon type={doc.type} />

                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-txt-primary truncate">{doc.name}</div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-txt-secondary">{doc.detectionCount} detections</span>
                          {doc.avgConfidence > 0 && (
                            <span className={cn("text-xs font-medium", `text-${confColor}`)}>
                              {doc.avgConfidence}% avg confidence
                            </span>
                          )}
                          <span className="text-xs text-txt-secondary">{doc.pageCount} pages</span>
                        </div>
                      </div>

                      <Link
                        href={`/batches/${doc.batchId}/review/${doc.id}`}
                        className="btn-primary text-xs flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity"
                      >
                        Start Review
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {queueGroups.length === 0 && (
        <div className="card text-center py-16">
          <FileText className="w-10 h-10 text-txt-secondary/30 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-txt-primary mb-1">Queue is empty</h3>
          <p className="text-sm text-txt-secondary">No documents are currently assigned to you for review.</p>
        </div>
      )}
    </div>
  );
}
