"use client";

import { useState } from "react";
import Link from "next/link";
import { statusConfig, type RequestStatus } from "@/lib/db/mappers";
import { workingDaysRemaining, deadlineColor, formatDate, cn } from "@/lib/utils";
import { Search, Filter, FileText, ChevronRight } from "lucide-react";

export interface CaseRow {
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

interface CasesListClientProps {
  cases: CaseRow[];
  totalCount: number;
  activeCount: number;
}

export default function CasesListClient({ cases, totalCount, activeCount }: CasesListClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("");

  const filtered = cases.filter((req) => {
    // Status filter
    if (filterStatus && req.status !== filterStatus) return false;
    // Priority filter
    if (filterPriority && req.priority !== filterPriority) return false;
    // Department filter
    if (filterDepartment && !req.department.includes(filterDepartment)) return false;
    // Text search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        req.reference.toLowerCase().includes(q) ||
        req.requesterName.toLowerCase().includes(q) ||
        req.description.toLowerCase().includes(q) ||
        req.department.some((d) => d.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-txt-primary">LGOIMA Cases</h1>
          <p className="text-sm text-txt-secondary mt-1">
            {totalCount} total cases &middot; {activeCount} active
          </p>
        </div>
        <Link href="/requests/new" className="btn-primary flex items-center gap-2">
          New Case
        </Link>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-txt-secondary" />
          <input
            type="text"
            placeholder="Search by reference, requester, description, or department..."
            className="input-field pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn("btn-secondary flex items-center gap-2", showFilters && "bg-surface-hover")}
        >
          <Filter className="w-4 h-4" />
          Filters
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="card mb-6 flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <label className="text-txt-secondary font-medium">Status:</label>
            <select className="input-field w-auto" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="ingesting">Ingesting</option>
              <option value="in-review">In Review</option>
              <option value="senior-review">Senior Review</option>
              <option value="final-approval">Final Approval</option>
              <option value="released">Released</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-txt-secondary font-medium">Priority:</label>
            <select className="input-field w-auto" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
              <option value="">All</option>
              <option value="standard">Standard</option>
              <option value="urgent">Urgent</option>
              <option value="extended">Extended</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-txt-secondary font-medium">Department:</label>
            <select className="input-field w-auto" value={filterDepartment} onChange={(e) => setFilterDepartment(e.target.value)}>
              <option value="">All</option>
              <option value="Infrastructure">Infrastructure</option>
              <option value="Planning">Planning</option>
              <option value="Property">Property</option>
              <option value="Legal">Legal</option>
              <option value="Community Services">Community Services</option>
              <option value="Regulatory">Regulatory</option>
              <option value="Environmental">Environmental</option>
              <option value="Water">Water</option>
            </select>
          </div>
        </div>
      )}

      {/* Cases Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-bg/50">
              <th className="text-left px-4 py-3 font-medium text-txt-secondary">Reference</th>
              <th className="text-left px-4 py-3 font-medium text-txt-secondary">Requester</th>
              <th className="text-left px-4 py-3 font-medium text-txt-secondary">Status</th>
              <th className="text-left px-4 py-3 font-medium text-txt-secondary">Deadline</th>
              <th className="text-left px-4 py-3 font-medium text-txt-secondary">Documents</th>
              <th className="text-left px-4 py-3 font-medium text-txt-secondary">Department</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((req) => {
              const days = workingDaysRemaining(req.deadline);
              const cfg = statusConfig[req.status as RequestStatus];
              return (
                <tr
                  key={req.id}
                  className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors cursor-pointer group"
                >
                  <td className="px-4 py-3">
                    <Link href={`/requests/${req.id}`} className="block">
                      <span className="font-mono text-xs font-medium text-brand-primary">
                        {req.reference}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/requests/${req.id}`} className="block">
                      <div className="font-medium text-txt-primary">{req.requesterName}</div>
                      <div className="text-xs text-txt-secondary">{req.requesterType}</div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/requests/${req.id}`} className="block">
                      <span className={cn("badge", cfg.bg, cfg.color)}>{cfg.label}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/requests/${req.id}`} className="block">
                      <div className={cn("font-medium text-xs", deadlineColor(days))}>
                        {days < 0
                          ? `${Math.abs(days)}d overdue`
                          : days === 0
                          ? "Due today"
                          : `${days}d remaining`}
                      </div>
                      <div className="text-xs text-txt-secondary">{formatDate(req.deadline)}</div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/requests/${req.id}`} className="block">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-txt-secondary" />
                        <span className="text-txt-primary font-medium">{req.reviewedCount}</span>
                        <span className="text-txt-secondary">/ {req.documentCount}</span>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/requests/${req.id}`} className="block">
                      <div className="flex flex-wrap gap-1">
                        {req.department.map((dept) => (
                          <span
                            key={dept}
                            className="text-xs px-2 py-0.5 rounded-badge bg-surface-bg text-txt-secondary"
                          >
                            {dept}
                          </span>
                        ))}
                      </div>
                    </Link>
                  </td>
                  <td className="px-2 py-3">
                    <Link href={`/requests/${req.id}`} className="block">
                      <ChevronRight className="w-4 h-4 text-txt-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-txt-secondary">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>No cases match your search.</p>
          </div>
        )}
      </div>
    </div>
  );
}
