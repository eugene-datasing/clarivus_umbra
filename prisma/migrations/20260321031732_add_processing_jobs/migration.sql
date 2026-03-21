-- CreateTable
CREATE TABLE "processing_jobs" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "step" TEXT NOT NULL DEFAULT 'Waiting in queue',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "error" TEXT,
    "enqueuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "processing_jobs_docId_idx" ON "processing_jobs"("docId");

-- CreateIndex
CREATE INDEX "processing_jobs_status_idx" ON "processing_jobs"("status");
