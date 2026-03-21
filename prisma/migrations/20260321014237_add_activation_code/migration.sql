-- CreateTable
CREATE TABLE "activation_codes" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "redeemedAt" TIMESTAMP(3),
    "redeemedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "activation_codes_pkey" PRIMARY KEY ("id")
);
