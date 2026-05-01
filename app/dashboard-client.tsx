"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { FolderOpen, FileText, CheckCircle, ArrowRight, Activity } from "lucide-react";

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

interface DashboardStats {
  totalBatches: number;
  activeBatches: number;
  totalDocuments: number;
  totalDetections: number;
  batchesByStatus: Record<string, number>;
}

interface ActivityItem {
  time: string;
  user: string;
  action: string;
  type: "approval" | "review" | "detection" | "ingestion" | "system";
}

interface DashboardClientProps {
  batches: BatchItem[];
  dashboardStats: DashboardStats;
  recentActivity: ActivityItem[];
}

const batchStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Draft", color: "text-gray-600", bg: "bg-gray-100" },
  processing: { label: "Processing", color: "text-blue-700", bg: "bg-blue-50" },
  "ready-for-review": { label: "Ready for Review", color: "text-amber-600", bg: "bg-amber-50" },
  reviewed: { label: "Reviewed", color: "text-purple-600", bg: "bg-purple-50" },
  exported: { label: "Exported", color: "text-green-700", bg: "bg-green-50" },
  deleted: { label: "Deleted", color: "text-red-700", bg: "bg-red-50" },
};

export default function DashboardClient({ batches, dashboardStats, recentActivity }: DashboardClientProps) {
  const activeBatches = batches.filter((b) => b.status !== "exported" && b.status !== "draft");
  const pendingDocs = batches
    .filter((b) => b.status !== "exported")
    .reduce((sum, b) => sum + (b.documentCount - b.reviewedCount), 0);

  const stats = [
    { label: "Active Batches", value: String(dashboardStats.activeBatches), icon: FolderOpen, color: "text-brand-primary", bg: "bg-purple-50" },
    { label: "Total Documents", value: String(dashboardStats.totalDocuments), icon: FileText, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Docs Pending Review", value: String(pendingDocs), icon: FileText, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Total Redactions", value: String(dashboardStats.totalDetections), icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" },
  ];

  return (
    <div className="p-6 max-w-[1400px]">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-txt-primary">Dashboard</h1>
        <p className="text-sm text-txt-secondary mt-1">PII redaction workflow overview</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="card flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow">
              <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center", stat.bg)}>
                <Icon className={cn("w-6 h-6", stat.color)} />
              </div>
              <div>
                <div className="text-2xl font-bold text-txt-primary">{stat.value}</div>
                <div className="text-sm text-txt-secondary">{stat.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Active Batches */}
        <div className="col-span-3 card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-heading font-semibold">Active Batches</h2>
            <Link href="/batches" className="text-sm text-brand-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="space-y-3">
            {activeBatches.length === 0 ? (
              <p className="text-sm text-txt-secondary py-6 text-center">No active batches</p>
            ) : (
              activeBatches.map((batch) => {
                const cfg = batchStatusConfig[batch.status] ?? { label: batch.status, color: "text-gray-600", bg: "bg-gray-100" };
                const progress = batch.documentCount > 0 ? Math.round((batch.reviewedCount / batch.documentCount) * 100) : 0;
                return (
                  <Link
                    key={batch.id}
                    href={`/batches/${batch.id}`}
                    className="block p-4 rounded-lg border border-border hover:bg-surface-hover transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-txt-secondary">{batch.reference}</span>
                          <span className={cn("badge", cfg.bg, cfg.color)}>{cfg.label}</span>
                        </div>
                        <div className="text-sm font-medium text-txt-primary">{batch.name}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-primary rounded-full transition-all" style={{ width: progress + "%" }} />
                      </div>
                      <span className="text-xs text-txt-secondary w-24 text-right">
                        {batch.reviewedCount}/{batch.documentCount} docs
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="col-span-2 card">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-txt-secondary" />
            <h2 className="text-lg font-heading font-semibold">Recent Activity</h2>
          </div>
          <div className="space-y-0">
            {recentActivity.length === 0 ? (
              <p className="text-sm text-txt-secondary py-6 text-center">No activity yet</p>
            ) : (
              recentActivity.map((entry, i) => (
                <div key={i} className="flex gap-3 py-3 border-b border-border last:border-0">
                  <span className="text-xs text-txt-secondary font-mono w-10 flex-shrink-0 pt-0.5">{entry.time}</span>
                  <div className="text-sm">
                    <span className="font-medium text-txt-primary">{entry.user}</span>{" "}
                    <span className="text-txt-secondary">{entry.action}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
