#!/usr/bin/env bash
# =============================================================================
# Umbra — build the Docker image in ACR and tag it
# =============================================================================
#
# Uses `az acr build` so the image is built remotely in ACR (no local
# Docker daemon required, faster on macOS without crossbuild).
#
# Required env:
#   UMBRA_RESOURCE_GROUP        e.g. rg-umbra-prototype
#   UMBRA_ACR_NAME              e.g. acrumbraprototype (from bicep output)
#
# Optional env:
#   UMBRA_IMAGE_TAG             defaults to short git SHA (e.g. cr-abc1234)
#
# Notes:
#   - Tags both `<TAG>` and `latest` so the Web App's `:latest` ref resolves.
#   - The build args NEXT_BUILD_ID + NEXT_SERVER_ACTIONS_ENCRYPTION_KEY are
#     pulled from Key Vault to keep server-action hashes stable across
#     deploys (see Dockerfile + next.config.ts comments).
# =============================================================================

set -euo pipefail

: "${UMBRA_RESOURCE_GROUP:?UMBRA_RESOURCE_GROUP must be set}"
: "${UMBRA_ACR_NAME:?UMBRA_ACR_NAME must be set}"

# Tag = short git SHA prefixed with cr- (matches Phase 1 convention).
SHA_SHORT=$(git rev-parse --short=7 HEAD)
TAG="${UMBRA_IMAGE_TAG:-cr-$SHA_SHORT}"
IMAGE="umbra-prototype"

echo "[build] ACR: $UMBRA_ACR_NAME"
echo "[build] image: $IMAGE:$TAG (also tagging :latest)"

# Server-action hash inputs — read from Key Vault if available, else
# leave empty (Dockerfile has empty defaults so local builds work).
KV_NAME="kv-umbra-prototype"
NEXT_BUILD_ID="$SHA_SHORT"
NEXT_SAEK=""
if az keyvault secret show --vault-name "$KV_NAME" --name "next-server-actions-encryption-key" &>/dev/null; then
  NEXT_SAEK=$(az keyvault secret show \
    --vault-name "$KV_NAME" \
    --name "next-server-actions-encryption-key" \
    --query value -o tsv)
  echo "[build] using server-action encryption key from $KV_NAME"
fi

az acr build \
  --registry "$UMBRA_ACR_NAME" \
  --image "$IMAGE:$TAG" \
  --image "$IMAGE:latest" \
  --file Dockerfile \
  --build-arg "NEXT_BUILD_ID=$NEXT_BUILD_ID" \
  --build-arg "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$NEXT_SAEK" \
  .

echo ""
echo "[build] complete. Image: $UMBRA_ACR_NAME.azurecr.io/$IMAGE:$TAG"
echo "[build] next: npm run deploy:image (will deploy this tag to the Web App)"
echo ""
echo "[build] export the tag for the next step:"
echo "  export UMBRA_IMAGE_TAG=$TAG"
