import { NextRequest, NextResponse } from "next/server";
import { trackException } from "@/lib/telemetry";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "api", route: "/api/telemetry/error" });

/**
 * POST /api/telemetry/error
 *
 * Receives client-side errors from the error boundary and forwards them
 * to Application Insights.  This is a fire-and-forget endpoint -- always
 * returns 204 regardless of outcome.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const message = typeof body.message === "string" ? body.message : "Unknown client error";

    log.error("Client-side error reported", {
      message,
      digest: body.digest,
      source: body.source,
    });

    trackException(new Error(message), {
      source: "client-error-boundary",
      digest: body.digest ?? "",
    });
  } catch {
    // Swallow parse errors -- telemetry endpoint must never fail
  }

  return new NextResponse(null, { status: 204 });
}
