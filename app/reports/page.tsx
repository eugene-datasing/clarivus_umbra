"use client";

import { useState } from "react";
import {
  FileBarChart,
  Download,
  Calendar,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertTriangle,
  FileText,
  Shield,
  BarChart3,
  PieChart,
  Users,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Mock data                                                                  */
/* -------------------------------------------------------------------------- */

const summaryCards = [
  {
    label: "Total Cases",
    value: "127",
    change: "+12",
    trend: "up" as const,
    sub: "this quarter",
    icon: FileText,
    color: "text-brand-primary bg-brand-primary/10",
  },
  {
    label: "Documents Processed",
    value: "4,831",
    change: "+347",
    trend: "up" as const,
    sub: "this month",
    icon: BarChart3,
    color: "text-blue-600 bg-blue-50",
  },
  {
    label: "Avg. Processing Time",
    value: "2.4 hrs",
    change: "-18%",
    trend: "down" as const,
    sub: "vs last quarter",
    icon: Clock,
    color: "text-green-600 bg-green-50",
  },
  {
    label: "Compliance Rate",
    value: "99.2%",
    change: "+0.4%",
    trend: "up" as const,
    sub: "statutory deadlines met",
    icon: Shield,
    color: "text-purple-600 bg-purple-50",
  },
];

const reportTemplates = [
  {
    name: "LGOIMA Compliance Summary",
    description: "Statutory compliance metrics, response times, and withholding ground usage across all cases.",
    icon: Shield,
    format: "PDF",
    lastGenerated: "14 Mar 2026",
  },
  {
    name: "AI Detection Accuracy",
    description: "False positive/negative rates, model governance metrics, and confidence score distributions.",
    icon: TrendingUp,
    format: "PDF",
    lastGenerated: "12 Mar 2026",
  },
  {
    name: "Chain of Custody Report",
    description: "Immutable audit trail export — user actions, timestamps, and document access history.",
    icon: FileText,
    format: "CSV/PDF",
    lastGenerated: "10 Mar 2026",
  },
  {
    name: "Reviewer Workload Analysis",
    description: "Cases per reviewer, average review time, approval rates, and queue depth over time.",
    icon: Users,
    format: "PDF",
    lastGenerated: "8 Mar 2026",
  },
  {
    name: "Cost Recovery Report",
    description: "Processing costs, time allocation, and charge-back calculations per LGOIMA request.",
    icon: PieChart,
    format: "XLSX",
    lastGenerated: "5 Mar 2026",
  },
  {
    name: "Withholding Schedule Export",
    description: "Consolidated withholding schedules with statutory grounds and reasoning for Ombudsman review.",
    icon: Calendar,
    format: "PDF",
    lastGenerated: "14 Mar 2026",
  },
];

const recentReports = [
  { name: "LGOIMA Compliance Summary — Q1 2026", generatedBy: "A. Richardson", date: "14 Mar 2026", format: "PDF", size: "2.4 MB" },
  { name: "AI Detection Accuracy — March 2026", generatedBy: "System (Scheduled)", date: "12 Mar 2026", format: "PDF", size: "1.8 MB" },
  { name: "Chain of Custody — LGOIMA-2026-038", generatedBy: "K. Williams", date: "10 Mar 2026", format: "PDF", size: "890 KB" },
  { name: "Reviewer Workload — February 2026", generatedBy: "System (Scheduled)", date: "8 Mar 2026", format: "PDF", size: "1.2 MB" },
  { name: "Cost Recovery — LGOIMA-2026-035", generatedBy: "A. Richardson", date: "5 Mar 2026", format: "XLSX", size: "340 KB" },
];

const groundUsage = [
  { ground: "s7(2)(a)", label: "Privacy of natural persons", count: 312, pct: 38 },
  { ground: "s7(2)(b)(ii)", label: "Commercial prejudice", count: 187, pct: 23 },
  { ground: "s7(2)(f)(i)", label: "Free and frank opinions", count: 134, pct: 16 },
  { ground: "s7(2)(g)", label: "Legal privilege", count: 89, pct: 11 },
  { ground: "s6(a)", label: "National security", count: 52, pct: 6 },
  { ground: "Other", label: "Various s6/s7/s17 grounds", count: 49, pct: 6 },
];

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function ReportsPage() {
  const [activeSection, setActiveSection] = useState<"templates" | "recent">("templates");

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
                <span className={cn(
                  "flex items-center gap-0.5 text-xs font-medium",
                  card.trend === "up" && card.label !== "Avg. Processing Time" ? "text-green-600" : "text-green-600",
                )}>
                  {card.trend === "up" && card.label !== "Avg. Processing Time" ? (
                    <ArrowUpRight size={12} />
                  ) : (
                    <ArrowDownRight size={12} />
                  )}
                  {card.change}
                </span>
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
                  <div
                    className="h-full bg-brand-primary/60 rounded-full"
                    style={{ width: `${g.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Report templates / recent reports */}
        <div className="lg:col-span-2 card p-0 overflow-hidden">
          {/* Section toggle */}
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
              <span className={cn(
                "ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]",
                activeSection === "templates" ? "bg-brand-primary/10 text-brand-primary" : "bg-gray-100 text-txt-secondary"
              )}>
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
              <span className={cn(
                "ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]",
                activeSection === "recent" ? "bg-brand-primary/10 text-brand-primary" : "bg-gray-100 text-txt-secondary"
              )}>
                {recentReports.length}
              </span>
            </button>
          </div>

          {/* Templates list */}
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
                    <div className="text-right shrink-0">
                      <span className="badge bg-gray-100 text-txt-secondary text-[10px]">{tpl.format}</span>
                      <p className="text-[10px] text-txt-secondary mt-1">Last: {tpl.lastGenerated}</p>
                    </div>
                    <button className="btn-ghost p-1.5 shrink-0" title="Generate report">
                      <Download size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent reports list */}
          {activeSection === "recent" && (
            <div className="divide-y divide-border">
              {recentReports.map((rpt, idx) => (
                <div key={idx} className="flex items-center gap-4 px-4 py-3 hover:bg-surface-hover transition-colors cursor-pointer">
                  <div className="w-9 h-9 rounded-lg bg-surface-bg flex items-center justify-center shrink-0">
                    <FileText size={16} className="text-txt-secondary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-txt-primary truncate">{rpt.name}</p>
                    <p className="text-[11px] text-txt-secondary mt-0.5">
                      Generated by {rpt.generatedBy} on {rpt.date}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="badge bg-gray-100 text-txt-secondary text-[10px]">{rpt.format}</span>
                    <p className="text-[10px] text-txt-secondary mt-1">{rpt.size}</p>
                  </div>
                  <button className="btn-ghost p-1.5 shrink-0" title="Download report">
                    <Download size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AI Accuracy metrics section */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-txt-primary mb-4 flex items-center gap-2">
          <TrendingUp size={14} className="text-brand-primary" />
          AI Detection Performance — Last 30 Days
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-surface-bg rounded-lg p-3 text-center">
            <div className="text-xl font-heading font-bold text-green-600">94.7%</div>
            <div className="text-[11px] text-txt-secondary mt-1">True Positive Rate</div>
            <div className="text-[10px] text-green-600 mt-0.5 flex items-center justify-center gap-0.5">
              <ArrowUpRight size={10} /> +1.2%
            </div>
          </div>
          <div className="bg-surface-bg rounded-lg p-3 text-center">
            <div className="text-xl font-heading font-bold text-amber-600">5.3%</div>
            <div className="text-[11px] text-txt-secondary mt-1">False Positive Rate</div>
            <div className="text-[10px] text-green-600 mt-0.5 flex items-center justify-center gap-0.5">
              <ArrowDownRight size={10} /> -0.8%
            </div>
          </div>
          <div className="bg-surface-bg rounded-lg p-3 text-center">
            <div className="text-xl font-heading font-bold text-blue-600">2.1%</div>
            <div className="text-[11px] text-txt-secondary mt-1">False Negative Rate</div>
            <div className="text-[10px] text-green-600 mt-0.5 flex items-center justify-center gap-0.5">
              <ArrowDownRight size={10} /> -0.3%
            </div>
          </div>
          <div className="bg-surface-bg rounded-lg p-3 text-center">
            <div className="text-xl font-heading font-bold text-brand-primary">87.2%</div>
            <div className="text-[11px] text-txt-secondary mt-1">Avg. Confidence Score</div>
            <div className="text-[10px] text-green-600 mt-0.5 flex items-center justify-center gap-0.5">
              <ArrowUpRight size={10} /> +2.1%
            </div>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
          <p className="text-[11px] text-txt-secondary">
            Based on 4,831 documents processed across 127 cases. Model: Azure OpenAI GPT-4o (v2026-02).
          </p>
          <button className="btn-ghost text-xs flex items-center gap-1">
            <Download size={12} />
            Export Metrics
          </button>
        </div>
      </div>
    </div>
  );
}
