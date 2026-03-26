"use server";

import { headers } from "next/headers";
import { verifyAndRedeemCode } from "@/lib/data/activation";
import { createAuditEntry } from "@/lib/data/audit";
import { auth } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Database-backed rate limiter for activation attempts
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

async function checkActivationRateLimit(
  ip: string,
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const key = `activation_rate:${ip}`;
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // Use system_settings as a key-value store for rate limit data
  const existing = await prisma.systemSetting.findUnique({
    where: { key },
  });

  if (!existing) {
    // First attempt — create entry
    await prisma.systemSetting.create({
      data: {
        key,
        value: JSON.stringify({ timestamps: [now] }),
        updatedBy: "system",
      },
    });
    return { allowed: true };
  }

  let timestamps: number[] = [];
  try {
    const parsed = JSON.parse(existing.value as string);
    timestamps = (parsed.timestamps || []).filter((t: number) => t > windowStart);
  } catch {
    timestamps = [];
  }

  if (timestamps.length >= MAX_ATTEMPTS) {
    const oldestInWindow = timestamps[0];
    const retryAfter = Math.ceil((oldestInWindow + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(retryAfter, 1) };
  }

  timestamps.push(now);
  await prisma.systemSetting.update({
    where: { key },
    data: {
      value: JSON.stringify({ timestamps }),
      updatedBy: "system",
    },
  });

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Server action
// ---------------------------------------------------------------------------

/**
 * Server action to redeem an activation code.
 * Requires authentication — the user must sign in via Azure AD first.
 * The redeeming user is promoted to admin role.
 * Rate-limited to 5 attempts per IP per 15-minute window (database-backed).
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

  // Rate limit check (database-backed)
  const rateCheck = await checkActivationRateLimit(ip);
  if (!rateCheck.allowed) {
    logger.warn("Activation rate limited", { ip });
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
      logger.error("Failed to create activation audit entry", { error: String(err) });
    }
  } else {
    // Log failed attempts for security monitoring
    logger.warn("Activation failed attempt", { ip, user: userName, error: result.error });
  }

  return result;
}
