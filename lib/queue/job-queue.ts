/**
 * In-process job queue for document processing with concurrency control,
 * progress tracking, and automatic retry.
 *
 * Uses globalThis to survive HMR in development.
 */

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
  private jobs = new Map<string, JobInfo>();
  private pending: string[] = [];
  private active = new Set<string>();
  private concurrency: number;
  private maxAttempts: number;

  /** Time after which completed/errored jobs are purged (15 minutes). */
  private static readonly JOB_TTL_MS = 15 * 60 * 1000;
  /** Cleanup interval (5 minutes). */
  private static readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

  constructor(concurrency = 2, maxAttempts = 3) {
    this.concurrency = concurrency;
    this.maxAttempts = maxAttempts;

    // Periodically purge finished jobs to prevent unbounded memory growth
    const cleanup = setInterval(() => this.purgeFinishedJobs(), ProcessingQueue.CLEANUP_INTERVAL_MS);
    if (typeof cleanup === "object" && "unref" in cleanup) cleanup.unref();
  }

  /**
   * Remove completed and errored jobs older than JOB_TTL_MS.
   */
  private purgeFinishedJobs(): void {
    const cutoff = Date.now() - ProcessingQueue.JOB_TTL_MS;
    for (const [docId, job] of this.jobs) {
      if (
        (job.status === "complete" || job.status === "error") &&
        job.completedAt &&
        job.completedAt < cutoff
      ) {
        this.jobs.delete(docId);
      }
    }
  }

  /**
   * Enqueue a document for processing. If the document is already in the
   * queue (queued or processing), this is a no-op.
   */
  enqueue(docId: string): JobInfo {
    const existing = this.jobs.get(docId);
    if (existing && (existing.status === "queued" || existing.status === "processing")) {
      return existing;
    }

    const job: JobInfo = {
      docId,
      status: "queued",
      step: "Waiting in queue",
      progress: 0,
      attempt: 0,
      maxAttempts: this.maxAttempts,
      enqueuedAt: Date.now(),
    };

    this.jobs.set(docId, job);
    this.pending.push(docId);
    this.drain();

    return job;
  }

  /**
   * Get the current status of a single job.
   */
  getJob(docId: string): JobInfo | null {
    return this.jobs.get(docId) ?? null;
  }

  /**
   * Get the status of all jobs (optionally filtered by docIds).
   */
  getAllJobs(docIds?: string[]): JobInfo[] {
    if (docIds) {
      return docIds
        .map((id) => this.jobs.get(id))
        .filter((j): j is JobInfo => j !== undefined);
    }
    return Array.from(this.jobs.values());
  }

  /**
   * Get queue statistics.
   */
  getStats(): {
    queued: number;
    processing: number;
    complete: number;
    error: number;
    concurrency: number;
  } {
    let queued = 0;
    let processing = 0;
    let complete = 0;
    let error = 0;

    for (const job of this.jobs.values()) {
      switch (job.status) {
        case "queued": queued++; break;
        case "processing": processing++; break;
        case "complete": complete++; break;
        case "error": error++; break;
      }
    }

    return { queued, processing, complete, error, concurrency: this.concurrency };
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private drain(): void {
    while (this.active.size < this.concurrency && this.pending.length > 0) {
      const docId = this.pending.shift()!;
      this.runJob(docId);
    }
  }

  private async runJob(docId: string): Promise<void> {
    const job = this.jobs.get(docId);
    if (!job) return;

    this.active.add(docId);
    job.status = "processing";
    job.attempt++;
    job.startedAt = Date.now();
    job.step = "Starting processing";
    job.progress = 5;

    try {
      await processDocument(docId);

      job.status = "complete";
      job.step = "Processing complete";
      job.progress = 100;
      job.completedAt = Date.now();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (job.attempt < job.maxAttempts && this.isRetryable(errorMessage)) {
        console.warn(
          `[queue] Job ${docId} failed (attempt ${job.attempt}/${job.maxAttempts}), retrying: ${errorMessage}`,
        );
        job.status = "queued";
        job.step = `Retrying (attempt ${job.attempt + 1})`;
        job.progress = 0;
        this.active.delete(docId);
        this.pending.push(docId);
        this.drain();
        return;
      }

      job.status = "error";
      job.step = "Processing failed";
      job.error = errorMessage;
      job.completedAt = Date.now();

      console.error(
        `[queue] Job ${docId} failed permanently after ${job.attempt} attempt(s): ${errorMessage}`,
      );
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
}
