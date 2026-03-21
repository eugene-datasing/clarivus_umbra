/**
 * NextAuth v5 configuration — WP16
 *
 * Full auth config with credentials provider and optional Azure AD (Entra ID)
 * SSO provider (requires Node.js runtime). Passwords are hashed with bcrypt.
 *
 * Azure AD / Entra ID SSO is enabled when the following env vars are set:
 *   AZURE_AD_CLIENT_ID=...
 *   AZURE_AD_CLIENT_SECRET=...
 *   AZURE_AD_TENANT_ID=...
 */

import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { authConfig } from "./auth.config";

// ---------------------------------------------------------------------------
// Build providers list — Credentials is always present; Azure AD is
// conditional on env vars being configured.
// ---------------------------------------------------------------------------
const providers: Provider[] = [
  Credentials({
    name: "Veil Login",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = credentials?.email as string | undefined;
      const password = credentials?.password as string | undefined;

      if (!email || !password) return null;

      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user || !user.passwordHash) return null;

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) return null;

      return {
        id: user.id,
        name: user.name,
        email: user.email ?? undefined,
        role: user.role,
      };
    },
  }),
];

if (process.env.AZURE_AD_CLIENT_ID) {
  providers.push(
    MicrosoftEntraID({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      issuer: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/v2.0`,
      authorization: {
        params: { scope: "openid profile email User.Read" },
      },
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
  callbacks: {
    ...authConfig.callbacks,

    /**
     * signIn callback — runs on every sign-in attempt.
     *
     * For Azure AD (microsoft-entra-id) users we auto-provision a local DB
     * record if one doesn't already exist, and attach the local userId + role
     * to the user object so the downstream jwt callback can pick them up.
     *
     * For credentials sign-ins the user object is already populated by
     * authorize(), so we just pass through.
     */
    async signIn({ user, account }) {
      if (account?.provider === "microsoft-entra-id") {
        const email = user.email;
        if (!email) return false; // Reject sign-in if Azure AD didn't give us an email

        let dbUser = await prisma.user.findUnique({ where: { email } });

        if (!dbUser) {
          // Auto-provision: create a new local user with the default "reviewer" role
          dbUser = await prisma.user.create({
            data: {
              name: user.name ?? email.split("@")[0],
              email,
              role: "reviewer",
              // No passwordHash — SSO-only user
            },
          });
        }

        // Attach local DB id and role to the user object so the jwt callback
        // in auth.config.ts can read them via `user.id` and `user.role`.
        user.id = dbUser.id;
        (user as { role?: string }).role = dbUser.role;
      }

      return true;
    },

    /**
     * jwt callback — wraps the base jwt callback from auth.config.ts.
     *
     * Because auth.config.ts runs in Edge and cannot import Prisma, the
     * heavy lifting (DB lookup) is done in signIn above. By the time the
     * jwt callback fires, user.id and user.role are already set correctly
     * for both credentials and Azure AD flows, so the base callback works
     * as-is.
     */
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role ?? "reviewer";
        token.userId = (user as { id?: string }).id;
      }
      return token;
    },
  },
});
