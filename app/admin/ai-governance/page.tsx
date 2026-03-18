"use client";

import { cn } from "@/lib/utils";
import { Brain, Activity, Shield, CheckCircle } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Mock data                                                         */
/* ------------------------------------------------------------------ */

const overallStats = [
  { label: "Precision", value: "94.2%", color: "text-green-700", bg: "bg-green-50" },
  { label: "Recall", value: "91.8%", color: "text-blue-700", bg: "bg-blue-50" },
  { label: "F1 Score", value: "93.0%", color: "text-purple-700", bg: "bg-purple-50" },
  { label: "False Positive Rate", value: "5.8%", color: "text-amber-700", bg: "bg-amber-50" },
];

interface EntityAccuracy {
  entity: string;
  precision: string;
  recall: string;
  f1: string;
  sampleSize: number;
}

const entityAccuracy: EntityAccuracy[] = [
  { entity: "Personal Names", precision: "96.1%", recall: "93.4%", f1: "94.7%", sampleSize: 1245 },
  { entity: "Phone Numbers", precision: "99.2%", recall: "98.8%", f1: "99.0%", sampleSize: 423 },
  { entity: "Email Addresses", precision: "98.5%", recall: "97.2%", f1: "97.8%", sampleSize: 312 },
  { entity: "IRD Numbers", precision: "99.8%", recall: "99.1%", f1: "99.4%", sampleSize: 87 },
  { entity: "Addresses", precision: "89.3%", recall: "84.6%", f1: "86.9%", sampleSize: 534 },
  { entity: "Commercial Sensitivity", precision: "88.7%", recall: "82.1%", f1: "85.3%", sampleSize: 678 },
  { entity: "Free & Frank Opinions", precision: "82.4%", recall: "79.8%", f1: "81.1%", sampleSize: 445 },
  { entity: "Legal Privilege", precision: "91.2%", recall: "88.5%", f1: "89.8%", sampleSize: 198 },
];

const confidenceDistribution = [
  { label: "High (\u226585%)", value: 58, color: "bg-green-500" },
  { label: "Medium (50\u201384%)", value: 29, color: "bg-amber-400" },
  { label: "Low (<50%)", value: 13, color: "bg-red-400" },
];

/* ------------------------------------------------------------------ */
/*  Helper: color for F1 values                                       */
/* ------------------------------------------------------------------ */

function f1Color(f1: string): string {
  const num = parseFloat(f1);
  if (num >= 95) return "text-green-700 font-semibold";
  if (num >= 90) return "text-green-600";
  if (num >= 85) return "text-amber-600";
  return "text-red-600";
}

/* ------------------------------------------------------------------ */
/*  Page component                                                    */
/* ------------------------------------------------------------------ */

export default function AIGovernancePage() {
  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-txt-primary">
          AI Governance
        </h1>
        <p className="text-sm text-txt-secondary mt-1">
          Detection accuracy metrics and model performance
        </p>
      </div>

      {/* Overall stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {overallStats.map((stat) => (
          <div key={stat.label} className="card text-center">
            <p className="text-sm text-txt-secondary mb-1">{stat.label}</p>
            <p className={cn("text-3xl font-bold font-mono", stat.color)}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Accuracy by Entity Type */}
      <div className="card p-0 overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-heading font-semibold text-txt-primary">
            Accuracy by Entity Type
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-bg">
              <th className="text-left px-6 py-3 font-medium text-txt-secondary">Entity Type</th>
              <th className="text-right px-6 py-3 font-medium text-txt-secondary">Precision</th>
              <th className="text-right px-6 py-3 font-medium text-txt-secondary">Recall</th>
              <th className="text-right px-6 py-3 font-medium text-txt-secondary">F1</th>
              <th className="text-right px-6 py-3 font-medium text-txt-secondary">Sample Size</th>
            </tr>
          </thead>
          <tbody>
            {entityAccuracy.map((row) => (
              <tr
                key={row.entity}
                className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors"
              >
                <td className="px-6 py-3.5 font-medium text-txt-primary">{row.entity}</td>
                <td className="px-6 py-3.5 text-right font-mono text-txt-secondary">
                  {row.precision}
                </td>
                <td className="px-6 py-3.5 text-right font-mono text-txt-secondary">
                  {row.recall}
                </td>
                <td className={cn("px-6 py-3.5 text-right font-mono", f1Color(row.f1))}>
                  {row.f1}
                </td>
                <td className="px-6 py-3.5 text-right font-mono text-txt-secondary">
                  {row.sampleSize.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Confidence Score Distribution */}
      <div className="card mb-8">
        <h2 className="text-lg font-heading font-semibold text-txt-primary mb-4">
          Confidence Score Distribution
        </h2>
        <div className="space-y-4">
          {confidenceDistribution.map((band) => (
            <div key={band.label} className="flex items-center gap-4">
              <div className="w-40 text-sm font-medium text-txt-primary">
                {band.label}
              </div>
              <div className="flex-1">
                <div className="h-6 bg-gray-100 rounded overflow-hidden">
                  <div
                    className={cn("h-full rounded transition-all flex items-center justify-end pr-2", band.color)}
                    style={{ width: band.value + "%" }}
                  >
                    <span className="text-xs font-bold text-white">{band.value}%</span>
                  </div>
                </div>
              </div>
              <div className="w-12 text-right text-sm font-mono text-txt-secondary">
                {band.value}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Model Info Card */}
      <div className="card mb-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
            <Brain className="w-5 h-5 text-brand-primary" />
          </div>
          <div>
            <h2 className="text-lg font-heading font-semibold text-txt-primary mb-2">
              Model Information
            </h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <div className="text-txt-secondary">Provider</div>
              <div className="text-txt-primary font-medium">Azure OpenAI GPT-4o</div>
              <div className="text-txt-secondary">Version</div>
              <div className="text-txt-primary font-mono text-xs">2024-11-20</div>
              <div className="text-txt-secondary">Last updated</div>
              <div className="text-txt-primary">15 Mar 2026</div>
              <div className="text-txt-secondary">Training data</div>
              <div className="text-txt-primary">NZ Government document corpus (anonymised)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 text-xs text-txt-secondary bg-surface-bg border border-border rounded-card px-4 py-3">
        <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>
          All metrics are based on sample data for demonstration purposes. Production metrics will be
          calculated from validated review outcomes and updated on a rolling basis.
        </p>
      </div>
    </div>
  );
}
