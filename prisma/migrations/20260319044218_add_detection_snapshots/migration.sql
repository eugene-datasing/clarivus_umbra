-- CreateTable
CREATE TABLE "detection_snapshots" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "snapshotType" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "detectionsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "detection_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "detection_snapshots_documentId_idx" ON "detection_snapshots"("documentId");

-- AddForeignKey
ALTER TABLE "detection_snapshots" ADD CONSTRAINT "detection_snapshots_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
