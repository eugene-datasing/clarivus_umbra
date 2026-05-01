/**
 * Canonical role definitions for Umbra.
 *
 * Single source of truth — do not introduce role literals elsewhere.
 * Two roles only: admin (manages users, settings, retention, purge) and
 * reviewer (uploads, redacts, signs off batches).
 */

export const ROLES = ["admin", "reviewer"] as const;
export type Role = (typeof ROLES)[number];

export function isAdmin(role: string | null | undefined): role is "admin" {
  return role === "admin";
}

export function isReviewer(role: string | null | undefined): role is "reviewer" {
  return role === "reviewer";
}

export function isValidRole(role: string | null | undefined): role is Role {
  return role === "admin" || role === "reviewer";
}
