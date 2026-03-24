-- CreateTable
CREATE TABLE "export_jobs" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "packageType" TEXT NOT NULL DEFAULT 'requester',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "currentStep" TEXT,
    "error" TEXT,
    "storageKey" TEXT,
    "sha256" TEXT,
    "filename" TEXT,
    "documentIds" JSONB,
    "docResults" JSONB,
    "batchGroupId" TEXT,
    "batchNumber" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "export_jobs_caseId_idx" ON "export_jobs"("caseId");

-- CreateIndex
CREATE INDEX "export_jobs_batchGroupId_idx" ON "export_jobs"("batchGroupId");

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
