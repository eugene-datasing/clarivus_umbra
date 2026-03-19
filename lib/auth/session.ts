/**
 * Server-side session helpers — WP16
 *
 * Provides typed session access for server actions and server components.
 */

import { auth } from "./auth-options";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

/**
 * Get the current authenticated user. Returns null if not authenticated.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user) return null;

  const user = session.user as { id?: string; name?: string | null; email?: string | null; role?: string };

  return {
    id: user.id ?? "",
    name: user.name ?? "Unknown",
    email: user.email ?? "",
    role: user.role ?? "reviewer",
  };
}

/**
 * Get the current authenticated user or throw. Use in server actions
 * where authentication is required.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Authentication required");
  return user;
}
