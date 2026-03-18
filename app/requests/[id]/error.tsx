"use client";

import { AlertCircle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-6 max-w-lg">
      <div className="card border-red-200 bg-red-50/50">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-red-700 mb-1">
              Something went wrong
            </h2>
            <p className="text-xs text-red-600 mb-3">
              {error.message || "An unexpected error occurred while loading this page."}
            </p>
            <button onClick={reset} className="btn-secondary text-xs">
              Try again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
