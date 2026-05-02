/**
 * pg-boss job runner.
 *
 * Owns the lifecycle of a single in-process pg-boss instance and the
 * registration of the queues + handlers Umbra runs in the background.
 * Phase 6a wires the scaffolding (queue creation, no-op handlers,
 * cron schedule); Phase 6c replaces the no-op `purge-batch` handler
 * with the real archive + cascade-delete logic and the
 * `retention-sweep` handler with the soft-delete sweep.
 *
 * pg-boss manages its own schema (`pgboss`) inside the same database
 * — it auto-creates on first start. Migrations are emitted as part
 * of `boss.start()` and don't appear in our Prisma migrations
 * folder.
 */

import { PgBoss } from "pg-boss";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "jobs/runner" });

export const QUEUE_PURGE_BATCH = "purge-batch";
export const QUEUE_RETENTION_SWEEP = "retention-sweep";

let boss: PgBoss | null = null;
let workerStarted = false;

/**
 * Lazily construct + start the singleton pg-boss instance. Subsequent
 * calls return the running instance.
 */
export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;

  const instance = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: "pgboss",
    application_name: "umbra-worker",
  });

  instance.on("error", (err) => {
    log.error("[pg-boss] instance error", { error: String(err) });
  });

  await instance.start();
  log.info("[pg-boss] worker started");
  boss = instance;
  return instance;
}

/**
 * Start the worker: create our queues, register handlers, set up the
 * hourly retention sweep cron. Idempotent — safe to call multiple
 * times. Phase 6a registrations are no-ops; Phase 6c replaces them.
 */
export async function startWorker(): Promise<void> {
  if (workerStarted) return;
  const b = await getBoss();

  await b.createQueue(QUEUE_PURGE_BATCH);
  await b.createQueue(QUEUE_RETENTION_SWEEP);

  // Phase 6a placeholder — real archive + cascade-delete logic
  // lands in Phase 6c.
  await b.work(QUEUE_PURGE_BATCH, async ([job]) => {
    log.info("[pg-boss] received purge-batch job (Phase 6c will implement)", {
      jobId: job.id,
      data: job.data,
    });
  });

  // Phase 6a placeholder — Phase 6c implements the real sweep that
  // scans for batches whose purgeScheduledAt has elapsed and enqueues
  // a purge-batch job for each.
  await b.work(QUEUE_RETENTION_SWEEP, async ([job]) => {
    log.info("[pg-boss] received retention-sweep tick (Phase 6c will implement)", {
      jobId: job.id,
    });
  });

  await b.schedule(
    QUEUE_RETENTION_SWEEP,
    "0 * * * *",
    {},
    { tz: "Pacific/Auckland" },
  );

  log.info("[pg-boss] handlers registered");
  workerStarted = true;
}

export async function stopWorker(): Promise<void> {
  if (!boss) return;
  await boss.stop();
  boss = null;
  workerStarted = false;
}
