"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronDown, FileText } from "lucide-react";

export interface BatchData {
  id: string;
  reference: string;
  name: string;
  status: string;
  documentCount: number;
  redactionCount: number;
}

export interface DocStats {
  id: string;
  name: string;
  status: string;
  pageCount: number;
  detectionCount: number;
  typeCounts: Record<string, number>;
  statusCounts: Record<string, number>;
}

export interface StatsClientProps {
  batchData: BatchData;
  knownTypes: string[];
  typeCountsBatch: Record<string, number>;
  statusCountsBatch: Record<string, number>;
  docStats: DocStats[];
}

const TYPE_LABELS: Record<string, string> = {
  "personal-name": "Personal name",
  phone: "Phone",
  "email-addr": "Email",
  ird: "IRD",
  address: "Address",
  "bank-account": "Bank account",
  "nz-passport": "NZ passport",
  "nz-driver-licence": "NZ driver licence",
  "vehicle-reg": "Vehicle reg",
  nhi: "NHI",
  "sensitive-context": "Sensitive context",
  manual: "Manual",
};

const STATUS_LABELS: Record<string, string> = {
  accepted: "Auto-accepted",
  pending: "In tray",
  rejected: "Suppressed",
};

const STATUS_COLORS: Record<string, string> = {
  accepted: "bg-emerald-500",
  pending: "bg-amber-500",
  rejected: "bg-gray-400",
};

function CountBar({
  label,
  count,
  total,
  colorClass,
}: {
  label: string;
  count: number;
  total: number;
  colorClass: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="grid grid-cols-[140px_1fr_60px] gap-3 items-center text-sm">
      <span className="text-txt-secondary truncate">{label}</span>
      <div
        className="h-3 bg-gray-100 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${count} of ${total}`}
      >
        <div
          className={cn("h-full rounded-full transition-all", colorClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-txt-secondary text-right font-mono">
        {count}
      </span>
    </div>
  );
}

const tabs = [
  { label: "Documents", href: "" },
  { label: "Stats", href: "stats" },
  { label: "Audit Trail", href: "audit" },
  { label: "Export", href: "export" },
];

export default function StatsClient({
  batchData,
  knownTypes,
  typeCountsBatch,
  statusCountsBatch,
  docStats,
}: StatsClientProps) {
  const [openDocId, setOpenDocId] = useState<string | null>(null);

  const totalDetections =
    statusCountsBatch.accepted +
    statusCountsBatch.pending +
    statusCountsBatch.rejected;
  const typeMax = Math.max(1, ...knownTypes.map((t) => typeCountsBatch[t] ?? 0));

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-txt-secondary mb-6">
        <Link href="/batches" className="hover:text-brand-primary transition-colors">
          Batches
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link
          href={`/batches/${batchData.id}`}
          className="hover:text-brand-primary transition-colors font-mono"
        >
          {batchData.reference}
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-txt-primary font-medium">Stats</span>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 border-b border-border mb-6">
        {tabs.map((tab) => {
          const isActive = tab.href === "stats";
          const href = tab.href
            ? `/batches/${batchData.id}/${tab.href}`
            : `/batches/${batchData.id}`;
          return (
            <Link
              key={tab.label}
              href={href}
              className={cn(
                "px-4 py-2.5 text-sm font-medium transition-colors -mb-px",
                isActive
                  ? "text-brand-primary border-b-2 border-brand-primary"
                  : "text-txt-secondary hover:text-txt-primary",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Per-batch summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="card">
          <h2 className="text-sm font-heading font-semibold text-txt-primary mb-3">
            Detections by type
          </h2>
          <p className="text-xs text-txt-secondary mb-4">
            {totalDetections} detection{totalDetections === 1 ? "" : "s"} across {batchData.documentCount} document{batchData.documentCount === 1 ? "" : "s"}.
          </p>
          <div className="space-y-2">
            {knownTypes.map((type) => (
              <CountBar
                key={type}
                label={TYPE_LABELS[type] ?? type}
                count={typeCountsBatch[type] ?? 0}
                total={typeMax}
                colorClass="bg-brand-primary"
              />
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="text-sm font-heading font-semibold text-txt-primary mb-3">
            Tier distribution
          </h2>
          <p className="text-xs text-txt-secondary mb-4">
            Auto-accepted detections went straight into the redaction set;
            the tray collected medium-confidence ones for review;
            suppressed sat below threshold and were captured in the audit
            trail only.
          </p>
          <div className="space-y-2">
            {(["accepted", "pending", "rejected"] as const).map((status) => (
              <CountBar
                key={status}
                label={STATUS_LABELS[status]}
                count={statusCountsBatch[status] ?? 0}
                total={Math.max(1, totalDetections)}
                colorClass={STATUS_COLORS[status]}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Per-doc breakdown */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-surface-bg/50">
          <h2 className="text-sm font-heading font-semibold text-txt-primary">
            Per-document breakdown
          </h2>
        </div>
        {docStats.length === 0 ? (
          <div className="px-5 py-6 text-sm text-txt-secondary italic">
            No active documents in this batch yet.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {docStats.map((doc) => {
              const isOpen = openDocId === doc.id;
              const docTypeMax = Math.max(
                1,
                ...knownTypes.map((t) => doc.typeCounts[t] ?? 0),
              );
              const docTotal =
                doc.statusCounts.accepted +
                doc.statusCounts.pending +
                doc.statusCounts.rejected;
              return (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => setOpenDocId(isOpen ? null : doc.id)}
                    className="w-full px-5 py-3 flex items-center gap-3 hover:bg-surface-hover transition-colors text-left"
                    aria-expanded={isOpen}
                    aria-controls={`doc-stats-${doc.id}`}
                  >
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-txt-secondary flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-txt-secondary flex-shrink-0" />
                    )}
                    <FileText className="w-4 h-4 text-txt-secondary flex-shrink-0" />
                    <span className="font-medium text-sm text-txt-primary truncate flex-1">
                      {doc.name}
                    </span>
                    <span className="text-xs text-txt-secondary">
                      {doc.pageCount}p
                    </span>
                    <span className="text-xs text-txt-secondary font-mono">
                      {doc.detectionCount} detection
                      {doc.detectionCount === 1 ? "" : "s"}
                    </span>
                  </button>
                  {isOpen && (
                    <div
                      id={`doc-stats-${doc.id}`}
                      className="px-5 py-4 bg-surface-bg/30 grid grid-cols-1 lg:grid-cols-2 gap-6"
                    >
                      <div>
                        <h3 className="text-xs font-medium text-txt-secondary uppercase tracking-wider mb-2">
                          By type
                        </h3>
                        <div className="space-y-1.5">
                          {knownTypes.map((type) => (
                            <CountBar
                              key={type}
                              label={TYPE_LABELS[type] ?? type}
                              count={doc.typeCounts[type] ?? 0}
                              total={docTypeMax}
                              colorClass="bg-brand-primary"
                            />
                          ))}
                        </div>
                      </div>
                      <div>
                        <h3 className="text-xs font-medium text-txt-secondary uppercase tracking-wider mb-2">
                          By tier
                        </h3>
                        <div className="space-y-1.5">
                          {(["accepted", "pending", "rejected"] as const).map(
                            (status) => (
                              <CountBar
                                key={status}
                                label={STATUS_LABELS[status]}
                                count={doc.statusCounts[status] ?? 0}
                                total={Math.max(1, docTotal)}
                                colorClass={STATUS_COLORS[status]}
                              />
                            ),
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
