"use client";

import Link from "next/link";
import { workingDaysRemaining, deadlineColor, formatDate, cn, confidenceColor } from "@/lib/utils";
import { type RequestStatus, statusConfig } from "@/lib/db/mappers";
import { FileText, Mail, ArrowRight } from "lucide-react";

interface QueueDocument {
  id: string;
  requestId: string;
  requestReference: string;
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

interface CaseItem {
  id: string;
  reference: string;
  requesterName: string;
  requesterType: string;
  dateReceived: string;
  deadline: string;
  priority: "standard" | "urgent" | "extended";
  department: string[];
  description: string;
  status: string;
  documentCount: number;
  reviewedCount: number;
  redactionCount: number;
}

interface QueueGroup {
  request: CaseItem;
  docs: QueueDocument[];
  daysRemaining: number;
}

interface QueueClientProps {
  queueDocuments: QueueDocument[];
  cases: CaseItem[];
  amberWarningDays?: number;
  redWarningDays?: number;
}

function buildQueueGroups(queueDocs: QueueDocument[], cases: CaseItem[]): QueueGroup[] {
  const requestIds = [...new Set(queueDocs.map((d) => d.requestId))];
  const groups: QueueGroup[] = requestIds
    .map((rid) => {
      const request = cases.find((r) => r.id === rid);
      if (!request) return null;
      const docs = queueDocs.filter((d) => d.requestId === rid);
      return {
        request,
        docs,
        daysRemaining: workingDaysRemaining(request.deadline),
      };
    })
    .filter(Boolean) as QueueGroup[];

  // Sort by deadline urgency (fewest days first)
  groups.sort((a, b) => a.daysRemaining - b.daysRemaining);
  return groups;
}

function DocTypeIcon({ type }: { type: string }) {
  if (type === "eml" || type === "msg") return <Mail className="w-4 h-4 text-blue-500" />;
  if (type === "xlsx") return <FileText className="w-4 h-4 text-green-500" />;
  if (type === "docx") return <FileText className="w-4 h-4 text-blue-500" />;
  return <FileText className="w-4 h-4 text-red-500" />;
}

export default function QueueClient({ queueDocuments, cases, amberWarningDays, redWarningDays }: QueueClientProps) {
  const queueGroups = buildQueueGroups(queueDocuments, cases);
  const totalQueueCount = queueGroups.reduce((sum, g) => sum + g.docs.length, 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-txt-primary">My Review Queue</h1>
        <p className="text-sm text-txt-secondary mt-1">
          {totalQueueCount} documents awaiting your review
        </p>
      </div>

      {/* Queue Groups */}
      <div className="space-y-6">
        {queueGroups.map((group) => {
          const days = group.daysRemaining;
          const cfg = statusConfig[group.request.status as RequestStatus];
          return (
            <div key={group.request.id} className="card p-0 overflow-hidden">
              {/* Group Header */}
              <div className="px-6 py-4 bg-surface-bg/50 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Link
                    href={`/requests/${group.request.id}`}
                    className="font-mono text-sm font-medium text-brand-primary hover:underline"
                  >
                    {group.request.reference}
                  </Link>
                  <span className={cn("badge", cfg.bg, cfg.color)}>{cfg.label}</span>
                  <span className="text-xs text-txt-secondary">
                    {group.request.requesterName} &middot; {group.request.department.join(", ")}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn("text-sm font-semibold", deadlineColor(days, { amberDays: amberWarningDays, redDays: redWarningDays }))}>
                    {days < 0
                      ? `${Math.abs(days)}d overdue`
                      : days === 0
                      ? "Due today"
                      : `${days}d remaining`}
                  </span>
                  <span className="text-xs text-txt-secondary">{formatDate(group.request.deadline)}</span>
                </div>
              </div>

              {/* Document List */}
              <div className="divide-y divide-border">
                {group.docs.map((doc) => {
                  const confColor = doc.avgConfidence > 0 ? confidenceColor(doc.avgConfidence) : "";
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center gap-4 px-6 py-3 hover:bg-surface-hover transition-colors group"
                    >
                      {/* File Icon */}
                      <DocTypeIcon type={doc.type} />

                      {/* File Info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-txt-primary truncate">
                          {doc.name}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-txt-secondary">
                            {doc.detectionCount} detections
                          </span>
                          {doc.avgConfidence > 0 && (
                            <span className={cn("text-xs font-medium", `text-${confColor}`)}>
                              {doc.avgConfidence}% avg confidence
                            </span>
                          )}
                          <span className="text-xs text-txt-secondary">
                            {doc.pageCount} pages
                          </span>
                        </div>
                      </div>

                      {/* Start Review Button */}
                      <Link
                        href={`/requests/${doc.requestId}/review/${doc.id}`}
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
          <p className="text-sm text-txt-secondary">
            No documents are currently assigned to you for review.
          </p>
        </div>
      )}
    </div>
  );
}
