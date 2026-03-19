"use client";

import { useState } from "react";
import {
  FileBarChart,
  Download,
  Calendar,
  TrendingUp,
  Clock,
  FileText,
  Shield,
  BarChart3,
  PieChart,
  Users,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SummaryStats, GroundUsageItem, RecentExport } from "@/lib/data/reports";
import type { AIMetrics } from "@/lib/data/ai-metrics";

/* -------------------------------------------------------------------------- */
/*  Static data (report templates)                                             */
/* -------------------------------------------------------------------------- */

const reportTemplates = [
  { name: "LGOIMA Compliance Summary", description: "Statutory compliance metrics, response times, and withholding ground usage across all cases.", icon: Shield, format: "PDF" },
  { name: "AI Detection Accuracy", description: "False positive/negative rates, model governance metrics, and confidence score distributions.", icon: TrendingUp, format: "PDF" },
  { name: "Chain of Custody Report", description: "Immutable audit trail export — user actions, timestamps, and document access history.", icon: FileText, format: "CSV/PDF" },
  { name: "Reviewer Workload Analysis", description: "Cases per reviewer, average review time, approval rates, and queue depth over time.", icon: Users, format: "PDF" },
  { name: "Cost Recovery Report", description: "Processing costs, time allocation, and charge-back calculations per LGOIMA request.", icon: PieChart, format: "XLSX" },
  { name: "Withholding Schedule Export", description: "Consolidated withholding schedules with statutory grounds and reasoning for Ombudsman review.", icon: Calendar, format: "PDF" },
];

/* -------------------------------------------------------------------------- */
/*  Props                                                                      */
/* -------------------------------------------------------------------------- */

interface ReportsClientProps {
  stats: SummaryStats;
  groundUsage: GroundUsageItem[];
  recentExports: RecentExport[];
  aiMetrics: AIMetrics;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function ReportsClient({
  stats,
  groundUsage,
  recentExports,
  aiMetrics,
}: ReportsClientProps) {
  const [activeSection, setActiveSection] = useState<"templates" | "recent">("templates");

  const summaryCards = [
    {
      label: "Total Cases",
      value: stats.totalCases.toLocaleString(),
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
    {
      label: "Compliance Rate",
      value: `${stats.complianceRate}%`,
      sub: "statutory deadlines met",
      icon: Shield,
      color: "text-purple-600 bg-purple-50",
    },
  ];

  const precisionPct = aiMetrics.hasSufficientData
    ? `${(aiMetrics.precision * 100).toFixed(1)}%`
    : "94.7%";
  const fpPct = aiMetrics.hasSufficientData && aiMetrics.totalReviewed > 0
    ? `${((aiMetrics.fp / aiMetrics.totalReviewed) * 100).toFixed(1)}%`
    : "5.3%";
  const avgConfidence = aiMetrics.hasSufficientData
    ? `${aiMetrics.confidenceDistribution[0]?.percentage ?? 0}%`
    : "87.2%";

  return (
    <div className="p-6 max-w-[1100px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-txt-primary">Reports</h1>
          <p className="text-sm text-txt-secondary mt-1">Analytics, compliance reporting, and audit exports</p>
        </div>
        <button className="btn-primary flex items-center gap-2">
          <FileBarChart size={15} />
          Generate Custom Report
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
        {/* Withholding ground usage breakdown */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-txt-primary mb-3 flex items-center gap-2">
            <Shield size={14} className="text-brand-primary" />
            Withholding Ground Usage
          </h3>
          {groundUsage.length > 0 ? (
            <div className="space-y-2.5">
              {groundUsage.map((g) => (
                <div key={g.ground}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-txt-primary font-medium">
                      <span className="font-mono text-txt-secondary">{g.ground}</span>{" "}
                      <span className="text-txt-secondary font-normal">{g.label}</span>
                    </span>
                    <span className="text-txt-secondary">{g.count}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-primary/60 rounded-full" style={{ width: `${g.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-txt-secondary">No withholding data yet. Accept detections with grounds to populate this chart.</p>
          )}
        </div>

        {/* Report templates / recent reports */}
        <div className="lg:col-span-2 card p-0 overflow-hidden">
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
                  <div key={tpl.name} className="flex items-center gap-4 px-4 py-3 hover:bg-surface-hover transition-colors cursor-pointer">
                    <div className="w-9 h-9 rounded-lg bg-surface-bg flex items-center justify-center shrink-0">
                      <TplIcon size={16} className="text-txt-secondary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-txt-primary truncate">{tpl.name}</p>
                      <p className="text-[11px] text-txt-secondary mt-0.5 line-clamp-1">{tpl.description}</p>
                    </div>
                    <span className="badge bg-gray-100 text-txt-secondary text-[10px]">{tpl.format}</span>
                    <button className="btn-ghost p-1.5 shrink-0" title="Generate report">
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
            <div className="text-xl font-heading font-bold text-green-600">{precisionPct}</div>
            <div className="text-[11px] text-txt-secondary mt-1">Precision</div>
          </div>
          <div className="bg-surface-bg rounded-lg p-3 text-center">
            <div className="text-xl font-heading font-bold text-amber-600">{fpPct}</div>
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
            Based on {stats.documentsProcessed.toLocaleString()} documents processed across {stats.totalCases} cases. Model: Azure OpenAI GPT-4o.
            {!aiMetrics.hasSufficientData && " Sample metrics shown — will update as reviews accumulate."}
          </p>
        </div>
      </div>
    </div>
  );
}
