"use client";

import { cn } from "@/lib/utils";
import { Clock, Zap, Brain, FileSearch } from "lucide-react";

interface DocumentTiming {
  id: string;
  name: string;
  fileType: string;
  status: string;
  pageCount: number;
  extractionMs: number | null;
  patternDetectionMs: number | null;
  aiDetectionMs: number | null;
  totalProcessingMs: number | null;
}

export interface ProcessingPerformanceProps {
  documents: DocumentTiming[];
  totalPages: number;
  avgTotalMs: number;
  totalProcessingMs: number;
}

function formatMs(ms: number | null): string {
  if (ms == null || ms === 0) return "--";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    ready: { label: "Ready", className: "bg-emerald-100 text-emerald-700" },
    processing: { label: "Processing", className: "bg-blue-100 text-blue-700" },
    queued: { label: "Queued", className: "bg-gray-100 text-gray-600" },
    pending: { label: "Pending", className: "bg-gray-100 text-gray-600" },
    error: { label: "Error", className: "bg-red-100 text-red-700" },
    "in-review": { label: "In Review", className: "bg-amber-100 text-amber-700" },
    submitted: { label: "Submitted", className: "bg-indigo-100 text-indigo-700" },
    approved: { label: "Approved", className: "bg-emerald-100 text-emerald-700" },
    released: { label: "Released", className: "bg-green-100 text-green-700" },
  };
  const cfg = map[status] || { label: status, className: "bg-gray-100 text-gray-600" };
  return (
    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap", cfg.className)}>
      {cfg.label}
    </span>
  );
}

function MiniTimingBar({
  extractionMs,
  patternMs,
  aiMs,
  totalMs,
}: {
  extractionMs: number | null;
  patternMs: number | null;
  aiMs: number | null;
  totalMs: number | null;
}) {
  if (!totalMs || totalMs === 0) return <span className="text-xs text-gray-400">--</span>;

  const extraction = extractionMs ?? 0;
  const pattern = patternMs ?? 0;
  const ai = aiMs ?? 0;
  const other = Math.max(totalMs - extraction - pattern - ai, 0);

  const pctExtraction = (extraction / totalMs) * 100;
  const pctPattern = (pattern / totalMs) * 100;
  const pctAi = (ai / totalMs) * 100;
  const pctOther = (other / totalMs) * 100;

  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 flex h-2.5 rounded-full overflow-hidden bg-gray-100">
        {pctExtraction > 0 && (
          <div
            className="bg-blue-400 h-full"
            style={{ width: `${pctExtraction}%` }}
            title={`Extraction: ${formatMs(extraction)}`}
          />
        )}
        {pctPattern > 0 && (
          <div
            className="bg-amber-400 h-full"
            style={{ width: `${pctPattern}%` }}
            title={`Patterns: ${formatMs(pattern)}`}
          />
        )}
        {pctAi > 0 && (
          <div
            className="bg-purple-400 h-full"
            style={{ width: `${pctAi}%` }}
            title={`AI: ${formatMs(ai)}`}
          />
        )}
        {pctOther > 0 && (
          <div
            className="bg-gray-300 h-full"
            style={{ width: `${pctOther}%` }}
            title={`Other: ${formatMs(other)}`}
          />
        )}
      </div>
    </div>
  );
}

export default function ProcessingPerformance({
  documents,
  totalPages,
  avgTotalMs,
  totalProcessingMs,
}: ProcessingPerformanceProps) {
  const processedCount = documents.filter((d) => d.totalProcessingMs != null).length;

  if (documents.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm mt-6 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4.5 h-4.5 text-purple-600" />
            <h3 className="text-sm font-semibold text-gray-900">
              Processing Performance
            </h3>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>{processedCount}/{documents.length} processed</span>
            <span>{totalPages} pages</span>
            <span>Avg: {formatMs(avgTotalMs)}</span>
            <span>Total: {formatMs(totalProcessingMs)}</span>
          </div>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-blue-400" />
            <span className="text-[10px] text-gray-500">Extraction</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-amber-400" />
            <span className="text-[10px] text-gray-500">Patterns</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-purple-400" />
            <span className="text-[10px] text-gray-500">AI Detection</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-gray-300" />
            <span className="text-[10px] text-gray-500">Other</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">
                Document
              </th>
              <th className="text-center px-3 py-2 text-xs font-medium text-gray-500">
                Status
              </th>
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">
                Pages
              </th>
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">
                <span className="inline-flex items-center gap-1"><FileSearch className="w-3 h-3" /> Extract</span>
              </th>
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">
                <span className="inline-flex items-center gap-1"><Zap className="w-3 h-3" /> Patterns</span>
              </th>
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">
                <span className="inline-flex items-center gap-1"><Brain className="w-3 h-3" /> AI</span>
              </th>
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">
                Total
              </th>
              <th className="px-3 py-2 text-xs font-medium text-gray-500">
                Breakdown
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {documents.map((doc) => (
              <tr key={doc.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-2.5 max-w-[220px]">
                  <div className="truncate text-gray-900 font-medium text-xs">
                    {doc.name}
                  </div>
                  <div className="text-[10px] text-gray-400 uppercase">
                    {doc.fileType}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-center">
                  {statusBadge(doc.status)}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-600 tabular-nums text-xs">
                  {doc.pageCount}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-600 tabular-nums text-xs">
                  {formatMs(doc.extractionMs)}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-600 tabular-nums text-xs">
                  {formatMs(doc.patternDetectionMs)}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-600 tabular-nums text-xs">
                  {formatMs(doc.aiDetectionMs)}
                </td>
                <td className="px-3 py-2.5 text-right font-medium text-gray-900 tabular-nums text-xs">
                  {formatMs(doc.totalProcessingMs)}
                </td>
                <td className="px-3 py-2.5">
                  <MiniTimingBar
                    extractionMs={doc.extractionMs}
                    patternMs={doc.patternDetectionMs}
                    aiMs={doc.aiDetectionMs}
                    totalMs={doc.totalProcessingMs}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
