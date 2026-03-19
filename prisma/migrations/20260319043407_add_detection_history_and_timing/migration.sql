-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "aiDetectionMs" INTEGER,
ADD COLUMN     "extractionMs" INTEGER,
ADD COLUMN     "patternDetectionMs" INTEGER,
ADD COLUMN     "processingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "processingStartedAt" TIMESTAMP(3),
ADD COLUMN     "totalProcessingMs" INTEGER;

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

-- CreateIndex
CREATE INDEX "detection_history_detectionId_idx" ON "detection_history"("detectionId");

-- AddForeignKey
ALTER TABLE "detection_history" ADD CONSTRAINT "detection_history_detectionId_fkey" FOREIGN KEY ("detectionId") REFERENCES "detections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
