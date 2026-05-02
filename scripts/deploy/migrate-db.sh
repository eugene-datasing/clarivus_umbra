#!/usr/bin/env bash
# =============================================================================
# Umbra — apply Prisma migrations against the Azure DB
# =============================================================================
#
# Run this:
#   - Once after the first provision (creates the schema).
#   - Whenever the schema changes post-Phase-11 (Phase 11+ is migration-
#     based; pre-deploy phases regenerate 0001_init).
#
# Required env:
#   UMBRA_DATABASE_URL          full Postgres connection string with sslmode=require
#                               e.g. postgresql://umbra:<pwd>@psql-umbra-prototype.postgres.database.azure.com:5432/umbra?sslmode=require
#
# DESTRUCTIVE OPERATIONS (reset, etc.) require an extra env flag:
#   PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes go ahead"
# =============================================================================

set -euo pipefail

: "${UMBRA_DATABASE_URL:?UMBRA_DATABASE_URL must be set}"

echo "[migrate-db] running prisma migrate deploy..."
DATABASE_URL="$UMBRA_DATABASE_URL" npx prisma migrate deploy

echo "[migrate-db] complete."
