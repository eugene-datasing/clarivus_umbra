import { NextRequest, NextResponse } from "next/server";

/**
 * CSRF protection via custom header check.
 *
 * Requires state-changing requests (POST, PUT, DELETE, PATCH) to include
 * the header `X-Requested-With: XMLHttpRequest`. Browsers will not send
 * custom headers on cross-origin requests without a CORS preflight, and
 * our CORS policy does not allow arbitrary origins — so forged cross-site
 * requests will be blocked.
 *
 * Returns a 403 response if the header is missing, or null if OK.
 */
export function requireCsrfHeader(
  request: NextRequest,
): NextResponse | null {
  const method = request.method.toUpperCase();

  // Only enforce on state-changing methods
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return null;
  }

  const header = request.headers.get("x-requested-with");
  if (header === "XMLHttpRequest") {
    return null;
  }

  return NextResponse.json(
    { error: "Missing required X-Requested-With header." },
    { status: 403 },
  );
}
