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
import { getSetting, SETTING_KEYS, type InstanceConfig, DEFAULT_INSTANCE_CONFIG } from "@/lib/data/settings";

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
      if (!user.isActive) return null;

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
    async signIn({ user, account, profile }) {
      if (account?.provider === "microsoft-entra-id") {
        const email = user.email;
        if (!email) return false; // Reject sign-in if Azure AD didn't give us an email

        // Domain restriction: if instance_config has an allowedDomain, enforce it
        const instanceConfig = await getSetting<InstanceConfig>(
          SETTING_KEYS.INSTANCE_CONFIG,
          DEFAULT_INSTANCE_CONFIG,
        );
        if (instanceConfig.allowedDomain) {
          const domain = email.split("@")[1]?.toLowerCase();
          if (domain !== instanceConfig.allowedDomain.toLowerCase()) {
            console.warn(`[auth] Rejected sign-in: email domain "${domain}" does not match allowed domain "${instanceConfig.allowedDomain}"`);
            return false;
          }
        }

        // Extract OID from Azure AD profile (stable identity across email changes)
        const oid = (profile as { oid?: string } | undefined)?.oid
          ?? account.providerAccountId;

        // 1. Try OID-first match (stable across email changes)
        let dbUser = oid
          ? await prisma.user.findUnique({ where: { azureAdOid: oid } })
          : null;

        // 2. Fall back to email match
        if (!dbUser) {
          dbUser = await prisma.user.findUnique({ where: { email } });
        }

        if (dbUser) {
          // Check isActive gate
          if (!dbUser.isActive) return false;

          // Backfill OID if matched by email but missing OID
          if (oid && !dbUser.azureAdOid) {
            await prisma.user.update({
              where: { id: dbUser.id },
              data: { azureAdOid: oid },
            });
          }

          // Sync email if changed in Azure AD
          if (dbUser.email !== email) {
            await prisma.user.update({
              where: { id: dbUser.id },
              data: { email },
            });
          }
        } else {
          // Check if there's a matching invitation for this email
          const invitation = await prisma.userInvitation.findFirst({
            where: {
              email: { equals: email, mode: "insensitive" },
              status: "pending",
              expiresAt: { gt: new Date() },
            },
          });

          // Check if any users exist — if not, this is the bootstrap admin
          // (pre-activation flow: first user through Azure AD gets created)
          const userCount = await prisma.user.count();

          if (!invitation && userCount > 0) {
            // No invitation and not the first user — reject
            console.warn(`[auth] Rejected sign-in: no invitation found for "${email}"`);
            return false;
          }

          // Auto-provision from invitation or as bootstrap user.
          // First user (userCount === 0, no invitation) is the bootstrap admin.
          const bootstrapRole = invitation?.role ?? (userCount === 0 ? "admin" : "reviewer");
          dbUser = await prisma.user.create({
            data: {
              name: invitation?.name ?? user.name ?? email.split("@")[0],
              email,
              role: bootstrapRole,
              departmentId: invitation?.departmentId ?? null,
              azureAdOid: oid || null,
            },
          });

          // Mark invitation as accepted
          if (invitation) {
            await prisma.userInvitation.update({
              where: { id: invitation.id },
              data: { status: "accepted", acceptedAt: new Date() },
            });
          }
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
     *
     * When trigger is "update" (client called session.update()), re-read
     * the user's current role from the database so that role promotions
     * (e.g. activation → admin) take effect without requiring a full
     * sign-out/sign-in cycle.
     */
    async jwt({ token, user, trigger }) {
      if (user) {
        token.role = (user as { role?: string }).role ?? "reviewer";
        token.userId = (user as { id?: string }).id;
      }

      // Re-read role from DB when session.update() is called
      if (trigger === "update" && token.userId) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.userId as string },
          select: { role: true },
        });
        if (dbUser) {
          token.role = dbUser.role;
        }
      }

      return token;
    },
  },
});
