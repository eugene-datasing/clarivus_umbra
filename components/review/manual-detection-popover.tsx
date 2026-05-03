"use client";

import { useEffect, useRef, useState } from "react";
import { X, Plus, AlertCircle } from "lucide-react";
import { detectionTypeConfig } from "@/lib/db/mappers";
import { cn } from "@/lib/utils";

interface ManualDetectionPopoverProps {
  selectedText: string;
  page: number;
  position: { x: number; y: number };
  /**
   * Submit handler. May throw on failure — the popover catches and
   * surfaces an inline error rather than relying on the parent to
   * close the popover (which it only does on success). On error the
   * popover stays mounted with the error visible and submitting reset
   * so the user can retry, refresh, or cancel.
   */
  onSubmit: (data: {
    text: string;
    type: string;
    page: number;
    ground?: string;
    reasoning?: string;
  }) => Promise<void> | void;
  onCancel: () => void;
}

const DETECTION_TYPES = [
  "personal-name",
  "phone",
  "email-addr",
  "ird",
  "address",
  "bank-account",
  "nz-passport",
  "nz-driver-licence",
  "vehicle-reg",
  "nhi",
  "sensitive-context",
] as const;

// Position delta (px in either axis) above which the popover treats
// a new (selectedText, position) prop pair as a "fresh selection"
// rather than an in-progress Shift+Arrow extension. Below this
// threshold the popover preserves any user-edits to the textarea;
// above it (or on remount), edits are reset so the user sees the
// new selection's text. The close-and-reopen path remounts the
// component naturally via the conditional render in the parent
// (`{manualPopover && <ManualDetectionPopover ... />}`), so this
// heuristic only matters for the rare case where the popover
// stays mounted across a brand-new selection without unmounting.
const FRESH_SELECTION_DELTA_PX = 50;

export default function ManualDetectionPopover({
  selectedText,
  page,
  position,
  onSubmit,
  onCancel,
}: ManualDetectionPopoverProps) {
  const [text, setText] = useState(selectedText);
  const [type, setType] = useState<string>("personal-name");
  // Phase 12.1 (Umbra v2) — `ground` removed (no LGOIMA vocabulary
  // in v2). The submit payload still carries the optional field for
  // backward compatibility with the server-action shape; it's
  // never populated client-side post-rewrite.
  const [reasoning, setReasoning] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{
    kind: "stale-deploy" | "generic";
    message: string;
  } | null>(null);

  // Track whether the user has manually edited the textarea (e.g.
  // OCR correction). Once they have, we stop syncing the textarea's
  // value from `selectedText` so their edits aren't clobbered by
  // continued keyboard-selection extension. Stored as a ref because
  // the flag drives effect logic but doesn't need to trigger renders.
  const userEditedTextRef = useRef(false);

  // Track the last position prop so we can detect a "fresh selection"
  // (large jump) versus an in-progress extension (small delta).
  const lastPositionRef = useRef(position);

  // Slice B2 fix: prop-driven sync of `selectedText` into local
  // textarea state. Without this, `useState(selectedText)`'s lazy
  // initialiser only fires on first mount; subsequent prop updates
  // (each Shift+Arrow keyup re-fires `setManualPopover` in the parent
  // with a new selection) are ignored and the textarea stays stale.
  //
  // We sync only when the user hasn't manually edited the textarea —
  // OCR correction is one of the explicit affordances of this popover
  // (see the helper text below the textarea), so an edit must
  // survive subsequent keyup events.
  //
  // On a "fresh selection" (large position jump), reset the edit flag
  // so future syncs resume — covers the case where the popover stays
  // mounted while the user starts a new selection elsewhere.
  useEffect(() => {
    const dx = Math.abs(position.x - lastPositionRef.current.x);
    const dy = Math.abs(position.y - lastPositionRef.current.y);
    const isFreshSelection =
      dx > FRESH_SELECTION_DELTA_PX || dy > FRESH_SELECTION_DELTA_PX;
    lastPositionRef.current = position;

    if (isFreshSelection) {
      userEditedTextRef.current = false;
      setText(selectedText);
      return;
    }
    if (!userEditedTextRef.current) {
      setText(selectedText);
    }
  }, [selectedText, position]);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit({
        text: text.trim(),
        type,
        page,
        reasoning: reasoning || undefined,
      });
      // Success path: parent closes the popover via setManualPopover(null),
      // which unmounts this component. No state cleanup needed here.
    } catch (err) {
      // Stale-deploy error pattern: any open client tab that loaded a
      // previous deploy hits "Failed to find Server Action" on the
      // first action call to the new deploy. Detect from any of:
      //   - `err.message` literal (works in dev where Next forwards
      //     the raw error string; works in prod when the server
      //     action wrapper doesn't mask),
      //   - `err.cause?.message` (some serialisation paths nest),
      //   - `err.digest` matching `NEXT_ERROR_CODE` E787 / E788
      //     (Next 15.5.13's action-handler.js:472,608,822 — the codes
      //     for the not-found and decode-failure cases). Production
      //     RSC error formatting often masks the message but exposes
      //     the digest, so this is the more reliable prod signal.
      // Other errors get a generic retry message that ALSO suggests
      // refreshing as a fallback recovery — covers prod's worst case
      // where the digest is suppressed and we can't positively
      // identify the stale-deploy path.
      const message = err instanceof Error ? err.message : String(err);
      const causeMessage =
        err instanceof Error && err.cause instanceof Error
          ? err.cause.message
          : "";
      const digest =
        err instanceof Error && typeof (err as { digest?: unknown }).digest === "string"
          ? ((err as { digest?: string }).digest ?? "")
          : "";
      const haystack = `${message}\n${causeMessage}\n${digest}`;
      const isStaleDeploy =
        /Failed to find Server Action/i.test(haystack) ||
        /\bE7(87|88)\b/.test(digest);
      setSubmitError({
        kind: isStaleDeploy ? "stale-deploy" : "generic",
        message: isStaleDeploy
          ? "This page needs to refresh \u2014 the app was updated. Press Ctrl/Cmd+Shift+R to reload."
          : "Couldn't add detection. Please try again, or refresh (Ctrl/Cmd+Shift+R) if you've had this page open a while.",
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
              onChange={(e) => {
                setText(e.target.value);
                userEditedTextRef.current = true;
              }}
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

          {/* Error banner — shown when onSubmit throws. Stale-deploy
              errors get a refresh prompt; other errors get a retry
              message. The banner stays until the user retries (which
              clears it via setSubmitError(null) in handleSubmit) or
              cancels. */}
          {submitError && (
            <div
              role="alert"
              data-error-kind={submitError.kind}
              className="rounded-input border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-2"
            >
              <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{submitError.message}</span>
            </div>
          )}

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
