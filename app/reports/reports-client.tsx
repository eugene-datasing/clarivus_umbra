"use client";

import { useState } from "react";
import {
  FileBarChart,
  Download,
  TrendingUp,
  Clock,
  FileText,
  Shield,
  BarChart3,
  X,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  SummaryStats,
  DetectionTypeUsageItem,
  RecentExport,
} from "@/lib/data/reports";
import type { AIMetrics } from "@/lib/data/ai-metrics";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

type ReportKey = "ai-accuracy" | "chain-of-custody";

interface ReportTemplate {
  key: ReportKey;
  name: string;
  description: string;
  icon: typeof Shield;
  format: string;
  needsCase: boolean;
}

const reportTemplates: ReportTemplate[] = [
  {
    key: "ai-accuracy",
    name: "AI Detection Accuracy",
    description:
      "False positive/negative rates, model governance metrics, and confidence score distributions.",
    icon: TrendingUp,
    format: "PDF",
    needsCase: false,
  },
  {
    key: "chain-of-custody",
    name: "Audit Timeline",
    description:
      "Per-document handling timeline sourced from the immutable audit trail — upload, processing, review, sign-off, export.",
    icon: FileText,
    format: "PDF",
    needsCase: true,
  },
];

export interface CaseOption {
  id: string;
  reference: string;
  name: string;
}

interface ReportsClientProps {
  stats: SummaryStats;
  typeUsage: DetectionTypeUsageItem[];
  recentExports: RecentExport[];
  aiMetrics: AIMetrics;
  cases: CaseOption[];
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const API_ROUTES: Record<ReportKey, string> = {
  "ai-accuracy": "/api/reports/ai-accuracy",
  "chain-of-custody": "/api/reports/chain-of-custody",
};

const FILE_NAMES: Record<ReportKey, string> = {
  "ai-accuracy": "ai-detection-accuracy.pdf",
  "chain-of-custody": "audit-timeline.pdf",
};

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function ReportsClient({
  stats,
  typeUsage,
  recentExports,
  aiMetrics,
  cases,
}: ReportsClientProps) {
  const [activeSection, setActiveSection] = useState<"templates" | "recent">("templates");
  const [caseSelectorOpen, setCaseSelectorOpen] = useState(false);
  const [activeReport, setActiveReport] = useState<ReportKey | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [generating, setGenerating] = useState(false);

  const summaryCards = [
    {
      label: "Total Batches",
      value: stats.totalBatches.toLocaleString(),
      sub: "all time",
      icon: FileText,
      color: "text-brand-primary bg-brand-primary/10",
    },
    {
      label: "Documents Processed",
      value: stats.documentsProcessed.toLocaleString(),
      sub: "all time",
      icon: BarChart3,
      color: "text-blue-600 bg-blue-50",
    },
    {
      label: "Total Detections",
      value: stats.totalDetections.toLocaleString(),
      sub: "pattern + AI",
      icon: Clock,
      color: "text-green-600 bg-green-50",
    },
  ];

  const precisionPct = aiMetrics.hasSufficientData
    ? `${(aiMetrics.precision * 100).toFixed(1)}%`
    : "--";
  const fpPct = aiMetrics.hasSufficientData && aiMetrics.totalReviewed > 0
    ? `${((aiMetrics.fp / aiMetrics.totalReviewed) * 100).toFixed(1)}%`
    : "--";

  /** Generate a report — for per-case reports, opens the case selector first. */
  function handleGenerateReport(key: ReportKey) {
    const tpl = reportTemplates.find((t) => t.key === key);
    if (!tpl) return;

    if (tpl.needsCase) {
      setActiveReport(key);
      setCaseSelectorOpen(true);
    } else {
      downloadReport(key);
    }
  }

  /** Download the PDF from the API route. */
  async function downloadReport(key: ReportKey, batchId?: string) {
    setGenerating(true);
    try {
      let url = API_ROUTES[key];
      if (batchId) url += `?batchId=${encodeURIComponent(batchId)}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to generate report");

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = FILE_NAMES[key];
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      setCaseSelectorOpen(false);
      setSelectedCaseId("");
      setActiveReport(null);
    } catch {
      alert("Failed to generate report. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  const activeReportTemplate = activeReport
    ? reportTemplates.find((t) => t.key === activeReport)
    : null;

  return (
    <div className="p-6 max-w-[1100px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-txt-primary">Reports</h1>
          <p className="text-sm text-txt-secondary mt-1">Analytics, compliance reporting, and audit exports</p>
        </div>
        <button
          className="btn-primary flex items-center gap-2"
          onClick={() => {
            setActiveSection("templates");
            setTimeout(() => {
              const el = document.getElementById("report-templates");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }, 50);
          }}
        >
          <FileBarChart size={15} />
          Generate Custom Report
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", card.color)}>
                  <Icon size={18} />
                </div>
              </div>
              <div className="text-2xl font-heading font-bold text-txt-primary">{card.value}</div>
              <div className="text-[11px] text-txt-secondary mt-0.5">{card.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Two-column layout: Ground usage + section toggle */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Detection type usage breakdown */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-txt-primary mb-3 flex items-center gap-2">
            <Shield size={14} className="text-brand-primary" />
            Detection Type Usage
          </h3>
          {typeUsage.length > 0 ? (
            <div className="space-y-2.5">
              {typeUsage.map((t) => (
                <div key={t.type}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-txt-primary font-medium font-mono">{t.type}</span>
                    <span className="text-txt-secondary">{t.count}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-primary/60 rounded-full"
                      style={{ width: `${t.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-txt-secondary">
              No accepted detections yet. Accept detections in the review UI to populate this chart.
            </p>
          )}
        </div>

        {/* Report templates / recent reports */}
        <div id="report-templates" className="lg:col-span-2 card p-0 overflow-hidden">
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveSection("templates")}
              className={cn(
                "px-4 py-2.5 text-xs font-medium border-b-2 transition-colors",
                activeSection === "templates"
                  ? "border-brand-primary text-brand-primary"
                  : "border-transparent text-txt-secondary hover:text-txt-primary"
              )}
            >
              Report Templates
              <span className={cn("ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]", activeSection === "templates" ? "bg-brand-primary/10 text-brand-primary" : "bg-gray-100 text-txt-secondary")}>
                {reportTemplates.length}
              </span>
            </button>
            <button
              onClick={() => setActiveSection("recent")}
              className={cn(
                "px-4 py-2.5 text-xs font-medium border-b-2 transition-colors",
                activeSection === "recent"
                  ? "border-brand-primary text-brand-primary"
                  : "border-transparent text-txt-secondary hover:text-txt-primary"
              )}
            >
              Recently Generated
              <span className={cn("ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]", activeSection === "recent" ? "bg-brand-primary/10 text-brand-primary" : "bg-gray-100 text-txt-secondary")}>
                {recentExports.length}
              </span>
            </button>
          </div>

          {activeSection === "templates" && (
            <div className="divide-y divide-border">
              {reportTemplates.map((tpl) => {
                const TplIcon = tpl.icon;
                return (
                  <div
                    key={tpl.key}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-surface-hover transition-colors cursor-pointer"
                    onClick={() => handleGenerateReport(tpl.key)}
                  >
                    <div className="w-9 h-9 rounded-lg bg-surface-bg flex items-center justify-center shrink-0">
                      <TplIcon size={16} className="text-txt-secondary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-txt-primary truncate">{tpl.name}</p>
                      <p className="text-[11px] text-txt-secondary mt-0.5 line-clamp-1">{tpl.description}</p>
                    </div>
                    <span className="badge bg-gray-100 text-txt-secondary text-[10px]">{tpl.format}</span>
                    <button
                      className="btn-ghost p-1.5 shrink-0"
                      title="Generate report"
                      onClick={(e) => { e.stopPropagation(); handleGenerateReport(tpl.key); }}
                    >
                      <Download size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {activeSection === "recent" && (
            <div className="divide-y divide-border">
              {recentExports.length > 0 ? (
                recentExports.map((rpt, idx) => (
                  <div key={idx} className="flex items-center gap-4 px-4 py-3 hover:bg-surface-hover transition-colors cursor-pointer">
                    <div className="w-9 h-9 rounded-lg bg-surface-bg flex items-center justify-center shrink-0">
                      <FileText size={16} className="text-txt-secondary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-txt-primary truncate">{rpt.description}</p>
                      <p className="text-[11px] text-txt-secondary mt-0.5">
                        Generated by {rpt.userName} on {rpt.date}
                      </p>
                    </div>
                    <button className="btn-ghost p-1.5 shrink-0" title="Download report">
                      <Download size={14} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="px-4 py-8 text-center text-sm text-txt-secondary">
                  No exports generated yet. Export packages from the case export page will appear here.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* AI Performance section */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-txt-primary mb-4 flex items-center gap-2">
          <TrendingUp size={14} className="text-brand-primary" />
          AI Detection Performance
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-surface-bg rounded-lg p-3 text-center">
            <div className={`text-xl font-heading font-bold ${aiMetrics.hasSufficientData ? "text-green-600" : "text-txt-secondary"}`}>{precisionPct}</div>
            <div className="text-[11px] text-txt-secondary mt-1">Precision</div>
          </div>
          <div className="bg-surface-bg rounded-lg p-3 text-center">
            <div className={`text-xl font-heading font-bold ${aiMetrics.hasSufficientData ? "text-amber-600" : "text-txt-secondary"}`}>{fpPct}</div>
            <div className="text-[11px] text-txt-secondary mt-1">False Positive Rate</div>
          </div>
          <div className="bg-surface-bg rounded-lg p-3 text-center">
            <div className="text-xl font-heading font-bold text-blue-600">{aiMetrics.aiDetections}</div>
            <div className="text-[11px] text-txt-secondary mt-1">AI Detections</div>
          </div>
          <div className="bg-surface-bg rounded-lg p-3 text-center">
            <div className="text-xl font-heading font-bold text-brand-primary">{aiMetrics.totalReviewed}</div>
            <div className="text-[11px] text-txt-secondary mt-1">Reviewed</div>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
          <p className="text-[11px] text-txt-secondary">
            Based on {stats.documentsProcessed.toLocaleString()} documents processed across {stats.totalBatches} batches. Model: Azure OpenAI GPT-4o.
            {!aiMetrics.hasSufficientData && " Requires at least 10 reviewed detections to compute accuracy metrics."}
          </p>
        </div>
      </div>

      {/* Case Selector Modal (shared for all per-case reports) */}
      {caseSelectorOpen && activeReportTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative">
            <button
              onClick={() => { setCaseSelectorOpen(false); setSelectedCaseId(""); setActiveReport(null); }}
              className="absolute top-3 right-3 btn-ghost p-1.5"
              title="Close"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-brand-primary/10 flex items-center justify-center">
                {(() => { const Icon = activeReportTemplate.icon; return <Icon size={18} className="text-brand-primary" />; })()}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-txt-primary">{activeReportTemplate.name}</h3>
                <p className="text-[11px] text-txt-secondary">Select a case to generate this report</p>
              </div>
            </div>

            <label className="block text-xs font-medium text-txt-primary mb-1.5">
              Select Case
            </label>
            <select
              value={selectedCaseId}
              onChange={(e) => setSelectedCaseId(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-txt-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30 mb-4"
            >
              <option value="">-- Choose a case --</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.reference} -- {c.name}
                </option>
              ))}
            </select>

            <button
              disabled={!selectedCaseId || generating}
              onClick={() => {
                if (!selectedCaseId || !activeReport) return;
                downloadReport(activeReport, selectedCaseId);
              }}
              className={cn(
                "w-full btn-primary flex items-center justify-center gap-2",
                (!selectedCaseId || generating) && "opacity-50 cursor-not-allowed"
              )}
            >
              {generating ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download size={14} />
                  Generate PDF
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
