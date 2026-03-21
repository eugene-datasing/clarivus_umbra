/**
 * Data access layer for the activation code system.
 *
 * Each Veil deployment starts in an unactivated state. A one-time activation
 * code (delivered to the client by DataSing) must be redeemed before anyone
 * can log in or use the system.
 *
 * Activation status is stored in system_settings so it can be read cheaply
 * by the root layout (server component) on every request.
 */

import { prisma } from "@/lib/db/prisma";
import {
  getSetting,
  setSetting,
  SETTING_KEYS,
  type ActivationStatus,
  DEFAULT_ACTIVATION_STATUS,
} from "./settings";
import bcrypt from "bcryptjs";
import crypto from "crypto";

// Characters that avoid ambiguity (no 0/O, 1/I/L)
const SAFE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * Check whether this instance has been activated.
 *
 * In development, set SKIP_ACTIVATION=true to bypass the gate entirely.
 */
export async function isActivated(): Promise<boolean> {
  if (process.env.SKIP_ACTIVATION === "true") {
    return true;
  }
  const status = await getActivationStatus();
  return status.activated;
}

/**
 * Get the full activation status object.
 */
export async function getActivationStatus(): Promise<ActivationStatus> {
  return getSetting<ActivationStatus>(
    SETTING_KEYS.ACTIVATION_STATUS,
    DEFAULT_ACTIVATION_STATUS,
  );
}

/**
 * Verify an activation code against stored hashes and redeem it if valid.
 *
 * Uses an interactive Prisma transaction to prevent race conditions — two
 * concurrent requests cannot both redeem the same code.
 */
export async function verifyAndRedeemCode(
  code: string,
  redeemedBy?: string,
): Promise<{ success: boolean; error?: string }> {
  // Normalise: uppercase, strip whitespace
  const normalised = code.toUpperCase().replace(/\s/g, "");

  // Quick pre-check (outside transaction — not authoritative, just a fast path)
  const currentStatus = await getActivationStatus();
  if (currentStatus.activated) {
    return { success: false, error: "This instance has already been activated." };
  }

  // Run the verification + redemption atomically
  return prisma.$transaction(async (tx) => {
    // Re-check activation inside the transaction
    const activationSetting = await tx.systemSetting.findUnique({
      where: { key: SETTING_KEYS.ACTIVATION_STATUS },
    });
    if (activationSetting) {
      const status = activationSetting.value as unknown as ActivationStatus;
      if (status.activated) {
        return { success: false, error: "This instance has already been activated." };
      }
    }

    // Find all pending codes within the transaction
    const pendingCodes = await tx.activationCode.findMany({
      where: { status: "pending" },
    });

    if (pendingCodes.length === 0) {
      return { success: false, error: "No activation code has been provisioned for this instance." };
    }

    // Compare against ALL pending codes to avoid timing leaks that reveal
    // which index matched.  Normally there is only one pending code, but
    // this is defensive against multi-code scenarios.
    let matchedRecord: (typeof pendingCodes)[number] | null = null;

    for (const record of pendingCodes) {
      // Check expiry
      if (record.expiresAt && record.expiresAt < new Date()) {
        continue;
      }

      let isMatch = false;
      try {
        isMatch = await bcrypt.compare(normalised, record.codeHash);
      } catch (err) {
        console.error("[activation] bcrypt comparison failed:", err);
        return { success: false, error: "Activation failed due to a server error. Please try again." };
      }

      if (isMatch) {
        matchedRecord = record;
        // Continue iterating to keep timing constant
      }
    }

    if (!matchedRecord) {
      return { success: false, error: "Invalid activation code." };
    }

    const now = new Date();

    // Mark code as redeemed (within transaction)
    await tx.activationCode.update({
      where: { id: matchedRecord.id },
      data: {
        status: "redeemed",
        redeemedAt: now,
        redeemedBy: redeemedBy || "unknown",
      },
    });

    // Set activation status in system settings (within transaction)
    await tx.systemSetting.upsert({
      where: { key: SETTING_KEYS.ACTIVATION_STATUS },
      update: {
        value: {
          activated: true,
          activatedAt: now.toISOString(),
          activatedBy: redeemedBy || "unknown",
        } satisfies ActivationStatus as object,
        updatedBy: "system",
      },
      create: {
        key: SETTING_KEYS.ACTIVATION_STATUS,
        value: {
          activated: true,
          activatedAt: now.toISOString(),
          activatedBy: redeemedBy || "unknown",
        } satisfies ActivationStatus as object,
        updatedBy: "system",
      },
    });

    return { success: true };
  });
}

/**
 * Generate a new activation code and store its hash in the database.
 * Returns the plaintext code (for delivery to the client).
 *
 * Format: VEIL-XXXX-XXXX-XXXX (12 alphanumeric chars from safe set)
 *
 * When `revokeExisting` is true, any pending codes are revoked first
 * so that only the newly generated code is valid.
 */
export async function generateActivationCode(options?: {
  expiresInDays?: number;
  revokeExisting?: boolean;
}): Promise<{ code: string; id: string; revokedCount: number }> {
  const { expiresInDays, revokeExisting } = options ?? {};

  // Revoke any existing pending codes if requested
  let revokedCount = 0;
  if (revokeExisting) {
    const result = await prisma.activationCode.updateMany({
      where: { status: "pending" },
      data: { status: "revoked" },
    });
    revokedCount = result.count;
  }

  // Generate 12 random characters
  const bytes = crypto.randomBytes(12);
  const chars: string[] = [];
  for (let i = 0; i < 12; i++) {
    chars.push(SAFE_CHARS[bytes[i] % SAFE_CHARS.length]);
  }

  // Format as VEIL-XXXX-XXXX-XXXX
  const code = `VEIL-${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}`;

  // Hash for storage
  const codeHash = await bcrypt.hash(code.toUpperCase().replace(/\s/g, ""), 12);

  // Calculate expiry
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : undefined;

  // Store in database
  const record = await prisma.activationCode.create({
    data: {
      codeHash,
      expiresAt,
    },
  });

  return { code, id: record.id, revokedCount };
}
