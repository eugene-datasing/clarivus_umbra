#!/usr/bin/env bash
# =============================================================================
# Umbra — provision Azure resources via bicep
# =============================================================================
#
# Idempotent: re-running against an existing RG updates resources in-place.
#
# Required env:
#   UMBRA_RESOURCE_GROUP        e.g. rg-umbra-prototype
#   UMBRA_LOCATION              e.g. australiaeast (default if unset)
#   UMBRA_DB_ADMIN_PASSWORD     PostgreSQL admin password (8+ chars, complex)
#
# After this script:
#   1. Capture the bicep outputs into env (provision.sh prints them).
#   2. Populate Key Vault secrets — see scripts/deploy/seed-vault-secrets.sh
#      or `docs/deployment.md`.
#   3. Run `npm run deploy:build` to push the first image.
# =============================================================================

set -euo pipefail

: "${UMBRA_RESOURCE_GROUP:?UMBRA_RESOURCE_GROUP must be set}"
: "${UMBRA_DB_ADMIN_PASSWORD:?UMBRA_DB_ADMIN_PASSWORD must be set}"
LOCATION="${UMBRA_LOCATION:-australiaeast}"

echo "[provision] resource group: $UMBRA_RESOURCE_GROUP"
echo "[provision] location:       $LOCATION"

if ! az group show --name "$UMBRA_RESOURCE_GROUP" &>/dev/null; then
  echo "[provision] creating resource group..."
  az group create --name "$UMBRA_RESOURCE_GROUP" --location "$LOCATION" >/dev/null
fi

DEPLOYER_OBJECT_ID=$(az ad signed-in-user show --query id -o tsv)
echo "[provision] deployer object id: $DEPLOYER_OBJECT_ID"

DEPLOYMENT_NAME="umbra-$(date +%Y%m%d-%H%M%S)"
echo "[provision] deployment name: $DEPLOYMENT_NAME"

az deployment group create \
  --resource-group "$UMBRA_RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --template-file infra/main.bicep \
  --parameters location="$LOCATION" \
               dbAdminPassword="$UMBRA_DB_ADMIN_PASSWORD" \
               deployerObjectId="$DEPLOYER_OBJECT_ID" \
  --output table

echo ""
echo "[provision] outputs:"
az deployment group show \
  --resource-group "$UMBRA_RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --query properties.outputs \
  --output json

echo ""
echo "[provision] complete. Next:"
echo "  1. Populate Key Vault secrets (see docs/deployment.md step 2)."
echo "  2. Run: npm run deploy:build"
