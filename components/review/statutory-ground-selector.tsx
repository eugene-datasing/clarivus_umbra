"use client";

import { useState } from "react";
import { lgoimaGrounds, type LGOIMAGround } from "@/lib/lgoima-grounds";
import { cn } from "@/lib/utils";
import { X, Star, Brain, ChevronDown, ChevronRight } from "lucide-react";

interface StatutoryGroundSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (groundId: string, reasoning: string, piConsideration: string) => void;
  detectionText: string;
  detectionType: string;
  confidence: number;
  aiSuggestedGround?: string | null;
  aiExplanation?: string;
}

export function StatutoryGroundSelector({
  isOpen,
  onClose,
  onApply,
  detectionText,
  detectionType,
  confidence,
  aiSuggestedGround,
  aiExplanation,
}: StatutoryGroundSelectorProps) {
  const [selectedGround, setSelectedGround] = useState<string | null>(aiSuggestedGround || null);
  const [reasoning, setReasoning] = useState("");
  const [piConsideration, setPiConsideration] = useState("");
  const [showAllS7, setShowAllS7] = useState(false);

  if (!isOpen) return null;

  const s6Grounds = lgoimaGrounds.filter((g) => g.section === "s6");
  const s7Grounds = lgoimaGrounds.filter((g) => g.section === "s7");
  const s7Common = s7Grounds.filter((g) => g.common);
  const s7Other = s7Grounds.filter((g) => !g.common);

  const selected = lgoimaGrounds.find((g) => g.id === selectedGround);
  const needsPI = selected?.requiresPI ?? false;

  const canApply = selectedGround && reasoning.length >= 20 && (!needsPI || piConsideration.length >= 10);

  const useAiSuggestion = () => {
    if (aiSuggestedGround) {
      setSelectedGround(aiSuggestedGround);
      setReasoning(aiExplanation || "");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-modal shadow-xl w-[640px] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-heading text-lg font-semibold">Link Redaction to Statutory Ground</h3>
          <button onClick={onClose} className="p-1 hover:bg-surface-hover rounded">
            <X className="w-5 h-5 text-txt-secondary" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4 space-y-5 flex-1">
          {/* Content preview */}
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-sm font-medium text-txt-primary truncate">&ldquo;{detectionText}&rdquo;</div>
            <div className="text-xs text-txt-secondary mt-1">
              Type: {detectionType} &middot; Confidence: {confidence}%
            </div>
          </div>

          {/* Ground Selection */}
          <div>
            <div className="text-sm font-semibold text-txt-primary mb-3">SELECT GROUND(S)</div>

            {/* Section 6 */}
            <div className="mb-3">
              <div className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-2">
                Section 6 — Conclusive (must withhold)
              </div>
              <div className="space-y-1">
                {s6Grounds.map((g) => (
                  <label
                    key={g.id}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-surface-hover transition-colors",
                      selectedGround === g.id && "bg-purple-50 ring-1 ring-brand-primary",
                      g.rare && "opacity-60"
                    )}
                  >
                    <input
                      type="radio"
                      name="ground"
                      checked={selectedGround === g.id}
                      onChange={() => setSelectedGround(g.id)}
                      className="accent-brand-primary"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium">{g.reference}</span>
                      <span className="text-sm text-txt-secondary ml-2">{g.label}</span>
                      {g.rare && <span className="text-xs text-txt-secondary ml-1">[rarely applicable]</span>}
                    </div>
                    {g.id === aiSuggestedGround && (
                      <span className="badge bg-blue-50 text-blue-700"><Brain className="w-3 h-3" /> AI</span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Section 7 */}
            <div className="mb-3">
              <div className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">
                Section 7 — Balanced (public interest applies)
              </div>
              <div className="space-y-1">
                {s7Common.map((g) => (
                  <label
                    key={g.id}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-surface-hover transition-colors",
                      selectedGround === g.id && "bg-purple-50 ring-1 ring-brand-primary"
                    )}
                  >
                    <input
                      type="radio"
                      name="ground"
                      checked={selectedGround === g.id}
                      onChange={() => setSelectedGround(g.id)}
                      className="accent-brand-primary"
                    />
                    <div className="flex-1">
                      <Star className="w-3 h-3 inline text-amber-500 mr-1" />
                      <span className="text-sm font-medium">{g.reference}</span>
                      <span className="text-sm text-txt-secondary ml-2">{g.label}</span>
                    </div>
                    {g.id === aiSuggestedGround && (
                      <span className="badge bg-blue-50 text-blue-700"><Brain className="w-3 h-3" /> AI</span>
                    )}
                  </label>
                ))}

                {/* Show all toggle */}
                <button
                  onClick={() => setShowAllS7(!showAllS7)}
                  className="text-xs text-brand-primary hover:underline flex items-center gap-1 ml-2 mt-1"
                >
                  {showAllS7 ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  {showAllS7 ? "Hide" : "Show all"} s7 grounds
                </button>

                {showAllS7 && s7Other.map((g) => (
                  <label
                    key={g.id}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-surface-hover transition-colors",
                      selectedGround === g.id && "bg-purple-50 ring-1 ring-brand-primary",
                      g.rare && "opacity-60"
                    )}
                  >
                    <input
                      type="radio"
                      name="ground"
                      checked={selectedGround === g.id}
                      onChange={() => setSelectedGround(g.id)}
                      className="accent-brand-primary"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium">{g.reference}</span>
                      <span className="text-sm text-txt-secondary ml-2">{g.label}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Reasoning */}
          <div>
            <label className="text-sm font-semibold text-txt-primary block mb-1">
              REASONING <span className="text-red-500">*</span>
            </label>
            <textarea
              className="input-field h-20 resize-none"
              placeholder="Explain why this content meets the threshold for withholding under the selected ground(s)"
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value)}
            />
            <div className="text-xs text-txt-secondary text-right mt-0.5">
              Min 20 characters &middot; {reasoning.length}/500
            </div>
          </div>

          {/* Public Interest (conditional) */}
          {needsPI && (
            <div>
              <label className="text-sm font-semibold text-txt-primary block mb-1">
                PUBLIC INTEREST CONSIDERATION <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-txt-secondary mb-2">
                Section 7(1) requires you to consider whether the withholding of this information is outweighed by
                the public interest in disclosure.
              </p>
              <textarea
                className="input-field h-20 resize-none"
                placeholder="Have you considered whether the public interest in disclosure outweighs the need to withhold?"
                value={piConsideration}
                onChange={(e) => setPiConsideration(e.target.value)}
              />
            </div>
          )}

          {/* AI Suggestion */}
          {aiSuggestedGround && aiExplanation && (
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
              <div className="flex items-center gap-2 mb-1">
                <Brain className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-semibold text-blue-700 uppercase">AI Suggestion</span>
              </div>
              <div className="text-sm text-blue-900 mb-2">{aiExplanation}</div>
              <button onClick={useAiSuggestion} className="text-xs font-medium text-blue-700 hover:underline">
                Use AI suggestion
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            className="btn-primary"
            disabled={!canApply}
            onClick={() => {
              if (selectedGround) onApply(selectedGround, reasoning, piConsideration);
            }}
          >
            Apply Ground
          </button>
        </div>
      </div>
    </div>
  );
}
