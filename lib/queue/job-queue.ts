/**
 * Database-backed job queue for document processing with concurrency control,
 * progress tracking, and automatic retry.
 *
 * Jobs are persisted in the `processing_jobs` table so state survives restarts.
 * The in-process runner uses globalThis to avoid duplicate pollers during HMR.
 */

import { prisma } from "@/lib/db/prisma";
import { processDocument } from "@/lib/pipeline/process";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobStatus = "queued" | "processing" | "complete" | "error";

export interface JobInfo {
  docId: string;
  status: JobStatus;
  step: string;
  progress: number; // 0-100
  attempt: number;
  maxAttempts: number;
  error?: string;
  enqueuedAt: number;
  startedAt?: number;
  completedAt?: number;
}

// ---------------------------------------------------------------------------
// Queue singleton
// ---------------------------------------------------------------------------

const globalForQueue = globalThis as unknown as {
  __processingQueue?: ProcessingQueue;
};

export function getProcessingQueue(): ProcessingQueue {
  if (!globalForQueue.__processingQueue) {
    globalForQueue.__processingQueue = new ProcessingQueue();
  }
  return globalForQueue.__processingQueue;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class ProcessingQueue {
  private active = new Set<string>();
  private concurrency: number;
  private maxAttempts: number;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  /** Poll interval for picking up queued jobs (seconds). */
  private static readonly POLL_INTERVAL_MS = 3_000;
  /** Time after which completed/errored jobs are purged (15 minutes). */
  private static readonly JOB_TTL_MS = 15 * 60 * 1000;

  constructor(concurrency = 2, maxAttempts = 3) {
    this.concurrency = concurrency;
    this.maxAttempts = maxAttempts;
    this.startPoller();
    // Recover any jobs that were "processing" when the process last exited.
    this.recoverStaleJobs();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Enqueue a document for processing. If it already has an active job
   * (queued or processing), returns the existing job info.
   */
  async enqueue(docId: string): Promise<JobInfo> {
    // Check for existing active job
    const existing = await prisma.processingJob.findFirst({
      where: {
        docId,
        status: { in: ["queued", "processing"] },
      },
    });

    if (existing) {
      return this.toJobInfo(existing);
    }

    const job = await prisma.processingJob.create({
      data: {
        docId,
        status: "queued",
        step: "Waiting in queue",
        progress: 0,
        attempt: 0,
        maxAttempts: this.maxAttempts,
      },
    });

    // Kick the drain loop immediately instead of waiting for next poll
    this.drain();

    return this.toJobInfo(job);
  }

  /**
   * Get the current status of a single job (most recent for this docId).
   */
  async getJob(docId: string): Promise<JobInfo | null> {
    const job = await prisma.processingJob.findFirst({
      where: { docId },
      orderBy: { enqueuedAt: "desc" },
    });
    return job ? this.toJobInfo(job) : null;
  }

  /**
   * Get the status of all recent jobs (optionally filtered by docIds).
   */
  async getAllJobs(docIds?: string[]): Promise<JobInfo[]> {
    const where = docIds ? { docId: { in: docIds } } : {};
    const jobs = await prisma.processingJob.findMany({
      where,
      orderBy: { enqueuedAt: "desc" },
    });

    // Deduplicate: if a docId appears multiple times, keep the most recent
    const seen = new Set<string>();
    const deduped = jobs.filter((j) => {
      if (seen.has(j.docId)) return false;
      seen.add(j.docId);
      return true;
    });

    return deduped.map((j) => this.toJobInfo(j));
  }

  /**
   * Get queue statistics.
   */
  async getStats(): Promise<{
    queued: number;
    processing: number;
    complete: number;
    error: number;
    concurrency: number;
  }> {
    const counts = await prisma.processingJob.groupBy({
      by: ["status"],
      _count: true,
    });

    const result = { queued: 0, processing: 0, complete: 0, error: 0, concurrency: this.concurrency };
    for (const row of counts) {
      const key = row.status as keyof typeof result;
      if (key in result && key !== "concurrency") {
        result[key] = row._count;
      }
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private toJobInfo(job: {
    docId: string;
    status: string;
    step: string;
    progress: number;
    attempt: number;
    maxAttempts: number;
    error: string | null;
    enqueuedAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
  }): JobInfo {
    return {
      docId: job.docId,
      status: job.status as JobStatus,
      step: job.step,
      progress: job.progress,
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
      error: job.error ?? undefined,
      enqueuedAt: job.enqueuedAt.getTime(),
      startedAt: job.startedAt?.getTime(),
      completedAt: job.completedAt?.getTime(),
    };
  }

  private startPoller(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      this.drain();
      this.purgeFinishedJobs();
    }, ProcessingQueue.POLL_INTERVAL_MS);
    if (typeof this.pollTimer === "object" && "unref" in this.pollTimer) {
      this.pollTimer.unref();
    }
  }

  /**
   * On startup, reset any "processing" jobs back to "queued" so they get
   * retried. This handles the case where the process crashed mid-job.
   */
  private async recoverStaleJobs(): Promise<void> {
    try {
      const result = await prisma.processingJob.updateMany({
        where: { status: "processing" },
        data: { status: "queued", step: "Retrying after restart" },
      });
      if (result.count > 0) {
        console.log(`[queue] Recovered ${result.count} stale processing job(s)`);
        this.drain();
      }
    } catch (err) {
      console.error("[queue] Failed to recover stale jobs:", err);
    }
  }

  private async drain(): Promise<void> {
    while (this.active.size < this.concurrency) {
      const nextJob = await prisma.processingJob.findFirst({
        where: { status: "queued" },
        orderBy: { enqueuedAt: "asc" },
      });

      if (!nextJob) break;

      // Optimistic claim: set to "processing" so other pollers skip it
      const claimed = await prisma.processingJob.updateMany({
        where: { id: nextJob.id, status: "queued" },
        data: {
          status: "processing",
          attempt: { increment: 1 },
          startedAt: new Date(),
          step: "Starting processing",
          progress: 5,
        },
      });

      if (claimed.count === 0) continue; // Another poller claimed it

      this.active.add(nextJob.docId);
      this.runJob(nextJob.id, nextJob.docId);
    }
  }

  private async runJob(jobId: string, docId: string): Promise<void> {
    try {
      await processDocument(docId);

      await prisma.processingJob.update({
        where: { id: jobId },
        data: {
          status: "complete",
          step: "Processing complete",
          progress: 100,
          completedAt: new Date(),
        },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Re-read job to get current attempt count
      const job = await prisma.processingJob.findUnique({ where: { id: jobId } });

      if (job && job.attempt < job.maxAttempts && this.isRetryable(errorMessage)) {
        console.warn(
          `[queue] Job ${docId} failed (attempt ${job.attempt}/${job.maxAttempts}), retrying: ${errorMessage}`,
        );
        await prisma.processingJob.update({
          where: { id: jobId },
          data: {
            status: "queued",
            step: `Retrying (attempt ${job.attempt + 1})`,
            progress: 0,
          },
        });
      } else {
        console.error(
          `[queue] Job ${docId} failed permanently after ${job?.attempt ?? "?"} attempt(s): ${errorMessage}`,
        );
        await prisma.processingJob.update({
          where: { id: jobId },
          data: {
            status: "error",
            step: "Processing failed",
            error: errorMessage,
            completedAt: new Date(),
          },
        });
      }
    }

    this.active.delete(docId);
    this.drain();
  }

  private isRetryable(error: string): boolean {
    const transientPatterns = [
      "ECONNRESET",
      "ETIMEDOUT",
      "ECONNREFUSED",
      "socket hang up",
      "network",
      "503",
      "429",
      "rate limit",
    ];
    const lower = error.toLowerCase();
    return transientPatterns.some((p) => lower.includes(p.toLowerCase()));
  }

  /**
   * Remove completed and errored jobs older than JOB_TTL_MS.
   */
  private async purgeFinishedJobs(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - ProcessingQueue.JOB_TTL_MS);
      await prisma.processingJob.deleteMany({
        where: {
          status: { in: ["complete", "error"] },
          completedAt: { lt: cutoff },
        },
      });
    } catch {
      // Non-critical — will retry on next interval
    }
  }
}
