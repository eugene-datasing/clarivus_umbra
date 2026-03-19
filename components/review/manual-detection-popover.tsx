"use client";

import { useState } from "react";
import { X, Plus, AlertCircle } from "lucide-react";
import { detectionTypeConfig } from "@/lib/db/mappers";
import { lgoimaGrounds } from "@/lib/lgoima-grounds";
import { cn } from "@/lib/utils";

interface ManualDetectionPopoverProps {
  selectedText: string;
  page: number;
  position: { x: number; y: number };
  onSubmit: (data: {
    text: string;
    type: string;
    page: number;
    ground?: string;
    reasoning?: string;
  }) => void;
  onCancel: () => void;
}

const DETECTION_TYPES = [
  "personal-name",
  "phone",
  "email-addr",
  "ird",
  "address",
  "commercial",
  "free-frank",
  "legal-privilege",
  "confidential",
] as const;

export default function ManualDetectionPopover({
  selectedText,
  page,
  position,
  onSubmit,
  onCancel,
}: ManualDetectionPopoverProps) {
  const [text, setText] = useState(selectedText);
  const [type, setType] = useState<string>("personal-name");
  const [ground, setGround] = useState<string>("");
  const [reasoning, setReasoning] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const commonGrounds = lgoimaGrounds.filter((g) => g.common);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        text: text.trim(),
        type,
        page,
        ground: ground || undefined,
        reasoning: reasoning || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Position the popover near the selection, clamping to viewport
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(position.x, window.innerWidth - 360),
    top: Math.min(position.y + 10, window.innerHeight - 440),
    zIndex: 60,
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        onClick={onCancel}
      />

      {/* Popover */}
      <div style={style} className="w-[340px] bg-surface-card border border-border rounded-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Plus size={14} className="text-brand-primary" />
            <span className="text-xs font-semibold text-txt-primary">
              Add Manual Detection
            </span>
          </div>
          <button
            onClick={onCancel}
            className="text-txt-secondary hover:text-txt-primary"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Selected text (editable for OCR correction) */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-txt-secondary block mb-1">
              Selected Text
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="input-field text-xs min-h-[48px] resize-none"
              placeholder="Selected text..."
            />
            <p className="text-[9px] text-txt-secondary/60 mt-0.5">
              Edit to correct OCR errors if needed
            </p>
          </div>

          {/* Detection type */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-txt-secondary block mb-1">
              Detection Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="input-field text-xs"
            >
              {DETECTION_TYPES.map((t) => {
                const conf = detectionTypeConfig[t];
                return (
                  <option key={t} value={t}>
                    {conf?.label ?? t}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Withholding ground */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-txt-secondary block mb-1">
              Withholding Ground
            </label>
            <select
              value={ground}
              onChange={(e) => setGround(e.target.value)}
              className="input-field text-xs"
            >
              <option value="">Select ground (optional)</option>
              {commonGrounds.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.reference} — {g.label}
                </option>
              ))}
            </select>
          </div>

          {/* Reasoning */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-txt-secondary block mb-1">
              Reasoning
            </label>
            <textarea
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value)}
              className="input-field text-xs min-h-[36px] resize-none"
              placeholder="Why should this be redacted? (optional)"
            />
          </div>

          {/* Page indicator */}
          <div className="flex items-center gap-1.5 text-[10px] text-txt-secondary">
            <AlertCircle size={10} />
            <span>Page {page}</span>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={onCancel}
              className="btn-ghost text-xs"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!text.trim() || submitting}
              className={cn(
                "btn-primary text-xs flex items-center gap-1.5",
                submitting && "opacity-60 pointer-events-none",
              )}
            >
              <Plus size={12} />
              {submitting ? "Adding..." : "Add Detection"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
