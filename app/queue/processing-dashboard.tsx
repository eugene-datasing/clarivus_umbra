"use client";

import { cn, formatDateTime } from "@/lib/utils";
import {
  Activity,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Gauge,
  FileText,
} from "lucide-react";

interface RecentDocument {
  id: string;
  name: string;
  caseReference: string;
  status: string;
  pageCount: number;
  extractionMs: number | null;
  patternDetectionMs: number | null;
  aiDetectionMs: number | null;
  totalProcessingMs: number | null;
  processingCompletedAt: string | null;
}

export interface ProcessingDashboardProps {
  totalDocuments: number;
  totalProcessed: number;
  totalFailed: number;
  totalPending: number;
  avgExtractionMs: number;
  avgPatternMs: number;
  avgAiMs: number;
  avgTotalMs: number;
  throughputPagesPerHour: number;
  recentDocuments: RecentDocument[];
}

function formatMs(ms: number | null): string {
  if (ms == null || ms === 0) return "--";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function TimingBar({
  label,
  value,
  maxValue,
  color,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
}) {
  const pct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-txt-secondary w-[80px] text-right shrink-0">
        {label}
      </span>
      <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden relative">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-medium text-gray-700">
          {formatMs(value)}
        </span>
      </div>
    </div>
  );
}

export default function ProcessingDashboard({
  totalDocuments,
  totalProcessed,
  totalFailed,
  totalPending,
  avgExtractionMs,
  avgPatternMs,
  avgAiMs,
  avgTotalMs,
  throughputPagesPerHour,
  recentDocuments,
}: ProcessingDashboardProps) {
  const summaryCards = [
    {
      label: "Processed",
      value: totalProcessed,
      icon: CheckCircle2,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Pending",
      value: totalPending,
      icon: Loader2,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Failed",
      value: totalFailed,
      icon: AlertTriangle,
      color: "text-red-600",
      bg: "bg-red-50",
    },
    {
      label: "Avg Time",
      value: formatMs(avgTotalMs),
      icon: Clock,
      color: "text-brand-600",
      bg: "bg-brand-50",
      isText: true,
    },
  ];

  return (
    <div className="space-y-6 mb-8">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-brand-primary" />
          <h2 className="text-lg font-heading font-semibold text-txt-primary">
            Processing Dashboard
          </h2>
        </div>
        <span className="text-xs text-txt-secondary">
          {totalDocuments} total documents
        </span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="card px-4 py-3 flex items-center gap-3"
            >
              <div
                className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                  card.bg,
                )}
              >
                <Icon className={cn("w-4.5 h-4.5", card.color)} />
              </div>
              <div>
                <div className="text-xs text-txt-secondary">{card.label}</div>
                <div className="text-lg font-semibold text-txt-primary">
                  {"isText" in card ? card.value : card.value.toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Timing Breakdown + Throughput */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Timing Breakdown */}
        <div className="card p-5 md:col-span-2">
          <h3 className="text-sm font-semibold text-txt-primary mb-4">
            Average Processing Time Breakdown
          </h3>
          <div className="space-y-3">
            <TimingBar
              label="Extraction"
              value={avgExtractionMs}
              maxValue={avgTotalMs}
              color="bg-blue-400"
            />
            <TimingBar
              label="Patterns"
              value={avgPatternMs}
              maxValue={avgTotalMs}
              color="bg-amber-400"
            />
            <TimingBar
              label="AI Detection"
              value={avgAiMs}
              maxValue={avgTotalMs}
              color="bg-brand-400"
            />
            <TimingBar
              label="Total"
              value={avgTotalMs}
              maxValue={avgTotalMs}
              color="bg-gray-400"
            />
          </div>
        </div>

        {/* Processing Rate */}
        <div className="card p-5 flex flex-col items-center justify-center text-center">
          <Gauge className="w-8 h-8 text-brand-primary mb-2" />
          <div className="text-3xl font-bold text-txt-primary">
            {throughputPagesPerHour.toLocaleString()}
          </div>
          <div className="text-xs text-txt-secondary mt-1">
            pages / hour (last 24h)
          </div>
          <div className="mt-3 text-xs text-txt-secondary">
            Processing Rate
          </div>
        </div>
      </div>

      {/* Recent Documents Table */}
      {recentDocuments.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <FileText className="w-4 h-4 text-txt-secondary" />
            <h3 className="text-sm font-semibold text-txt-primary">
              Recently Processed Documents
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-bg/50">
                  <th className="text-left px-4 py-2 text-xs font-medium text-txt-secondary">
                    Document
                  </th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-txt-secondary">
                    Case
                  </th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-txt-secondary">
                    Pages
                  </th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-txt-secondary">
                    Extraction
                  </th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-txt-secondary">
                    Patterns
                  </th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-txt-secondary">
                    AI
                  </th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-txt-secondary">
                    Total
                  </th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-txt-secondary">
                    Completed
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentDocuments.map((doc) => (
                  <tr
                    key={doc.id}
                    className="hover:bg-surface-hover transition-colors"
                  >
                    <td className="px-4 py-2.5 text-txt-primary font-medium max-w-[200px] truncate">
                      {doc.name}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs text-brand-primary">
                        {doc.caseReference}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-txt-secondary tabular-nums">
                      {doc.pageCount}
                    </td>
                    <td className="px-4 py-2.5 text-right text-txt-secondary tabular-nums">
                      {formatMs(doc.extractionMs)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-txt-secondary tabular-nums">
                      {formatMs(doc.patternDetectionMs)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-txt-secondary tabular-nums">
                      {formatMs(doc.aiDetectionMs)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-txt-primary tabular-nums">
                      {formatMs(doc.totalProcessingMs)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-txt-secondary whitespace-nowrap">
                      {doc.processingCompletedAt
                        ? formatDateTime(doc.processingCompletedAt)
                        : "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
