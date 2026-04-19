-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "canonical_pdf_build_ms" INTEGER,
ADD COLUMN     "canonical_pdf_page_count" INTEGER,
ADD COLUMN     "canonical_pdf_path" TEXT,
ADD COLUMN     "canonical_pdf_sha256" TEXT,
ADD COLUMN     "canonical_pdf_source" TEXT;

-- CreateIndex
CREATE INDEX "documents_canonical_pdf_sha256_idx" ON "documents"("canonical_pdf_sha256");
