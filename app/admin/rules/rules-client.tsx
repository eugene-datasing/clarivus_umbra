"use client";

import { useState, useTransition, useCallback, useRef } from "react";
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
  FlaskConical,
  X,
} from "lucide-react";
import { testRule, type RuleTestResult } from "@/lib/rules/rule-tester";
import {
  createRule,
  updateRule,
  deleteRule,
  toggleRuleStatus,
  importRules,
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
  const [newPriority, setNewPriority] = useState("Medium");
  const [newDescription, setNewDescription] = useState("");

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("");
  const [editMatchMode, setEditMatchMode] = useState("");
  const [editKeywords, setEditKeywords] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // Test panel state
  const [testingRule, setTestingRule] = useState<RuleRow | null>(null);
  const [testSampleText, setTestSampleText] = useState("");
  const [testResult, setTestResult] = useState<RuleTestResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportRules = useCallback(() => {
    const exportData = rules.map(({ id, name, type, status, matchMode, keywords, scope, priority, suggestedGround, description }) => ({
      name, type, status, matchMode, keywords, scope, priority, suggestedGround, description,
    }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "veil-detection-rules.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [rules]);

  const handleImportRules = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("Expected an array of rules");
      const result = await importRules(parsed);
      if (result.success) {
        startTransition(() => router.refresh());
        alert("Imported " + result.count + " rule(s) successfully.");
      } else {
        alert("Import failed: " + (result.error || "Unknown error"));
      }
    } catch (err) {
      alert("Failed to parse rules file. Ensure it is valid JSON.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [router, startTransition]);

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
        scope: "All Documents",
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
        scope: "All Documents",
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

  function handleOpenTest(rule: RuleRow) {
    setTestingRule(rule);
    setTestSampleText("");
    setTestResult(null);
  }

  function handleRunTest() {
    if (!testingRule || !testSampleText) return;
    const result = testRule(
      testingRule.keywords,
      testingRule.matchMode,
      testSampleText,
    );
    setTestResult(result);
  }

  function renderHighlightedText(text: string, result: RuleTestResult) {
    if (result.matches.length === 0) {
      return <span className="text-txt-secondary">{text}</span>;
    }

    // Merge overlapping matches and sort
    const sorted = [...result.matches].sort((a, b) => a.start - b.start);
    const merged: Array<{ start: number; end: number }> = [];
    for (const m of sorted) {
      const last = merged[merged.length - 1];
      if (last && m.start <= last.end) {
        last.end = Math.max(last.end, m.end);
      } else {
        merged.push({ start: m.start, end: m.end });
      }
    }

    const parts: Array<{ text: string; highlight: boolean }> = [];
    let cursor = 0;
    for (const m of merged) {
      if (cursor < m.start) {
        parts.push({ text: text.slice(cursor, m.start), highlight: false });
      }
      parts.push({ text: text.slice(m.start, m.end), highlight: true });
      cursor = m.end;
    }
    if (cursor < text.length) {
      parts.push({ text: text.slice(cursor), highlight: false });
    }

    return (
      <>
        {parts.map((part, idx) =>
          part.highlight ? (
            <mark
              key={idx}
              className="bg-amber-200 text-amber-900 px-0.5 rounded"
            >
              {part.text}
            </mark>
          ) : (
            <span key={idx}>{part.text}</span>
          ),
        )}
      </>
    );
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
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportRules}
          />
          <button
            className="btn-secondary flex items-center gap-1.5"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4" /> Import
          </button>
          <button
            className="btn-secondary flex items-center gap-1.5"
            onClick={handleExportRules}
          >
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
            <div className="w-48">
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
                        title="Test rule"
                        onClick={() => handleOpenTest(rule)}
                      >
                        <FlaskConical className="w-4 h-4" />
                      </button>
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
            <div className="w-48">
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

      {/* Test Rule Modal */}
      {testingRule && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h3 className="text-lg font-heading font-semibold text-txt-primary">
                  Test Rule: {testingRule.name}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={cn(
                      "badge text-xs",
                      typeBadge[testingRule.type] ?? "bg-gray-100 text-gray-700",
                    )}
                  >
                    {testingRule.type}
                  </span>
                  <span className="text-xs text-txt-secondary">
                    Match mode: {testingRule.matchMode}
                  </span>
                  <span className="text-xs font-mono text-txt-secondary bg-gray-50 px-1.5 py-0.5 rounded">
                    {testingRule.keywords.length > 60
                      ? testingRule.keywords.slice(0, 60) + "..."
                      : testingRule.keywords}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setTestingRule(null);
                  setTestResult(null);
                  setTestSampleText("");
                }}
                className="btn-ghost p-1.5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-4 flex-1 overflow-y-auto space-y-4">
              {/* Sample text input */}
              <div>
                <label className="block text-sm font-medium text-txt-primary mb-1.5">
                  Sample Text
                </label>
                <textarea
                  className="input-field min-h-[120px] font-mono text-xs"
                  value={testSampleText}
                  onChange={(e) => {
                    setTestSampleText(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder="Paste sample text here to test the rule against..."
                />
              </div>

              {/* Run test button */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleRunTest}
                  disabled={!testSampleText.trim()}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50"
                >
                  <FlaskConical className="w-4 h-4" />
                  Run Test
                </button>
                {testResult && (
                  <span
                    className={cn(
                      "text-sm font-medium",
                      testResult.matchCount > 0
                        ? "text-amber-700"
                        : "text-green-700",
                    )}
                  >
                    {testResult.matchCount} match{testResult.matchCount !== 1 ? "es" : ""} found
                  </span>
                )}
              </div>

              {/* Results */}
              {testResult && (
                <div className="space-y-4">
                  {/* Highlighted text preview */}
                  <div>
                    <div className="text-xs font-semibold tracking-wider text-txt-secondary uppercase mb-2">
                      Result Preview
                    </div>
                    <div className="p-4 bg-surface-bg rounded-lg text-sm leading-relaxed whitespace-pre-wrap break-words border border-border">
                      {renderHighlightedText(testSampleText, testResult)}
                    </div>
                  </div>

                  {/* Match details */}
                  {testResult.matchCount > 0 && (
                    <div>
                      <div className="text-xs font-semibold tracking-wider text-txt-secondary uppercase mb-2">
                        Match Details ({testResult.matchCount})
                      </div>
                      <div className="max-h-[200px] overflow-y-auto space-y-1">
                        {testResult.matches.map((match, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-3 px-3 py-1.5 bg-amber-50 rounded text-xs"
                          >
                            <span className="font-mono text-amber-600 w-8 text-right flex-shrink-0">
                              #{idx + 1}
                            </span>
                            <span className="font-mono font-medium text-amber-800">
                              &ldquo;{match.text}&rdquo;
                            </span>
                            <span className="text-txt-secondary ml-auto flex-shrink-0">
                              position {match.start}&ndash;{match.end}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {testResult.matchCount === 0 && (
                    <div className="text-center py-6 text-sm text-txt-secondary">
                      No matches found in the sample text.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="px-6 py-3 border-t border-border flex justify-end">
              <button
                onClick={() => {
                  setTestingRule(null);
                  setTestResult(null);
                  setTestSampleText("");
                }}
                className="btn-ghost"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
