/**
 * NextAuth v5 configuration — WP16
 *
 * Full auth config with credentials provider (requires Node.js runtime).
 * For the POC, passwords are SHA-256 hashed (not bcrypt) for simplicity.
 * Production would use Azure AD / Entra ID for SSO.
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { createHash } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { authConfig } from "./auth.config";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
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

        const hash = hashPassword(password);
        if (hash !== user.passwordHash) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email ?? undefined,
          role: user.role,
        };
      },
    }),
  ],
});
