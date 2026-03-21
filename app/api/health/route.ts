import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  openAICircuit,
  docIntelCircuit,
} from "@/lib/resilience/azure-services";
import { logger } from "@/lib/logger";
import { trackException } from "@/lib/telemetry";

const log = logger.child({ module: "api", route: "/api/health" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CheckStatus = "ok" | "error" | "circuit-open" | "circuit-half-open";

/**
 * GET /api/health
 *
 * Health check endpoint for load balancers, monitoring, and Azure App Service.
 * Returns 200 if everything is healthy, 200 with "degraded" if a circuit
 * breaker is open (the app can still serve requests in degraded mode), and 503
 * if a critical dependency like the database is down.
 */
export async function GET() {
  const checks: Record<string, CheckStatus> = {
    app: "ok",
    database: "error",
    openai: "ok",
    documentIntelligence: "ok",
  };

  // -- Database --
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch (err) {
    log.error("Database check failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    trackException(err, { route: "/api/health", check: "database" });
  }

  // -- Azure OpenAI circuit breaker --
  const openAIState = openAICircuit.getState();
  if (openAIState === "open") {
    checks.openai = "circuit-open";
  } else if (openAIState === "half-open") {
    checks.openai = "circuit-half-open";
  }

  // -- Azure Document Intelligence circuit breaker --
  const docIntelState = docIntelCircuit.getState();
  if (docIntelState === "open") {
    checks.documentIntelligence = "circuit-open";
  } else if (docIntelState === "half-open") {
    checks.documentIntelligence = "circuit-half-open";
  }

  // -- Derive overall status --
  const hasCriticalFailure = checks.database === "error";
  const hasCircuitOpen =
    checks.openai === "circuit-open" ||
    checks.documentIntelligence === "circuit-open" ||
    checks.openai === "circuit-half-open" ||
    checks.documentIntelligence === "circuit-half-open";

  let status: "healthy" | "degraded" | "unhealthy";
  let httpStatus: number;

  if (hasCriticalFailure) {
    status = "unhealthy";
    httpStatus = 503;
  } else if (hasCircuitOpen) {
    status = "degraded";
    httpStatus = 200;
  } else {
    status = "healthy";
    httpStatus = 200;
  }

  return NextResponse.json(
    {
      status,
      checks,
      circuits: {
        openai: openAICircuit.getStats(),
        documentIntelligence: docIntelCircuit.getStats(),
      },
      timestamp: new Date().toISOString(),
    },
    { status: httpStatus },
  );
}
