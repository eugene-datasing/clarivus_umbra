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

# ---------------------------------------------------------------------------
# Phase 12.5.1 — bake the gpt-4o model deployment in.
# ---------------------------------------------------------------------------
# Bicep stands up the Azure OpenAI account but cannot create model
# deployments inside it (model deployments are a sub-resource that
# require quota approval and aren't covered by the cognitive-services
# bicep type cleanly). Pre-12.5.1 this was a manual "after first
# provision" step in docs/deployment.md — and it got missed during
# Phase 11b, surfacing as a privacy regression in 12.5 (AI silently
# down → pattern-only redactions). Now scripted + idempotent.
#
# Standard SKU + 50K TPM is the regional default for Australia East
# on a fresh subscription. Override via UMBRA_GPT4O_SKU / CAPACITY
# / VERSION if your subscription has GlobalStandard quota.
# ---------------------------------------------------------------------------
AOAI_NAME="${UMBRA_AOAI_NAME:-aoai-${UMBRA_NAME_PREFIX:-umbra-prototype}}"
GPT4O_VERSION="${UMBRA_GPT4O_VERSION:-2024-11-20}"
GPT4O_SKU="${UMBRA_GPT4O_SKU:-Standard}"
GPT4O_CAPACITY="${UMBRA_GPT4O_CAPACITY:-50}"

if az cognitiveservices account deployment show \
     --name "$AOAI_NAME" \
     --resource-group "$UMBRA_RESOURCE_GROUP" \
     --deployment-name gpt-4o &>/dev/null; then
  echo "[provision] gpt-4o model deployment already exists on $AOAI_NAME — skipping."
else
  echo "[provision] creating gpt-4o model deployment on $AOAI_NAME ($GPT4O_VERSION / $GPT4O_SKU / ${GPT4O_CAPACITY}K TPM)..."
  if ! az cognitiveservices account deployment create \
        --name "$AOAI_NAME" \
        --resource-group "$UMBRA_RESOURCE_GROUP" \
        --deployment-name gpt-4o \
        --model-name gpt-4o \
        --model-version "$GPT4O_VERSION" \
        --model-format OpenAI \
        --sku-name "$GPT4O_SKU" \
        --sku-capacity "$GPT4O_CAPACITY" \
        --output none; then
    echo "[provision] WARN: gpt-4o deployment create failed. Most likely quota: try"
    echo "[provision]       UMBRA_GPT4O_SKU=GlobalStandard if your subscription has it,"
    echo "[provision]       or request a quota uplift via Azure Portal → Cognitive Services."
    echo "[provision]       Pipeline will fall through to 'AI detection unavailable' until fixed."
  fi
fi

echo ""
echo "[provision] complete. Next:"
echo "  1. Populate Key Vault secrets (see docs/deployment.md step 2)."
echo "  2. Run: npm run deploy:build"
