"use server";

import { headers } from "next/headers";
import { verifyAndRedeemCode } from "@/lib/data/activation";
import { createAuditEntry } from "@/lib/data/audit";
import { auth } from "@/lib/auth/auth-options";

// ---------------------------------------------------------------------------
// In-memory rate limiter for activation attempts (per-process)
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const attempts = new Map<string, { count: number; firstAttempt: number }>();

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const entry = attempts.get(ip);

  if (!entry || now - entry.firstAttempt > WINDOW_MS) {
    // Window expired or first attempt — reset
    attempts.set(ip, { count: 1, firstAttempt: now });
    return { allowed: true };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((entry.firstAttempt + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSeconds: retryAfter };
  }

  entry.count++;
  return { allowed: true };
}

// Periodic cleanup of stale entries (every 5 minutes)
if (typeof globalThis !== "undefined") {
  const CLEANUP_KEY = "__activation_rate_limit_cleanup";
  if (!(globalThis as Record<string, unknown>)[CLEANUP_KEY]) {
    (globalThis as Record<string, unknown>)[CLEANUP_KEY] = true;
    setInterval(() => {
      const now = Date.now();
      for (const [ip, entry] of attempts) {
        if (now - entry.firstAttempt > WINDOW_MS) {
          attempts.delete(ip);
        }
      }
    }, 5 * 60 * 1000).unref();
  }
}

// ---------------------------------------------------------------------------
// Server action
// ---------------------------------------------------------------------------

/**
 * Server action to redeem an activation code.
 * Requires authentication — the user must sign in via Azure AD first.
 * The redeeming user is promoted to admin role.
 * Rate-limited to 5 attempts per IP per 15-minute window.
 */
export async function redeemActivationCode(
  code: string,
): Promise<{ success: boolean; error?: string }> {
  // Require authenticated user
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: "You must be signed in to activate this instance." };
  }

  const userId = (session.user as { id?: string }).id;
  if (!userId) {
    return { success: false, error: "Session is missing user ID. Please sign out and sign in again." };
  }
  const userName = session.user.name || session.user.email || "Unknown";

  // Get client IP for rate limiting
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim()
    || headersList.get("x-real-ip")
    || "unknown";

  // Rate limit check
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    console.warn(`[activation] Rate limited: ip=${ip}`);
    return {
      success: false,
      error: `Too many attempts. Please try again in ${Math.ceil((rateCheck.retryAfterSeconds ?? 900) / 60)} minutes.`,
    };
  }

  if (!code || code.trim().length === 0) {
    return { success: false, error: "Please enter an activation code." };
  }

  const result = await verifyAndRedeemCode(code.trim(), userId);

  if (result.success) {
    // Log successful activation
    try {
      await createAuditEntry({
        userId,
        userName,
        userRole: "admin", // User was just promoted
        type: "activation",
        description: `Instance activated by ${userName}`,
        target: "system",
        detail: `Activation code redeemed. User promoted to admin. IP: ${ip}`,
      });
    } catch (err) {
      console.error("[activation] Failed to create audit entry:", err);
    }
  } else {
    // Log failed attempts for security monitoring
    console.warn(`[activation] Failed attempt: ip=${ip}, user=${userName}, error=${result.error}`);
  }

  return result;
}
