#!/usr/bin/env bash
# =============================================================================
# Umbra — smoke-test the deployed Web App
# =============================================================================
#
# Hits /api/health and asserts a 2xx response with status=healthy or
# status=degraded. 503 (status=unhealthy) means a critical dependency
# (DB) is down — exits non-zero so CI fails.
#
# Required env:
#   UMBRA_WEB_APP_HOST          e.g. app-umbra-prototype.azurewebsites.net
#                               (or the custom domain once configured)
# =============================================================================

set -euo pipefail

: "${UMBRA_WEB_APP_HOST:?UMBRA_WEB_APP_HOST must be set}"

URL="https://${UMBRA_WEB_APP_HOST}/api/health"
echo "[smoke] GET $URL"

# -f fails on 4xx/5xx; -s silent; -S show errors.
RESPONSE=$(curl -fsS "$URL")
echo "[smoke] response:"
echo "$RESPONSE" | jq . || echo "$RESPONSE"

STATUS=$(echo "$RESPONSE" | jq -r '.status' 2>/dev/null || echo "unknown")
case "$STATUS" in
  healthy)
    echo "[smoke] PASS: status=healthy"
    ;;
  degraded)
    echo "[smoke] WARN: status=degraded — circuit breaker is open. Investigate."
    exit 0
    ;;
  *)
    echo "[smoke] FAIL: unexpected status=$STATUS"
    exit 1
    ;;
esac
