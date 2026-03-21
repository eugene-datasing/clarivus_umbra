/**
 * Server-side session helpers — WP16
 *
 * Provides typed session access for server actions and server components.
 */

import { auth } from "./auth-options";
import { isActivated } from "@/lib/data/activation";

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
 * and API routes where authentication is required.
 *
 * Also enforces the activation gate — if the instance is not activated,
 * no authenticated operations are permitted.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Authentication required");

  const activated = await isActivated();
  if (!activated) throw new Error("Instance not activated");

  return user;
}
