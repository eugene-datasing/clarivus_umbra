-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'reviewer',
    "azureAdOid" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterType" TEXT NOT NULL,
    "dateReceived" TIMESTAMP(3) NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'standard',
    "departments" TEXT[],
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "documentCount" INTEGER NOT NULL DEFAULT 0,
    "reviewedCount" INTEGER NOT NULL DEFAULT 0,
    "redactionCount" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "purgeScheduledAt" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),
    "purgeStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "originalPath" TEXT,
    "processingError" TEXT,
    "canonical_pdf_path" TEXT,
    "canonical_pdf_sha256" TEXT,
    "canonical_pdf_page_count" INTEGER,
    "canonical_pdf_build_ms" INTEGER,
    "canonical_pdf_source" TEXT,
    "canonical_pdf_text_selectable" BOOLEAN,
    "detectionCount" INTEGER NOT NULL DEFAULT 0,
    "avgConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "assigneeId" TEXT,
    "duplicateGroup" TEXT,
    "contentHash" TEXT,
    "contentJson" JSONB,
    "classification" JSONB,
    "processingStartedAt" TIMESTAMP(3),
    "processingCompletedAt" TIMESTAMP(3),
    "extractionMs" INTEGER,
    "patternDetectionMs" INTEGER,
    "aiDetectionMs" INTEGER,
    "totalProcessingMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_pages" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "layoutJson" JSONB,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detections" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "page" INTEGER NOT NULL,
    "posX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posW" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posH" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reasoning" TEXT NOT NULL DEFAULT '',
    "aiExplanation" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'ai',
    "note" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "detections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_entries" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "batchId" TEXT,
    "detail" TEXT,
    "previousValue" TEXT,
    "newValue" TEXT,
    "integrityHash" TEXT,
    "previousHash" TEXT,

    CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_uploads" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256Hash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT NOT NULL DEFAULT 'system',

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detection_history" (
    "id" TEXT NOT NULL,
    "detectionId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "detection_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "matchMode" TEXT NOT NULL DEFAULT 'Exact',
    "keywords" TEXT NOT NULL DEFAULT '',
    "scope" TEXT NOT NULL DEFAULT 'All Documents',
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "suggestedGround" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "matchCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_milestones" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "batch_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activation_codes" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "orgName" TEXT,
    "orgAbbreviation" TEXT,
    "orgTenantId" TEXT,
    "allowedDomain" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "redeemedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "activation_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_invitations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'reviewer',
    "invitedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "token" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
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
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_azureAdOid_key" ON "users"("azureAdOid");

-- CreateIndex
CREATE UNIQUE INDEX "batches_reference_key" ON "batches"("reference");

-- CreateIndex
CREATE INDEX "batches_deletedAt_idx" ON "batches"("deletedAt");

-- CreateIndex
CREATE INDEX "batches_purgeScheduledAt_idx" ON "batches"("purgeScheduledAt");

-- CreateIndex
CREATE INDEX "documents_batchId_idx" ON "documents"("batchId");

-- CreateIndex
CREATE INDEX "documents_status_idx" ON "documents"("status");

-- CreateIndex
CREATE INDEX "documents_contentHash_idx" ON "documents"("contentHash");

-- CreateIndex
CREATE INDEX "documents_canonical_pdf_sha256_idx" ON "documents"("canonical_pdf_sha256");

-- CreateIndex
CREATE INDEX "document_pages_documentId_idx" ON "document_pages"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "document_pages_documentId_pageNumber_key" ON "document_pages"("documentId", "pageNumber");

-- CreateIndex
CREATE INDEX "detections_documentId_idx" ON "detections"("documentId");

-- CreateIndex
CREATE INDEX "detections_status_idx" ON "detections"("status");

-- CreateIndex
CREATE INDEX "audit_entries_batchId_idx" ON "audit_entries"("batchId");

-- CreateIndex
CREATE INDEX "audit_entries_timestamp_idx" ON "audit_entries"("timestamp");

-- CreateIndex
CREATE INDEX "audit_entries_userId_idx" ON "audit_entries"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "file_uploads_storageKey_key" ON "file_uploads"("storageKey");

-- CreateIndex
CREATE INDEX "file_uploads_batchId_idx" ON "file_uploads"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- CreateIndex
CREATE INDEX "detection_history_detectionId_idx" ON "detection_history"("detectionId");

-- CreateIndex
CREATE UNIQUE INDEX "batch_milestones_batchId_stage_key" ON "batch_milestones"("batchId", "stage");

-- CreateIndex
CREATE INDEX "activation_codes_status_idx" ON "activation_codes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "user_invitations_token_key" ON "user_invitations"("token");

-- CreateIndex
CREATE INDEX "user_invitations_email_idx" ON "user_invitations"("email");

-- CreateIndex
CREATE INDEX "user_invitations_status_idx" ON "user_invitations"("status");

-- CreateIndex
CREATE INDEX "export_jobs_batchId_idx" ON "export_jobs"("batchId");

-- CreateIndex
CREATE INDEX "export_jobs_batchGroupId_idx" ON "export_jobs"("batchGroupId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_pages" ADD CONSTRAINT "document_pages_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detections" ADD CONSTRAINT "detections_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detection_history" ADD CONSTRAINT "detection_history_detectionId_fkey" FOREIGN KEY ("detectionId") REFERENCES "detections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_milestones" ADD CONSTRAINT "batch_milestones_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
