/**
 * NextAuth v5 middleware — WP16
 *
 * Protects routes based on authentication and role.
 * - Public: /login, /api/auth
 * - Admin-only: /admin/*
 * - Senior-reviewer+: /admin/ai-governance, sign-off actions
 * - All other routes: require authenticated session
 */

import { auth } from "@/lib/auth/auth-options";
import { NextResponse } from "next/server";

const publicPaths = ["/login", "/api/auth"];

const adminPaths = ["/admin"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Require auth for everything else
  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Role-based protection for admin routes
  const role = (req.auth.user as { role?: string })?.role;
  if (pathname.startsWith("/admin") && role !== "admin" && role !== "senior-reviewer") {
    // Redirect non-admin users away from admin pages
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
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
