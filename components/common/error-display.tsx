"use client";

import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface ErrorDisplayProps {
  title?: string;
  message: string;
  suggestion?: string;
  backHref?: string;
  backLabel?: string;
  onRetry?: () => void;
  variant?: "inline" | "page" | "card";
}

export default function ErrorDisplay({
  title = "Something went wrong",
  message,
  suggestion,
  backHref,
  backLabel = "Go back",
  onRetry,
  variant = "card",
}: ErrorDisplayProps) {
  if (variant === "inline") {
    return (
      <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-card text-sm">
        <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-red-800">{message}</p>
          {suggestion && (
            <p className="text-red-600 text-xs mt-1">{suggestion}</p>
          )}
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-xs text-red-700 hover:text-red-900 underline mt-1.5 flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  const Wrapper = variant === "page" ? "div" : "div";
  return (
    <Wrapper
      className={cn(
        "text-center",
        variant === "page" && "min-h-[60vh] flex items-center justify-center p-6",
        variant === "card" && "card py-12 px-6",
      )}
    >
      <div className="max-w-md mx-auto">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-7 h-7 text-red-500" />
        </div>
        <h2 className="text-lg font-heading font-semibold text-txt-primary mb-2">
          {title}
        </h2>
        <p className="text-sm text-txt-secondary mb-2">{message}</p>
        {suggestion && (
          <p className="text-xs text-txt-secondary/70 mb-4 bg-surface-bg rounded-card p-3">
            {suggestion}
          </p>
        )}
        <div className="flex items-center justify-center gap-3 mt-4">
          {backHref && (
            <Link href={backHref} className="btn-ghost flex items-center gap-1.5">
              <ArrowLeft className="w-4 h-4" />
              {backLabel}
            </Link>
          )}
          {onRetry && (
            <button
              onClick={onRetry}
              className="btn-primary flex items-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          )}
        </div>
      </div>
    </Wrapper>
  );
}
