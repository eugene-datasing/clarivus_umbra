import { NextResponse } from "next/server";
import { checkRateLimit } from "./rate-limit";

/**
 * Apply rate limiting to an API route. Call at the top of route handlers.
 * Returns a 429 response if rate limited, or null if allowed.
 *
 * @param identifier - Unique key (usually IP or userId)
 * @param maxRequests - Max requests per minute (default: 60)
 */
export function applyRateLimit(
  identifier: string,
  maxRequests = 60,
): NextResponse | null {
  const result = checkRateLimit(identifier, {
    windowMs: 60_000,
    maxRequests,
  });

  if (!result.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((result.retryAfterMs ?? 60000) / 1000)),
          "X-RateLimit-Limit": String(maxRequests),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  return null;
}
