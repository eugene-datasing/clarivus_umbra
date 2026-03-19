"use client";

import { useState } from "react";
import {
  Lightbulb,
  Search,
  CheckCircle,
  X,
  Loader2,
  Plus,
  BookOpen,
} from "lucide-react";
import {
  suggestCustomRule,
  scanCrossDocument,
  bulkCreateCrossDocDetections,
} from "@/lib/actions/manual-detection-actions";
import { cn } from "@/lib/utils";

interface AILearningPanelProps {
  detectionId: string;
  detectionText: string;
  caseId: string;
  onClose: () => void;
  onCrossDocCreated?: (count: number) => void;
}

interface CrossDocMatch {
  documentId: string;
  documentName: string;
  pageNumber: number;
  snippet: string;
}

export default function AILearningPanel({
  detectionId,
  detectionText,
  caseId,
  onClose,
  onCrossDocCreated,
}: AILearningPanelProps) {
  // Rule suggestion
  const [ruleStatus, setRuleStatus] = useState<"idle" | "loading" | "done">("idle");
  const [ruleResult, setRuleResult] = useState<{ ruleId: string; alreadyExists: boolean } | null>(null);

  // Cross-doc scan
  const [scanStatus, setScanStatus] = useState<"idle" | "loading" | "done">("idle");
  const [scanMatches, setScanMatches] = useState<CrossDocMatch[]>([]);
  const [selectedMatches, setSelectedMatches] = useState<Set<number>>(new Set());
  const [applyingCrossDoc, setApplyingCrossDoc] = useState(false);
  const [crossDocApplied, setCrossDocApplied] = useState(0);

  const handleSuggestRule = async () => {
    setRuleStatus("loading");
    try {
      const result = await suggestCustomRule(detectionId);
      setRuleResult(result);
      setRuleStatus("done");
    } catch {
      setRuleStatus("idle");
    }
  };

  const handleScanCrossDoc = async () => {
    setScanStatus("loading");
    try {
      const result = await scanCrossDocument(detectionId, caseId);
      setScanMatches(result.matches);
      // Select all by default
      setSelectedMatches(new Set(result.matches.map((_, i) => i)));
      setScanStatus("done");
    } catch {
      setScanStatus("idle");
    }
  };

  const handleApplyCrossDoc = async () => {
    const targets = scanMatches
      .filter((_, i) => selectedMatches.has(i))
      .map((m) => ({ documentId: m.documentId, pageNumber: m.pageNumber }));

    if (targets.length === 0) return;

    setApplyingCrossDoc(true);
    try {
      const result = await bulkCreateCrossDocDetections({
        sourceDetectionId: detectionId,
        targets,
      });
      setCrossDocApplied(result.created);
      onCrossDocCreated?.(result.created);
    } catch {
      // ignore
    } finally {
      setApplyingCrossDoc(false);
    }
  };

  const toggleMatch = (idx: number) => {
    setSelectedMatches((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="fixed bottom-[290px] right-6 w-[340px] bg-surface-card border border-border rounded-card shadow-xl z-40">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Lightbulb size={14} className="text-amber-500" />
          <span className="text-xs font-semibold text-txt-primary">AI Learning</span>
        </div>
        <button onClick={onClose} className="text-txt-secondary hover:text-txt-primary">
          <X size={14} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Confirmation */}
        <div className="flex items-start gap-2 text-[11px]">
          <BookOpen size={13} className="text-brand-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-txt-primary font-medium">Recorded as training example</p>
            <p className="text-txt-secondary mt-0.5">
              &quot;{detectionText.length > 50 ? detectionText.slice(0, 50) + "..." : detectionText}&quot;
              will improve future AI detection accuracy.
            </p>
          </div>
        </div>

        {/* Custom Rule suggestion */}
        <div className="border border-border rounded-input p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-txt-secondary">
              Custom Rule Suggestion
            </span>
          </div>

          {ruleStatus === "idle" && (
            <button
              onClick={handleSuggestRule}
              className="btn-ghost text-xs flex items-center gap-1.5 w-full justify-center"
            >
              <Plus size={12} />
              Create rule to detect &quot;{detectionText.length > 25 ? detectionText.slice(0, 25) + "..." : detectionText}&quot;
            </button>
          )}

          {ruleStatus === "loading" && (
            <div className="flex items-center gap-2 text-xs text-txt-secondary justify-center py-1">
              <Loader2 size={12} className="animate-spin" />
              Creating rule...
            </div>
          )}

          {ruleStatus === "done" && ruleResult && (
            <div className="flex items-center gap-2 text-xs">
              <CheckCircle size={12} className="text-confidence-high shrink-0" />
              <span className="text-txt-primary">
                {ruleResult.alreadyExists
                  ? "A similar rule already exists"
                  : "Draft rule created — activate in Admin > Rules"}
              </span>
            </div>
          )}
        </div>

        {/* Cross-document scan */}
        <div className="border border-border rounded-input p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-txt-secondary">
              Cross-Document Scan
            </span>
          </div>

          {scanStatus === "idle" && (
            <button
              onClick={handleScanCrossDoc}
              className="btn-ghost text-xs flex items-center gap-1.5 w-full justify-center"
            >
              <Search size={12} />
              Search other documents for this text
            </button>
          )}

          {scanStatus === "loading" && (
            <div className="flex items-center gap-2 text-xs text-txt-secondary justify-center py-1">
              <Loader2 size={12} className="animate-spin" />
              Scanning documents...
            </div>
          )}

          {scanStatus === "done" && (
            <>
              {scanMatches.length === 0 ? (
                <div className="text-xs text-txt-secondary text-center py-1">
                  No matches found in other documents.
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] text-txt-primary font-medium">
                    Found in {scanMatches.length} location{scanMatches.length !== 1 ? "s" : ""}:
                  </p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {scanMatches.map((match, idx) => (
                      <label
                        key={idx}
                        className={cn(
                          "flex items-start gap-2 text-[10px] p-1.5 rounded cursor-pointer hover:bg-surface-hover",
                          selectedMatches.has(idx) && "bg-brand-primary/5",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={selectedMatches.has(idx)}
                          onChange={() => toggleMatch(idx)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0">
                          <span className="font-medium text-txt-primary block truncate">
                            {match.documentName}
                          </span>
                          <span className="text-txt-secondary">
                            p.{match.pageNumber}: {match.snippet}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>

                  {crossDocApplied > 0 ? (
                    <div className="flex items-center gap-2 text-xs text-confidence-high">
                      <CheckCircle size={12} />
                      Applied to {crossDocApplied} location{crossDocApplied !== 1 ? "s" : ""}
                    </div>
                  ) : (
                    <button
                      onClick={handleApplyCrossDoc}
                      disabled={selectedMatches.size === 0 || applyingCrossDoc}
                      className={cn(
                        "btn-primary text-xs w-full flex items-center gap-1.5 justify-center",
                        (selectedMatches.size === 0 || applyingCrossDoc) && "opacity-60",
                      )}
                    >
                      {applyingCrossDoc ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          Applying...
                        </>
                      ) : (
                        <>
                          <Plus size={12} />
                          Apply to {selectedMatches.size} selected
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
