"use client";

import { useEffect } from "react";

/**
 * Report a client-side error to the server for Application Insights tracking.
 * Fire-and-forget -- failures are silently ignored.
 */
function reportErrorToServer(error: Error & { digest?: string }) {
  try {
    const payload = JSON.stringify({
      message: error.message,
      digest: error.digest,
      stack: error.stack?.slice(0, 2000),
      source: "client-error-boundary",
    });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/telemetry/error", payload);
    } else {
      fetch("/api/telemetry/error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      }).catch(() => {});
    }
  } catch {
    // Swallow -- telemetry must never break the UI
  }
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error-boundary]", error);
    reportErrorToServer(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-6xl font-bold text-red-200">500</h1>
      <h2 className="mt-4 text-xl font-semibold text-gray-700">
        Something went wrong
      </h2>
      <p className="mt-2 max-w-md text-gray-500">
        An unexpected error occurred. If this persists, please contact support.
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
