-- AlterTable
ALTER TABLE "audit_entries" ADD COLUMN "integrityHash" TEXT;
ALTER TABLE "audit_entries" ADD COLUMN "previousHash" TEXT;
