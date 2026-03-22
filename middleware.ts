/**
 * NextAuth v5 middleware — WP16
 *
 * Uses the lightweight auth.config (no Node.js deps) so it runs in
 * Edge runtime without pulling in crypto or prisma.
 *
 * Uses the auth() wrapper to populate req.auth, then manually enforces
 * auth checks and adds the x-pathname header for server components.
 *
 * NOTE: When using auth((req) => { ... }) wrapper pattern, the
 * `authorized` callback in auth.config is NOT enforced for redirects.
 * Auth checks must be done explicitly inside the wrapper function.
 */

import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth?.user;

  // Public paths — always allow without auth
  if (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/api/activation-status" ||
    pathname.startsWith("/api/demo-request") ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname === "/offline.html"
  ) {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-pathname", pathname);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Everything else requires auth — redirect to login if not signed in
  if (!isLoggedIn) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin route protection
  const role = (req.auth?.user as { role?: string })?.role;
  const adminRoles = ["admin", "senior-reviewer", "request-manager", "final-approver"];
  if (pathname.startsWith("/admin") && !adminRoles.includes(role ?? "")) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  // Authenticated — add pathname header and continue
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - favicon.ico
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
