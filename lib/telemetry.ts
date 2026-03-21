/**
 * Application Insights integration for the Veil prototype.
 *
 * Conditionally initialises Azure Application Insights when the
 * APPLICATIONINSIGHTS_CONNECTION_STRING env var is set.  All exported
 * functions are safe to call even when App Insights is not configured --
 * they become no-ops.
 *
 * Usage:
 *   import { initTelemetry, trackException, trackEvent, trackMetric } from "@/lib/telemetry";
 *
 *   // Call once at startup (e.g. from instrumentation.ts)
 *   initTelemetry();
 *
 *   // Track errors from catch blocks
 *   trackException(error, { route: "/api/documents/upload" });
 */

import type { TelemetryClient } from "applicationinsights";

// ---------------------------------------------------------------------------
// Singleton client
// ---------------------------------------------------------------------------

let client: TelemetryClient | null = null;
let initialised = false;

/**
 * Initialise Application Insights.
 *
 * Safe to call multiple times -- subsequent calls are ignored.
 * If APPLICATIONINSIGHTS_CONNECTION_STRING is not set, this is a no-op.
 */
export function initTelemetry(): void {
  if (initialised) return;
  initialised = true;

  const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  if (!connectionString) {
    return;
  }

  try {
    // Dynamic import to avoid loading the SDK when not needed.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appInsights = require("applicationinsights") as typeof import("applicationinsights");

    client = new appInsights.TelemetryClient(connectionString);
    client.initialize();
  } catch (err) {
    // If the SDK fails to load, degrade gracefully.
    console.error("[telemetry] Failed to initialise Application Insights:", err);
    client = null;
  }
}

// ---------------------------------------------------------------------------
// Tracking helpers
// ---------------------------------------------------------------------------

/**
 * Track an exception in Application Insights.
 *
 * @param error - The error object or a descriptive string.
 * @param properties - Optional key-value properties attached to the telemetry.
 */
export function trackException(
  error: unknown,
  properties?: Record<string, string>,
): void {
  if (!client) return;

  const exception =
    error instanceof Error ? error : new Error(String(error));

  client.trackException({
    exception,
    properties,
  });
}

/**
 * Track a custom event in Application Insights.
 *
 * @param name - Event name (e.g. "document_processed", "export_generated").
 * @param properties - Optional key-value properties attached to the event.
 */
export function trackEvent(
  name: string,
  properties?: Record<string, string>,
): void {
  if (!client) return;

  client.trackEvent({ name, properties });
}

/**
 * Track a numeric metric in Application Insights.
 *
 * @param name - Metric name (e.g. "pipeline.duration_ms", "queue.depth").
 * @param value - Numeric metric value.
 */
export function trackMetric(name: string, value: number): void {
  if (!client) return;

  client.trackMetric({ name, value });
}
