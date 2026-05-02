#!/usr/bin/env bash
# =============================================================================
# Umbra — run the Ministry of Demo seed against the Azure DB
# =============================================================================
#
# Use this after `migrate-db.sh` to populate the Ministry-of-Demo demo
# scenario (1 admin + 3 reviewers + 3 sample batches with no documents).
# The seed is idempotent (upserts); re-running it doesn't duplicate.
#
# Required env:
#   UMBRA_DATABASE_URL          full Postgres connection string with sslmode=require
# =============================================================================

set -euo pipefail

: "${UMBRA_DATABASE_URL:?UMBRA_DATABASE_URL must be set}"

echo "[seed] running prisma seed..."
DATABASE_URL="$UMBRA_DATABASE_URL" npx tsx prisma/seed.ts

echo "[seed] complete."
