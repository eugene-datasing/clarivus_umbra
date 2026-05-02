/**
 * Next.js instrumentation hook.
 *
 * This file is automatically loaded once by Next.js on server startup.
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * Responsibilities:
 *   1. Validate environment variables (fail fast on misconfiguration).
 *   2. Initialise Application Insights telemetry.
 *   3. Start the pg-boss background worker (Phase 6a).
 */

export async function register() {
  // Only run on the server (not on the edge runtime).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // 1. Env validation -- importing the module triggers validation.
    await import("@/lib/config/env");

    // 2. Application Insights
    const { initTelemetry } = await import("@/lib/telemetry");
    initTelemetry();

    // 3. pg-boss worker — best-effort, log and continue if startup
    //    fails so the web server itself still comes up.
    try {
      const { startWorker } = await import("@/lib/jobs/runner");
      await startWorker();
    } catch (err) {
      console.error("[instrumentation] failed to start pg-boss worker:", err);
    }
  }
}
