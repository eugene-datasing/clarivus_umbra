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
