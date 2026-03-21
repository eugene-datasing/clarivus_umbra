/**
 * NextAuth v5 middleware — WP16
 *
 * Uses the lightweight auth.config (no Node.js deps) so it runs in
 * Edge runtime without pulling in crypto or prisma.
 *
 * Wraps the NextAuth middleware to add an x-pathname header so that
 * server components (e.g. root layout) can read the current pathname
 * for activation gate checks.
 */

import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  // After NextAuth's authorized() callback has run, add pathname header
  // for server components to read.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", req.nextUrl.pathname);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
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
