"use client";

import { cn } from "@/lib/utils";
import { Brain, Shield, AlertTriangle, BarChart3 } from "lucide-react";
import type { AIMetrics } from "@/lib/data/ai-metrics";
import type { FalseNegativeMetrics } from "@/lib/pipeline/feedback-examples";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface ModelConfig {
  deployment: string | null;
  endpointConfigured: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function f1Color(value: number): string {
  if (value >= 0.95) return "text-green-700 font-semibold";
  if (value >= 0.90) return "text-green-600";
  if (value >= 0.85) return "text-amber-600";
  return "text-red-600";
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

interface Props {
  metrics: AIMetrics;
  fnMetrics: FalseNegativeMetrics;
  modelConfig: ModelConfig;
}

export default function AIGovernanceClient({ metrics, fnMetrics, modelConfig }: Props) {
  const hasSufficientData = metrics.hasSufficientData;

  const overallStats = [
    { label: "Precision", value: pct(metrics.precision), color: "text-green-700", bg: "bg-green-50" },
    { label: "Total AI Detections", value: metrics.aiDetections.toString(), color: "text-blue-700", bg: "bg-blue-50" },
    { label: "Reviewed", value: metrics.totalReviewed.toString(), color: "text-purple-700", bg: "bg-purple-50" },
    { label: "False Positive Rate", value: pct(metrics.totalReviewed > 0 ? metrics.fp / metrics.totalReviewed : 0), color: "text-amber-700", bg: "bg-amber-50" },
  ];

  const confDistribution = metrics.confidenceDistribution.map((b, i) => ({
    label: b.label,
    value: b.percentage,
    color: ["bg-green-500", "bg-amber-400", "bg-red-400"][i],
  }));

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-txt-primary">AI Governance</h1>
        <p className="text-sm text-txt-secondary mt-1">
          Detection accuracy metrics and model performance
        </p>
      </div>

      {!hasSufficientData && (
        <div className="card mb-8 text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-8 h-8 text-amber-500" />
          </div>
          <h2 className="text-lg font-heading font-semibold text-txt-primary mb-2">
            Insufficient Review Data
          </h2>
          <p className="text-sm text-txt-secondary max-w-md mx-auto mb-4">
            Fewer than 10 AI detections have been reviewed. Accuracy metrics require
            a minimum sample of accepted and rejected detections to produce meaningful results.
          </p>
          <div className="flex items-center justify-center gap-6 text-sm">
            <div className="text-center">
              <div className="text-2xl font-bold font-mono text-txt-primary">{metrics.totalReviewed}</div>
              <div className="text-xs text-txt-secondary">Reviewed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold font-mono text-txt-primary">10</div>
              <div className="text-xs text-txt-secondary">Required</div>
            </div>
          </div>
          <div className="mt-6 mx-auto max-w-xs">
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full transition-all"
                style={{ width: `${Math.min((metrics.totalReviewed / 10) * 100, 100)}%` }}
              />
            </div>
            <p className="text-[11px] text-txt-secondary mt-1">
              {metrics.totalReviewed}/10 reviews completed
            </p>
          </div>
        </div>
      )}

      {hasSufficientData && (
        <>
          {/* Overall stat cards */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            {overallStats.map((stat) => (
              <div key={stat.label} className="card text-center">
                <p className="text-sm text-txt-secondary mb-1">{stat.label}</p>
                <p className={cn("text-3xl font-bold font-mono", stat.color)}>{stat.value}</p>
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
                  <th className="text-right px-6 py-3 font-medium text-txt-secondary">Accepted</th>
                  <th className="text-right px-6 py-3 font-medium text-txt-secondary">Rejected</th>
                  <th className="text-right px-6 py-3 font-medium text-txt-secondary">Sample Size</th>
                </tr>
              </thead>
              <tbody>
                {metrics.entityBreakdown.map((row) => (
                  <tr key={row.entity} className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors">
                    <td className="px-6 py-3.5 font-medium text-txt-primary">{row.entity}</td>
                    <td className={cn("px-6 py-3.5 text-right font-mono", f1Color(row.precision))}>{pct(row.precision)}</td>
                    <td className="px-6 py-3.5 text-right font-mono text-green-600">{row.tp}</td>
                    <td className="px-6 py-3.5 text-right font-mono text-red-600">{row.fp}</td>
                    <td className="px-6 py-3.5 text-right font-mono text-txt-secondary">{row.sampleSize}</td>
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
              {confDistribution.map((band) => (
                <div key={band.label} className="flex items-center gap-4">
                  <div className="w-40 text-sm font-medium text-txt-primary">{band.label}</div>
                  <div className="flex-1">
                    <div className="h-6 bg-gray-100 rounded overflow-hidden">
                      <div
                        className={cn("h-full rounded transition-all flex items-center justify-end pr-2", band.color)}
                        style={{ width: Math.max(band.value, 2) + "%" }}
                      >
                        {band.value >= 10 && (
                          <span className="text-xs font-bold text-white">{band.value}%</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="w-12 text-right text-sm font-mono text-txt-secondary">{band.value}%</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* False Negative Rate (WP22) */}
      <div className="card mb-8">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-heading font-semibold text-txt-primary">
            AI Miss Analysis (False Negatives)
          </h2>
        </div>

        {fnMetrics.totalManual === 0 ? (
          <p className="text-sm text-txt-secondary">
            No manual detections recorded yet. When reviewers add detections the AI missed,
            false negative metrics will appear here.
          </p>
        ) : (
          <>
            {/* Overall FN rate */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center p-4 bg-amber-50 rounded-card">
                <p className="text-sm text-txt-secondary mb-1">False Negative Rate</p>
                <p className="text-3xl font-bold font-mono text-amber-700">
                  {pct(fnMetrics.falseNegativeRate)}
                </p>
              </div>
              <div className="text-center p-4 bg-surface-bg rounded-card">
                <p className="text-sm text-txt-secondary mb-1">Manual Detections</p>
                <p className="text-3xl font-bold font-mono text-txt-primary">
                  {fnMetrics.totalManual}
                </p>
              </div>
              <div className="text-center p-4 bg-surface-bg rounded-card">
                <p className="text-sm text-txt-secondary mb-1">AI Detections (Accepted)</p>
                <p className="text-3xl font-bold font-mono text-txt-primary">
                  {fnMetrics.totalAI}
                </p>
              </div>
            </div>

            {/* Per-type miss breakdown */}
            {fnMetrics.byType.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-txt-primary mb-3">Miss Rate by Entity Type</h3>
                <div className="space-y-2">
                  {fnMetrics.byType.map((row) => (
                    <div key={row.type} className="flex items-center gap-3">
                      <div className="w-32 text-xs font-medium text-txt-primary truncate">{row.type}</div>
                      <div className="flex-1">
                        <div className="h-4 bg-gray-100 rounded overflow-hidden">
                          <div
                            className="h-full rounded bg-amber-400 transition-all"
                            style={{ width: `${Math.max(row.missRate * 100, 2)}%` }}
                          />
                        </div>
                      </div>
                      <div className="w-16 text-right text-xs font-mono text-txt-secondary">
                        {pct(row.missRate)}
                      </div>
                      <div className="w-20 text-right text-[10px] text-txt-secondary">
                        {row.manual} manual / {row.ai} AI
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Model Info Card */}
      <div className="card mb-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
            <Brain className="w-5 h-5 text-brand-primary" />
          </div>
          <div>
            <h2 className="text-lg font-heading font-semibold text-txt-primary mb-2">Model Information</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <div className="text-txt-secondary">Provider</div>
              <div className="text-txt-primary font-medium">Azure OpenAI</div>
              <div className="text-txt-secondary">Deployment</div>
              <div className="text-txt-primary font-mono text-xs">
                {modelConfig.deployment || <span className="text-txt-secondary italic">Not configured</span>}
              </div>
              <div className="text-txt-secondary">Status</div>
              <div className="text-txt-primary">
                {modelConfig.endpointConfigured ? (
                  <span className="text-green-600">Connected</span>
                ) : (
                  <span className="text-txt-secondary italic">Endpoint not configured</span>
                )}
              </div>
              <div className="text-txt-secondary">Approach</div>
              <div className="text-txt-primary">LGOIMA-specific system prompt with contextual detection</div>
            </div>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 text-xs text-txt-secondary bg-surface-bg border border-border rounded-card px-4 py-3">
        <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>
          {!hasSufficientData
            ? "Accuracy metrics will appear once 10 or more AI detections have been reviewed. Continue reviewing documents to populate this dashboard."
            : `Metrics based on ${metrics.totalReviewed} reviewed detection(s). Updated on a rolling basis as reviews are completed.`}
        </p>
      </div>
    </div>
  );
}
