"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Plus,
  Upload,
  Download,
  Search,
  Edit,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Mock data                                                         */
/* ------------------------------------------------------------------ */

type RuleType = "Keyword" | "Pattern" | "Entity" | "Combination";
type RuleStatus = "Active" | "Draft" | "Disabled";

interface Rule {
  id: string;
  name: string;
  type: RuleType;
  status: RuleStatus;
  matches: number;
  description: string;
  keywords: string;
  scope: string;
  priority: string;
  matchMode: string;
}

const mockRules: Rule[] = [
  {
    id: "rule-1",
    name: "Project Kaitiaki",
    type: "Keyword",
    status: "Active",
    matches: 23,
    description: "Detects references to Project Kaitiaki across all document types",
    keywords: "Project Kaitiaki, Kaitiaki initiative, PKI-",
    scope: "All Documents",
    priority: "High",
    matchMode: "Exact",
  },
  {
    id: "rule-2",
    name: "NPDC Reference Number",
    type: "Pattern",
    status: "Active",
    matches: 156,
    description: "Matches NPDC internal reference number patterns",
    keywords: "NPDC-\\d{4}-\\d{3,5}",
    scope: "All Documents",
    priority: "Medium",
    matchMode: "Regex",
  },
  {
    id: "rule-3",
    name: "Resource Consent Applicant",
    type: "Entity",
    status: "Draft",
    matches: 0,
    description: "Identifies resource consent applicant names and details",
    keywords: "",
    scope: "Resource Consent Documents",
    priority: "High",
    matchMode: "AI Assisted",
  },
  {
    id: "rule-4",
    name: "Consent Applicant Names",
    type: "Combination",
    status: "Active",
    matches: 45,
    description: "Combines keyword and entity detection for consent applicant information",
    keywords: "applicant, consent holder, resource consent",
    scope: "Consents",
    priority: "High",
    matchMode: "Combined",
  },
  {
    id: "rule-5",
    name: "Iwi Consultation Names",
    type: "Keyword",
    status: "Disabled",
    matches: 12,
    description: "Detects names appearing in iwi consultation correspondence",
    keywords: "Te Atiawa, Ngati Maru, Taranaki Whanui",
    scope: "Consultation Documents",
    priority: "Medium",
    matchMode: "Fuzzy",
  },
];

const typeBadge: Record<RuleType, string> = {
  Keyword: "bg-blue-50 text-blue-700",
  Pattern: "bg-purple-50 text-purple-700",
  Entity: "bg-teal-50 text-teal-700",
  Combination: "bg-amber-50 text-amber-700",
};

const statusBadge: Record<RuleStatus, string> = {
  Active: "bg-green-50 text-green-700",
  Draft: "bg-gray-100 text-gray-600",
  Disabled: "bg-amber-50 text-amber-700",
};

/* ------------------------------------------------------------------ */
/*  Page component                                                    */
/* ------------------------------------------------------------------ */

export default function CustomRulesPage() {
  const [search, setSearch] = useState("");
  const [expandedRule, setExpandedRule] = useState<string | null>("rule-1");

  const filtered = mockRules.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-heading font-bold text-txt-primary">
            Custom Detection Rules
          </h1>
          <p className="text-sm text-txt-secondary mt-1">
            Define custom patterns, keywords and entity rules for sensitive content detection
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary flex items-center gap-1.5">
            <Upload className="w-4 h-4" /> Import
          </button>
          <button className="btn-secondary flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Export
          </button>
          <button className="btn-primary flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> New Rule
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-txt-secondary" />
        <input
          type="text"
          placeholder="Search rules by name or type..."
          className="input-field pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Rules Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-bg">
              <th className="text-left px-6 py-3 font-medium text-txt-secondary">Name</th>
              <th className="text-left px-6 py-3 font-medium text-txt-secondary">Type</th>
              <th className="text-left px-6 py-3 font-medium text-txt-secondary">Status</th>
              <th className="text-right px-6 py-3 font-medium text-txt-secondary">Matches</th>
              <th className="text-right px-6 py-3 font-medium text-txt-secondary">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((rule) => {
              const isExpanded = expandedRule === rule.id;
              return (
                <tr
                  key={rule.id}
                  className={cn(
                    "border-b border-border last:border-0 transition-colors",
                    isExpanded ? "bg-surface-hover" : "hover:bg-surface-hover"
                  )}
                >
                  <td className="px-6 py-4">
                    <button
                      className="flex items-center gap-2 text-left group"
                      onClick={() =>
                        setExpandedRule(isExpanded ? null : rule.id)
                      }
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-txt-secondary flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-txt-secondary flex-shrink-0" />
                      )}
                      <span className="font-medium text-txt-primary group-hover:text-brand-primary transition-colors">
                        {rule.name}
                      </span>
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn("badge", typeBadge[rule.type])}>{rule.type}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn("badge", statusBadge[rule.status])}>{rule.status}</span>
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-txt-secondary">
                    {rule.matches.toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button className="btn-ghost p-1.5" title="Edit rule">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        className="btn-ghost p-1.5 hover:!text-red-600 hover:!bg-red-50"
                        title="Delete rule"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Rule Editor Panel */}
      {expandedRule && (
        <div className="card mt-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-heading font-semibold text-txt-primary">
              Rule Editor
            </h2>
            <span className="text-xs text-txt-secondary font-mono">
              {expandedRule}
            </span>
          </div>

          {(() => {
            const rule = mockRules.find((r) => r.id === expandedRule);
            if (!rule) return null;

            return (
              <div className="space-y-6">
                {/* Row 1 */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-txt-primary mb-1.5">
                      Rule Name
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      defaultValue={rule.name}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-txt-primary mb-1.5">
                      Type
                    </label>
                    <select className="input-field" defaultValue={rule.type}>
                      <option>Keyword</option>
                      <option>Pattern</option>
                      <option>Entity</option>
                      <option>Combination</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-txt-primary mb-1.5">
                      Match Mode
                    </label>
                    <select className="input-field" defaultValue={rule.matchMode}>
                      <option>Exact</option>
                      <option>Fuzzy</option>
                      <option>Regex</option>
                      <option>AI Assisted</option>
                      <option>Combined</option>
                    </select>
                  </div>
                </div>

                {/* Keywords / Pattern */}
                <div>
                  <label className="block text-sm font-medium text-txt-primary mb-1.5">
                    Keywords / Pattern
                  </label>
                  <textarea
                    className="input-field min-h-[80px] font-mono text-xs"
                    defaultValue={rule.keywords}
                    placeholder="Enter keywords (comma-separated) or regex pattern..."
                  />
                  <p className="text-xs text-txt-secondary mt-1">
                    Separate multiple keywords with commas. Use regex syntax for pattern-type rules.
                  </p>
                </div>

                {/* Row 2 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-txt-primary mb-1.5">
                      Scope
                    </label>
                    <select className="input-field" defaultValue={rule.scope}>
                      <option>All Documents</option>
                      <option>Resource Consent Documents</option>
                      <option>Consents</option>
                      <option>Consultation Documents</option>
                      <option>Correspondence</option>
                      <option>Internal Reports</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-txt-primary mb-1.5">
                      Priority
                    </label>
                    <select className="input-field" defaultValue={rule.priority}>
                      <option>Critical</option>
                      <option>High</option>
                      <option>Medium</option>
                      <option>Low</option>
                    </select>
                  </div>
                </div>

                {/* Test Rule Area */}
                <div className="border border-border rounded-card p-4 bg-surface-bg">
                  <h3 className="text-sm font-medium text-txt-primary mb-2">
                    Test Rule
                  </h3>
                  <textarea
                    className="input-field min-h-[60px] text-xs bg-white"
                    placeholder="Paste sample text here to test this rule..."
                  />
                  <div className="flex items-center gap-2 mt-3">
                    <button className="btn-secondary text-xs">Run Test</button>
                    <span className="text-xs text-txt-secondary">
                      No test results yet
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                  <button
                    className="btn-ghost"
                    onClick={() => setExpandedRule(null)}
                  >
                    Cancel
                  </button>
                  <button className="btn-secondary">Save as Draft</button>
                  <button className="btn-primary">Save &amp; Activate</button>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
