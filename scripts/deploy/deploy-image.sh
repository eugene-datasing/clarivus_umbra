#!/usr/bin/env bash
# =============================================================================
# Umbra — point the Web App at a new container image tag and restart
# =============================================================================
#
# Required env:
#   UMBRA_RESOURCE_GROUP        e.g. rg-umbra-prototype
#   UMBRA_ACR_NAME              e.g. acrumbraprototype
#   UMBRA_WEB_APP_NAME          e.g. app-umbra-prototype
#
# Optional env:
#   UMBRA_IMAGE_TAG             defaults to "latest"
# =============================================================================

set -euo pipefail

: "${UMBRA_RESOURCE_GROUP:?UMBRA_RESOURCE_GROUP must be set}"
: "${UMBRA_ACR_NAME:?UMBRA_ACR_NAME must be set}"
: "${UMBRA_WEB_APP_NAME:?UMBRA_WEB_APP_NAME must be set}"

TAG="${UMBRA_IMAGE_TAG:-latest}"
IMAGE="$UMBRA_ACR_NAME.azurecr.io/umbra-prototype:$TAG"

echo "[deploy-image] target: $UMBRA_WEB_APP_NAME"
echo "[deploy-image] image:  $IMAGE"

az webapp config container set \
  --name "$UMBRA_WEB_APP_NAME" \
  --resource-group "$UMBRA_RESOURCE_GROUP" \
  --container-image-name "$IMAGE" \
  --output none

echo "[deploy-image] restarting web app..."
az webapp restart \
  --name "$UMBRA_WEB_APP_NAME" \
  --resource-group "$UMBRA_RESOURCE_GROUP" \
  --output none

echo "[deploy-image] complete. App will take ~30-60s to come up."
echo "[deploy-image] tail logs with:"
echo "  az webapp log tail --name $UMBRA_WEB_APP_NAME --resource-group $UMBRA_RESOURCE_GROUP"
