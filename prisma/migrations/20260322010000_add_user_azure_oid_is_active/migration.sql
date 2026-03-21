-- AlterTable
ALTER TABLE "users" ADD COLUMN     "azureAdOid" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "users_azureAdOid_key" ON "users"("azureAdOid");
