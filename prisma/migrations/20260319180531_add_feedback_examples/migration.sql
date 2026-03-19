-- CreateTable
CREATE TABLE "feedback_examples" (
    "id" TEXT NOT NULL,
    "caseId" TEXT,
    "documentId" TEXT NOT NULL,
    "detectionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "ground" TEXT,
    "reasoning" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_examples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feedback_examples_detectionId_key" ON "feedback_examples"("detectionId");

-- CreateIndex
CREATE INDEX "feedback_examples_type_idx" ON "feedback_examples"("type");

-- CreateIndex
CREATE INDEX "feedback_examples_createdAt_idx" ON "feedback_examples"("createdAt");
