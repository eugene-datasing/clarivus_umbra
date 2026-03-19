/**
 * NextAuth v5 base config — WP16
 *
 * This file contains only the config that is safe to import in middleware
 * (Edge runtime). No Node.js-only imports (crypto, prisma, etc.).
 *
 * The full provider config lives in auth-options.ts.
 */

import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  providers: [] as [],  // Providers added in auth-options.ts; empty here for Edge middleware
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role ?? "reviewer";
        token.userId = (user as { id?: string }).id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { id?: string }).id = token.userId as string;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = nextUrl;

      // Public paths — always allow
      if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
        return true;
      }

      // Everything else requires auth
      if (!isLoggedIn) return false;

      // Admin route protection
      const role = (auth?.user as { role?: string })?.role;
      if (pathname.startsWith("/admin") && role !== "admin" && role !== "senior-reviewer") {
        return Response.redirect(new URL("/", nextUrl));
      }

      return true;
    },
  },
  secret: process.env.AUTH_SECRET ?? "veil-dev-secret-change-in-production",
} satisfies NextAuthConfig;
