/**
 * Backup and restore operations for the Umbra platform.
 *
 * Provides backup status monitoring, manual backup triggers, and
 * verification capabilities. In the prototype, backup operations are
 * simulated with realistic delays and responses. In production, these
 * would integrate with Azure Backup and geo-redundant storage.
 *
 * RFP Requirement: 99.5% uptime, backup/restore capability,
 * SLAs with service credits.
 */

import { logger } from "@/lib/logger";

const log = logger.child({ module: "backup-restore" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackupStatus {
  lastBackup: string | null;
  backupSize: string | null;
  backupLocation: string;
  retentionDays: number;
  backupType: "automated" | "manual" | "none";
  nextScheduled: string | null;
  isHealthy: boolean;
  verificationResult: {
    lastVerified: string | null;
    status: "passed" | "failed" | "not-run";
  };
}

export interface BackupEntry {
  id: string;
  timestamp: string;
  type: "automated" | "manual";
  size: string;
  status: "completed" | "failed" | "in-progress";
  verifiedAt: string | null;
}

// ---------------------------------------------------------------------------
// Simulated backup state
// ---------------------------------------------------------------------------

/**
 * In-memory backup history for the prototype.
 * In production this would be sourced from Azure Backup vault metadata
 * and the Umbra audit trail.
 */
const simulatedHistory: BackupEntry[] = [
  {
    id: "bk-20260321-0300",
    timestamp: "2026-03-21T03:00:00.000Z",
    type: "automated",
    size: "2.4 GB",
    status: "completed",
    verifiedAt: "2026-03-21T03:15:00.000Z",
  },
  {
    id: "bk-20260320-0300",
    timestamp: "2026-03-20T03:00:00.000Z",
    type: "automated",
    size: "2.3 GB",
    status: "completed",
    verifiedAt: "2026-03-20T03:14:00.000Z",
  },
  {
    id: "bk-20260319-0300",
    timestamp: "2026-03-19T03:00:00.000Z",
    type: "automated",
    size: "2.3 GB",
    status: "completed",
    verifiedAt: "2026-03-19T03:12:00.000Z",
  },
  {
    id: "bk-20260318-1430",
    timestamp: "2026-03-18T14:30:00.000Z",
    type: "manual",
    size: "2.2 GB",
    status: "completed",
    verifiedAt: "2026-03-18T14:42:00.000Z",
  },
  {
    id: "bk-20260318-0300",
    timestamp: "2026-03-18T03:00:00.000Z",
    type: "automated",
    size: "2.2 GB",
    status: "completed",
    verifiedAt: null,
  },
  {
    id: "bk-20260317-0300",
    timestamp: "2026-03-17T03:00:00.000Z",
    type: "automated",
    size: "2.1 GB",
    status: "completed",
    verifiedAt: "2026-03-17T03:13:00.000Z",
  },
  {
    id: "bk-20260316-0300",
    timestamp: "2026-03-16T03:00:00.000Z",
    type: "automated",
    size: "2.1 GB",
    status: "completed",
    verifiedAt: "2026-03-16T03:11:00.000Z",
  },
  {
    id: "bk-20260315-0300",
    timestamp: "2026-03-15T03:00:00.000Z",
    type: "automated",
    size: "2.0 GB",
    status: "completed",
    verifiedAt: "2026-03-15T03:10:00.000Z",
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the current backup status, including the most recent backup,
 * health assessment, and next scheduled backup time.
 */
export async function getBackupStatus(): Promise<BackupStatus> {
  log.info("Fetching backup status");

  const latestCompleted = simulatedHistory.find(
    (b) => b.status === "completed",
  );

  // Next scheduled backup is always 03:00 NZST tomorrow
  const now = new Date();
  const nextScheduled = new Date(now);
  nextScheduled.setDate(nextScheduled.getDate() + 1);
  nextScheduled.setHours(3, 0, 0, 0);

  const isHealthy = latestCompleted !== undefined;

  return {
    lastBackup: latestCompleted?.timestamp ?? null,
    backupSize: latestCompleted?.size ?? null,
    backupLocation: "Azure Blob Storage — NZ North (geo-redundant)",
    retentionDays: 7,
    backupType: latestCompleted?.type ?? "none",
    nextScheduled: nextScheduled.toISOString(),
    isHealthy,
    verificationResult: {
      lastVerified: latestCompleted?.verifiedAt ?? null,
      status: latestCompleted?.verifiedAt ? "passed" : "not-run",
    },
  };
}

/**
 * Trigger a manual backup operation.
 *
 * In the prototype this simulates the backup process with a brief delay
 * and creates an audit entry. In production this would invoke Azure Backup
 * on-demand.
 */
export async function triggerManualBackup(): Promise<{
  success: boolean;
  backupId?: string;
  error?: string;
}> {
  log.info("Manual backup triggered");

  try {
    // Simulate backup processing time
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const backupId = `bk-manual-${Date.now()}`;
    const entry: BackupEntry = {
      id: backupId,
      timestamp: new Date().toISOString(),
      type: "manual",
      size: "2.4 GB",
      status: "completed",
      verifiedAt: null,
    };

    // Add to the front of the history
    simulatedHistory.unshift(entry);

    log.info("Manual backup completed", { backupId });
    return { success: true, backupId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error("Manual backup failed", { error: message });
    return { success: false, error: message };
  }
}

/**
 * Verify the integrity of a backup.
 *
 * In production this would perform checksum verification against the
 * Azure Backup vault and validate restore-readiness. The prototype
 * simulates this with a brief delay and success response.
 */
export async function verifyBackup(
  backupId?: string,
): Promise<{ success: boolean; details: string; verifiedAt: string }> {
  log.info("Backup verification started", { backupId: backupId ?? "latest" });

  // Simulate verification processing time
  await new Promise((resolve) => setTimeout(resolve, 800));

  const target = backupId
    ? simulatedHistory.find((b) => b.id === backupId)
    : simulatedHistory.find((b) => b.status === "completed");

  const verifiedAt = new Date().toISOString();

  if (!target) {
    log.warn("No backup found for verification", { backupId });
    return {
      success: false,
      details: "No completed backup found to verify.",
      verifiedAt,
    };
  }

  // Mark as verified in the simulated history
  target.verifiedAt = verifiedAt;

  log.info("Backup verification passed", {
    backupId: target.id,
    verifiedAt,
  });

  return {
    success: true,
    details: `Backup ${target.id} (${target.size}) verified successfully. All checksums passed. Restore-readiness confirmed.`,
    verifiedAt,
  };
}

/**
 * Get the recent backup history.
 *
 * Returns the most recent backup entries for display in the admin
 * settings UI. Limited to 10 entries.
 */
export async function getBackupHistory(): Promise<BackupEntry[]> {
  log.info("Fetching backup history");

  // Return the most recent 10 entries
  return simulatedHistory.slice(0, 10);
}
