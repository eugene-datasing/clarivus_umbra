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
  trustHost: true,  // Required behind Azure App Service reverse proxy
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    /**
     * jwt callback — maps user fields onto the JWT token.
     *
     * For Azure AD (microsoft-entra-id) sign-ins the signIn callback in
     * auth-options.ts resolves the local DB user first, then attaches the
     * local id and role to the user object. By the time this callback
     * fires, user.id and user.role are already correct for both
     * credentials and Azure AD flows.
     *
     * NOTE: This callback is overridden in auth-options.ts with an
     * identical implementation so that the full NextAuth instance uses it.
     * It is kept here for completeness (middleware Edge import).
     */
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
      // Note: /activate is NOT public — it requires authentication so the
      // user must sign in via Azure AD before entering the activation code.
      if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
        return true;
      }

      // Everything else requires auth
      if (!isLoggedIn) return false;

      // Admin route protection — restrict to roles with admin access
      const role = (auth?.user as { role?: string })?.role;
      const adminRoles = ["admin", "senior-reviewer", "request-manager", "final-approver"];
      if (pathname.startsWith("/admin") && !adminRoles.includes(role ?? "")) {
        return Response.redirect(new URL("/", nextUrl));
      }

      return true;
    },
  },
  secret: process.env.AUTH_SECRET,
} satisfies NextAuthConfig;
