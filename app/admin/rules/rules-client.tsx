"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import {
  createRule,
  updateRule,
  deleteRule,
  toggleRuleStatus,
} from "@/lib/actions/rule-actions";

type RuleType = "Keyword" | "Pattern" | "Entity" | "Combination";
type RuleStatus = "Active" | "Draft" | "Disabled";

export interface RuleRow {
  id: string;
  name: string;
  type: string;
  status: string;
  matchMode: string;
  keywords: string;
  scope: string;
  priority: string;
  suggestedGround: string | null;
  description: string;
  matchCount: number;
}

interface RulesClientProps {
  rules: RuleRow[];
}

const typeBadge: Record<string, string> = {
  Keyword: "bg-blue-50 text-blue-700",
  Pattern: "bg-purple-50 text-purple-700",
  Entity: "bg-teal-50 text-teal-700",
  Combination: "bg-amber-50 text-amber-700",
};

const statusBadge: Record<string, string> = {
  Active: "bg-green-50 text-green-700",
  Draft: "bg-gray-100 text-gray-600",
  Disabled: "bg-amber-50 text-amber-700",
};

export default function RulesClient({ rules }: RulesClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [showNewRule, setShowNewRule] = useState(false);
  const [saving, setSaving] = useState(false);

  // New rule form state
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<string>("Keyword");
  const [newMatchMode, setNewMatchMode] = useState("Exact");
  const [newKeywords, setNewKeywords] = useState("");
  const [newScope, setNewScope] = useState("All Documents");
  const [newPriority, setNewPriority] = useState("Medium");
  const [newDescription, setNewDescription] = useState("");

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("");
  const [editMatchMode, setEditMatchMode] = useState("");
  const [editKeywords, setEditKeywords] = useState("");
  const [editScope, setEditScope] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const filtered = rules.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.type.toLowerCase().includes(search.toLowerCase()),
  );

  function loadEditForm(rule: RuleRow) {
    setEditName(rule.name);
    setEditType(rule.type);
    setEditMatchMode(rule.matchMode);
    setEditKeywords(rule.keywords);
    setEditScope(rule.scope);
    setEditPriority(rule.priority);
    setEditDescription(rule.description);
  }

  async function handleCreateRule(status: string) {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await createRule({
        name: newName,
        type: newType,
        status,
        matchMode: newMatchMode,
        keywords: newKeywords,
        scope: newScope,
        priority: newPriority,
        description: newDescription,
      });
      setShowNewRule(false);
      setNewName("");
      setNewKeywords("");
      setNewDescription("");
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(ruleId: string, status?: string) {
    setSaving(true);
    try {
      await updateRule(ruleId, {
        name: editName,
        type: editType,
        matchMode: editMatchMode,
        keywords: editKeywords,
        scope: editScope,
        priority: editPriority,
        description: editDescription,
        ...(status ? { status } : {}),
      });
      setExpandedRule(null);
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(ruleId: string) {
    if (!confirm("Delete this rule? This cannot be undone.")) return;
    setSaving(true);
    try {
      await deleteRule(ruleId);
      if (expandedRule === ruleId) setExpandedRule(null);
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(ruleId: string) {
    setSaving(true);
    try {
      await toggleRuleStatus(ruleId);
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-heading font-bold text-txt-primary">
            Custom Detection Rules
          </h1>
          <p className="text-sm text-txt-secondary mt-1">
            Define custom patterns, keywords and entity rules for sensitive
            content detection
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary flex items-center gap-1.5">
            <Upload className="w-4 h-4" /> Import
          </button>
          <button className="btn-secondary flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Export
          </button>
          <button
            className="btn-primary flex items-center gap-1.5"
            onClick={() => setShowNewRule(true)}
          >
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

      {/* New Rule Form */}
      {showNewRule && (
        <div className="card mb-6">
          <h2 className="text-lg font-heading font-semibold text-txt-primary mb-4">
            Create New Rule
          </h2>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-txt-primary mb-1.5">
                  Rule Name
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Project Kaitiaki"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-txt-primary mb-1.5">
                  Type
                </label>
                <select
                  className="input-field"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                >
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
                <select
                  className="input-field"
                  value={newMatchMode}
                  onChange={(e) => setNewMatchMode(e.target.value)}
                >
                  <option>Exact</option>
                  <option>Fuzzy</option>
                  <option>Regex</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-txt-primary mb-1.5">
                Keywords / Pattern
              </label>
              <textarea
                className="input-field min-h-[80px] font-mono text-xs"
                value={newKeywords}
                onChange={(e) => setNewKeywords(e.target.value)}
                placeholder="Enter keywords (comma-separated) or regex pattern..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-txt-primary mb-1.5">
                  Scope
                </label>
                <select
                  className="input-field"
                  value={newScope}
                  onChange={(e) => setNewScope(e.target.value)}
                >
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
                <select
                  className="input-field"
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                >
                  <option>Critical</option>
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                className="btn-ghost"
                onClick={() => setShowNewRule(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="btn-secondary"
                onClick={() => handleCreateRule("Draft")}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save as Draft"}
              </button>
              <button
                className="btn-primary"
                onClick={() => handleCreateRule("Active")}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save & Activate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rules Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-bg">
              <th className="text-left px-6 py-3 font-medium text-txt-secondary">
                Name
              </th>
              <th className="text-left px-6 py-3 font-medium text-txt-secondary">
                Type
              </th>
              <th className="text-left px-6 py-3 font-medium text-txt-secondary">
                Status
              </th>
              <th className="text-right px-6 py-3 font-medium text-txt-secondary">
                Matches
              </th>
              <th className="text-right px-6 py-3 font-medium text-txt-secondary">
                Actions
              </th>
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
                    isExpanded ? "bg-surface-hover" : "hover:bg-surface-hover",
                  )}
                >
                  <td className="px-6 py-4">
                    <button
                      className="flex items-center gap-2 text-left group"
                      onClick={() => {
                        if (isExpanded) {
                          setExpandedRule(null);
                        } else {
                          loadEditForm(rule);
                          setExpandedRule(rule.id);
                        }
                      }}
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
                    <span
                      className={cn(
                        "badge",
                        typeBadge[rule.type] ?? "bg-gray-100 text-gray-700",
                      )}
                    >
                      {rule.type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button onClick={() => handleToggle(rule.id)}>
                      <span
                        className={cn(
                          "badge cursor-pointer hover:opacity-80",
                          statusBadge[rule.status] ?? "bg-gray-100 text-gray-600",
                        )}
                      >
                        {rule.status}
                      </span>
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-txt-secondary">
                    {rule.matchCount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="btn-ghost p-1.5"
                        title="Edit rule"
                        onClick={() => {
                          loadEditForm(rule);
                          setExpandedRule(rule.id);
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        className="btn-ghost p-1.5 hover:!text-red-600 hover:!bg-red-50"
                        title="Delete rule"
                        onClick={() => handleDelete(rule.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="text-center py-8 text-txt-secondary text-sm"
                >
                  {rules.length === 0
                    ? "No custom rules created yet. Click \"New Rule\" to get started."
                    : "No rules match your search."}
                </td>
              </tr>
            )}
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
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-txt-primary mb-1.5">
                  Rule Name
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-txt-primary mb-1.5">
                  Type
                </label>
                <select
                  className="input-field"
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                >
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
                <select
                  className="input-field"
                  value={editMatchMode}
                  onChange={(e) => setEditMatchMode(e.target.value)}
                >
                  <option>Exact</option>
                  <option>Fuzzy</option>
                  <option>Regex</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-txt-primary mb-1.5">
                Keywords / Pattern
              </label>
              <textarea
                className="input-field min-h-[80px] font-mono text-xs"
                value={editKeywords}
                onChange={(e) => setEditKeywords(e.target.value)}
                placeholder="Enter keywords (comma-separated) or regex pattern..."
              />
              <p className="text-xs text-txt-secondary mt-1">
                Separate multiple keywords with commas. Use regex syntax for
                pattern-type rules.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-txt-primary mb-1.5">
                  Scope
                </label>
                <select
                  className="input-field"
                  value={editScope}
                  onChange={(e) => setEditScope(e.target.value)}
                >
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
                <select
                  className="input-field"
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value)}
                >
                  <option>Critical</option>
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                className="btn-ghost"
                onClick={() => setExpandedRule(null)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="btn-secondary"
                onClick={() => handleSaveEdit(expandedRule, "Draft")}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save as Draft"}
              </button>
              <button
                className="btn-primary"
                onClick={() => handleSaveEdit(expandedRule, "Active")}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save & Activate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
