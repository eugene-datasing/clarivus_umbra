"use client";

import { useEffect } from "react";
import ErrorDisplay from "@/components/common/error-display";

function reportErrorToServer(error: Error & { digest?: string }) {
  try {
    const payload = JSON.stringify({
      message: error.message,
      digest: error.digest,
      stack: error.stack?.slice(0, 2000),
      source: "case-error-boundary",
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
    // Swallow
  }
}

export default function CaseError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportErrorToServer(error);
  }, [error]);

  // Classify the error to provide helpful suggestions
  const rawMessage = error.message || "";
  const isAccessDenied = rawMessage.includes("Access denied");
  const message = isAccessDenied
    ? "You don't have permission to access this resource."
    : rawMessage || "An unexpected error occurred while loading this page.";
  let suggestion: string | undefined;

  if (isAccessDenied) {
    suggestion = "Your account may not be assigned to the correct department for this case. Contact your administrator to update your access.";
  } else if (rawMessage.includes("not found") || rawMessage.includes("Not found")) {
    suggestion = "This case may have been deleted or the URL may be incorrect. Check the case reference and try again.";
  } else if (rawMessage.includes("database") || rawMessage.includes("prisma") || rawMessage.includes("connect")) {
    suggestion = "There may be a temporary database connection issue. Please wait a moment and try again.";
  } else if (rawMessage.includes("timeout") || rawMessage.includes("ETIMEDOUT")) {
    suggestion = "The request timed out. This may be due to heavy processing load. Please try again.";
  }

  return (
    <div className="p-6">
      <ErrorDisplay
        title="Error Loading Case"
        message={message}
        suggestion={suggestion}
        backHref="/batches"
        backLabel="Back to Cases"
        onRetry={reset}
        variant="card"
      />
    </div>
  );
}
