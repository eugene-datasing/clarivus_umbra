"use client";

import Link from "next/link";
import { workingDaysRemaining, deadlineColor, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { FolderOpen, FileText, Clock, AlertTriangle, ArrowRight, Activity } from "lucide-react";
import { type RequestStatus, statusConfig } from "@/lib/db/mappers";

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

interface DashboardStats {
  totalCases: number;
  activeCases: number;
  totalDocuments: number;
  totalDetections: number;
  casesByStatus: Record<string, number>;
}

interface DashboardClientProps {
  cases: CaseItem[];
  dashboardStats: DashboardStats;
}

const recentActivity = [
  { time: "10:42", user: "J. Chen", action: "approved LGOIMA-2026-042 export for release", type: "approval" as const },
  { time: "10:15", user: "M. Patel", action: "submitted 5 documents to Senior Review", type: "review" as const },
  { time: "09:58", user: "Veil AI", action: "detection complete: LGOIMA-2026-045 (213 docs, 1,847 detections)", type: "detection" as const },
  { time: "09:30", user: "A. Richardson", action: "uploaded 213 documents to LGOIMA-2026-045", type: "ingestion" as const },
  { time: "09:15", user: "K. Williams", action: "rejected detection: \"Councillor M. Bridges\" — public official", type: "review" as const },
  { time: "08:45", user: "D. Harper", action: "approved final release of LGOIMA-2026-038", type: "approval" as const },
];

export default function DashboardClient({ cases, dashboardStats }: DashboardClientProps) {
  // Compute dynamic stat cards from real data
  const activeCases = cases.filter((r) => r.status !== "released" && r.status !== "draft");
  const pendingDocs = cases
    .filter((r) => r.status !== "released")
    .reduce((sum, r) => sum + (r.documentCount - r.reviewedCount), 0);
  const dueThisWeek = cases.filter((r) => {
    if (r.status === "released") return false;
    const days = workingDaysRemaining(r.deadline);
    return days >= 0 && days <= 5;
  }).length;
  const overdue = cases.filter((r) => {
    if (r.status === "released") return false;
    return workingDaysRemaining(r.deadline) < 0;
  }).length;

  const stats = [
    { label: "Active Cases", value: String(activeCases.length), icon: FolderOpen, color: "text-brand-primary", bg: "bg-purple-50" },
    { label: "Docs Pending", value: String(pendingDocs), icon: FileText, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Due This Week", value: String(dueThisWeek), icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Overdue", value: String(overdue), icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
  ];

  return (
    <div className="p-6 max-w-[1400px]">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-txt-primary">Dashboard</h1>
        <p className="text-sm text-txt-secondary mt-1">LGOIMA Disclosure Workflow Overview</p>
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
        {/* Active Cases - 3 cols */}
        <div className="col-span-3 card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-heading font-semibold">Active Cases</h2>
            <Link href="/requests" className="text-sm text-brand-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="space-y-3">
            {cases.filter((r) => r.status !== "released").map((req) => {
              const days = workingDaysRemaining(req.deadline);
              const cfg = statusConfig[req.status as RequestStatus];
              const progress = req.documentCount > 0 ? Math.round((req.reviewedCount / req.documentCount) * 100) : 0;
              return (
                <Link
                  key={req.id}
                  href={"/requests/" + req.id}
                  className="block p-4 rounded-lg border border-border hover:bg-surface-hover transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-txt-secondary">{req.reference}</span>
                        <span className={cn("badge", cfg.bg, cfg.color)}>{cfg.label}</span>
                      </div>
                      <div className="text-sm font-medium text-txt-primary">{req.description.slice(0, 100)}...</div>
                      <div className="text-xs text-txt-secondary mt-1">
                        {req.requesterName} &middot; {req.department.join(", ")}
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <div className={cn("text-sm font-semibold", deadlineColor(days))}>
                        {days < 0 ? Math.abs(days) + "d overdue" : days + "d remaining"}
                      </div>
                      <div className="text-xs text-txt-secondary">{formatDate(req.deadline)}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-primary rounded-full transition-all" style={{ width: progress + "%" }} />
                    </div>
                    <span className="text-xs text-txt-secondary w-24 text-right">
                      {req.reviewedCount}/{req.documentCount} docs
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent Activity - 2 cols */}
        <div className="col-span-2 card">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-txt-secondary" />
            <h2 className="text-lg font-heading font-semibold">Recent Activity</h2>
          </div>
          <div className="space-y-0">
            {recentActivity.map((entry, i) => (
              <div key={i} className="flex gap-3 py-3 border-b border-border last:border-0">
                <span className="text-xs text-txt-secondary font-mono w-10 flex-shrink-0 pt-0.5">{entry.time}</span>
                <div className="text-sm">
                  <span className="font-medium text-txt-primary">{entry.user}</span>{" "}
                  <span className="text-txt-secondary">{entry.action}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
