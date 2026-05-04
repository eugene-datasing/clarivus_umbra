-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "processingProgress" INTEGER DEFAULT 0,
ADD COLUMN     "processingStep" TEXT;
