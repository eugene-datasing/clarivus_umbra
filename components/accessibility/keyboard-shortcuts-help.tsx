"use client";

import { useEffect, useRef, useCallback } from "react";
import { X } from "lucide-react";

interface Shortcut {
  keys: string;
  description: string;
}

const shortcuts: Shortcut[] = [
  { keys: "Arrow Up / Down", description: "Navigate between detections" },
  { keys: "Enter / Space", description: "Select detection" },
  { keys: "A", description: "Accept selected detection" },
  { keys: "R", description: "Reject selected detection" },
  { keys: "Escape", description: "Deselect / close dialog" },
  { keys: "?", description: "Toggle this help dialog" },
];

interface KeyboardShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

export default function KeyboardShortcutsHelp({ open, onClose }: KeyboardShortcutsHelpProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Store reference to previously focused element and focus the dialog on open
  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement;
      // Focus the close button after a brief delay for render
      setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 50);
    } else if (previouslyFocusedRef.current) {
      previouslyFocusedRef.current.focus();
      previouslyFocusedRef.current = null;
    }
  }, [open]);

  // Focus trap within the dialog
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      // Focus trap: Tab key
      if (e.key === "Tab") {
        const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusableElements || focusableElements.length === 0) return;

        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstFocusable) {
            e.preventDefault();
            lastFocusable.focus();
          }
        } else {
          if (document.activeElement === lastFocusable) {
            e.preventDefault();
            firstFocusable.focus();
          }
        }
      }
    },
    [onClose]
  );

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[80] bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-title"
        onKeyDown={handleKeyDown}
        className="fixed z-[81] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-surface-card border border-border rounded-card shadow-xl p-5"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2
            id="keyboard-shortcuts-title"
            className="text-sm font-semibold text-txt-primary"
          >
            Keyboard Shortcuts
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="touch-target p-1.5 rounded-lg text-txt-secondary hover:text-txt-primary hover:bg-surface-hover transition-colors"
            aria-label="Close keyboard shortcuts dialog"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Shortcuts list */}
        <dl className="space-y-2">
          {shortcuts.map((shortcut) => (
            <div
              key={shortcut.keys}
              className="flex items-center justify-between gap-3 py-1.5 border-b border-border/50 last:border-0"
            >
              <dt className="text-xs text-txt-secondary">{shortcut.description}</dt>
              <dd className="shrink-0">
                <kbd className="inline-block font-mono text-[11px] bg-gray-100 text-txt-primary px-2 py-1 rounded border border-gray-200 shadow-sm">
                  {shortcut.keys}
                </kbd>
              </dd>
            </div>
          ))}
        </dl>

        {/* Footer hint */}
        <p className="mt-4 text-[10px] text-txt-secondary text-center">
          Press <kbd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px] border border-gray-200">?</kbd> or <kbd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px] border border-gray-200">Esc</kbd> to close
        </p>
      </div>
    </>
  );
}
