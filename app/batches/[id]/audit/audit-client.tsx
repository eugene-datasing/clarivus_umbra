"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Lock,
  Download,
  Search,
  Filter,
  Check,
  Upload,
  Sparkles,
  Edit,
  X,
  Shield,
  Eye,
} from "lucide-react";

interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: string;
  type: string;
  description: string;
  target: string;
  detail?: string;
  previousValue?: string;
  newValue?: string;
}

interface CaseData {
  id: string;
  reference: string;
  description: string;
}

interface AuditClientProps {
  requestId: string;
  caseData: CaseData | null;
  auditEntries: AuditEntry[];
}

const tabs = [
  { label: "Documents", href: "" },
  { label: "Schedule", href: "schedule" },
  { label: "Audit Trail", href: "audit" },
  { label: "Export", href: "export" },
];

const typeIconMap: Record<string, { icon: typeof Check; color: string; bg: string }> = {
  approval: { icon: Check, color: "text-confidence-high", bg: "bg-green-50" },
  ingestion: { icon: Upload, color: "text-blue-600", bg: "bg-blue-50" },
  detection: { icon: Sparkles, color: "text-brand-primary", bg: "bg-purple-50" },
  review: { icon: Edit, color: "text-amber-600", bg: "bg-amber-50" },
  admin: { icon: Shield, color: "text-gray-600", bg: "bg-gray-100" },
  access: { icon: Eye, color: "text-blue-500", bg: "bg-blue-50" },
  export: { icon: Download, color: "text-confidence-high", bg: "bg-green-50" },
  rejection: { icon: X, color: "text-confidence-low", bg: "bg-red-50" },
};

const roleColors: Record<string, string> = {
  "Request Manager": "bg-blue-50 text-blue-700",
  System: "bg-gray-100 text-gray-600",
  Reviewer: "bg-amber-50 text-amber-700",
  "Senior Reviewer": "bg-purple-50 text-brand-primary",
  "Final Approver": "bg-green-50 text-green-700",
};

function formatTimestamp(ts: string): { date: string; time: string } {
  const d = new Date(ts);
  const date = d.toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-NZ", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return { date, time };
}

export default function AuditClient({ requestId, caseData, auditEntries }: AuditClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("");

  const filteredEntries = auditEntries.filter((entry) => {
    if (filterType && entry.type !== filterType) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      entry.description.toLowerCase().includes(q) ||
      entry.userName.toLowerCase().includes(q) ||
      entry.target.toLowerCase().includes(q)
    );
  });

  const exportCsv = useCallback(() => {
    const header = "Timestamp,User,Role,Type,Description,Target,Detail\n";
    const rows = filteredEntries.map((e) => {
      const esc = (s: string) => `"${(s || "").replace(/"/g, '""')}"`;
      return [esc(e.timestamp), esc(e.userName), esc(e.userRole), esc(e.type), esc(e.description), esc(e.target), esc(e.detail || "")].join(",");
    }).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-trail-${requestId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredEntries, requestId]);

  const exportPdf = useCallback(() => {
    // Open the audit page in print mode for PDF export
    window.print();
  }, []);

  const uniqueUsers = new Set(auditEntries.map((e) => e.userName)).size;

  const caseReference = caseData?.reference ?? "Unknown";
  const caseDescription = caseData?.description ?? "";

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-txt-secondary mb-6">
        <Link href="/requests" className="hover:text-brand-primary transition-colors">
          Cases
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link href={`/requests/${requestId}`} className="hover:text-brand-primary transition-colors">
          {caseReference}
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-txt-primary font-medium">Audit Trail</span>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border mb-6">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href ? `/requests/${requestId}/${tab.href}` : `/requests/${requestId}`}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab.href === "audit"
                ? "border-brand-primary text-brand-primary"
                : "border-transparent text-txt-secondary hover:text-txt-primary hover:border-gray-300"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-txt-primary">
          Audit Trail
        </h1>
        <p className="text-sm text-txt-secondary mt-1">
          {caseReference} — {caseDescription}
        </p>
      </div>

      {/* WORM banner */}
      <div className="flex items-center gap-3 px-4 py-3 bg-surface-bg border border-border rounded-card mb-6">
        <div className="w-8 h-8 rounded-lg bg-brand-primary/10 flex items-center justify-center flex-shrink-0">
          <Lock className="w-4 h-4 text-brand-primary" />
        </div>
        <div>
          <span className="text-sm font-medium text-txt-primary">
            Immutable audit log
          </span>
          <span className="text-sm text-txt-secondary">
            {" "}
            — entries cannot be modified or deleted
          </span>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-txt-primary font-medium">
            Events: <span className="font-mono">{auditEntries.length.toLocaleString()}</span>
          </span>
          <span className="text-txt-secondary">|</span>
          <span className="text-txt-primary font-medium">
            Users: <span className="font-mono">{uniqueUsers}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportPdf} className="btn-secondary flex items-center gap-2 text-xs !px-3 !py-1.5">
            <Download className="w-3.5 h-3.5" />
            Export PDF
          </button>
          <button onClick={exportCsv} className="btn-secondary flex items-center gap-2 text-xs !px-3 !py-1.5">
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-txt-secondary" />
          <input
            type="text"
            placeholder="Search events, users, documents..."
            className="input-field !pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select
          className="input-field w-auto"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="">All types</option>
          <option value="approval">Approval</option>
          <option value="ingestion">Ingestion</option>
          <option value="detection">Detection</option>
          <option value="review">Review</option>
          <option value="export">Export</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      {/* Event list */}
      <div className="card !p-0 overflow-hidden mb-4">
        <div className="divide-y divide-border">
          {filteredEntries.map((entry) => {
            const ts = formatTimestamp(entry.timestamp);
            const iconCfg = typeIconMap[entry.type] || typeIconMap.admin;
            const Icon = iconCfg.icon;
            const roleCls = roleColors[entry.userRole] || "bg-gray-100 text-gray-600";

            return (
              <div
                key={entry.id}
                className="flex items-start gap-4 px-5 py-3.5 hover:bg-surface-hover transition-colors"
              >
                {/* Icon */}
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${iconCfg.bg}`}
                >
                  <Icon className={`w-4 h-4 ${iconCfg.color}`} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-txt-primary">
                      {entry.userName}
                    </span>
                    <span className={`badge text-[10px] !px-2 !py-0 ${roleCls}`}>
                      {entry.userRole}
                    </span>
                  </div>
                  <p className="text-sm text-txt-secondary">
                    {entry.description}
                  </p>
                  {entry.target && (
                    <p className="text-xs text-txt-secondary/70 mt-0.5 font-mono">
                      {entry.target}
                    </p>
                  )}
                  {entry.detail && (
                    <p className="text-xs text-txt-secondary/60 mt-1">
                      {entry.detail}
                    </p>
                  )}
                  {entry.previousValue && entry.newValue && (
                    <div className="mt-1.5 flex items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded line-through">
                        {entry.previousValue}
                      </span>
                      <span className="text-txt-secondary">&rarr;</span>
                      <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded">
                        {entry.newValue}
                      </span>
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <div className="text-right flex-shrink-0">
                  <div className="font-mono text-xs text-txt-secondary">
                    {ts.time}
                  </div>
                  <div className="text-[11px] text-txt-secondary/60">
                    {ts.date}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pagination */}
      <div className="text-xs text-txt-secondary text-center">
        Showing 1-{filteredEntries.length} of {auditEntries.length.toLocaleString()}
      </div>
    </div>
  );
}
