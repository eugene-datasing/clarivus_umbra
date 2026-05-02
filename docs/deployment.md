# Umbra — Azure Deployment Guide

End-to-end deployment to Azure (Australia East). This guide walks
through the bicep provisioning, Azure AD app registration, image build,
secret population, migrations, optional seed, and smoke test.

The locked decisions for the prototype deployment:

- **Region:** Australia East (Azure OpenAI + Document Intelligence GA).
- **Resource group:** `rg-umbra-prototype`.
- **Postgres tier:** Burstable B1ms.
- **App Service Plan:** Linux B1, Always On = true (the in-process
  pg-boss worker depends on it).
- **Web App identity:** SystemAssigned managed identity with Key Vault
  Secrets User + AcrPull + Storage Blob Data Contributor roles.
- **Key Vault:** RBAC mode, soft-delete + purge-protection enabled.

---

## 1. Pre-requisites

Local tooling:

| | Tested with |
|---|---|
| Azure CLI (`az`) | 2.81+ |
| Bicep | bundled with `az` |
| `jq` | 1.7+ |
| Docker | not required — `az acr build` builds remotely |
| Node.js | 20+ (for prisma migrate / seed scripts) |

Subscription requirements:

- Owner or Contributor on the target subscription.
- Quota for: 1 × B1 App Service Plan, 1 × B1ms Postgres Flexible, 1 × S0
  Azure OpenAI, 1 × S0 Document Intelligence, all in Australia East.
- A user account that can sign in to Azure AD to register the SSO app.

Sign in:

```bash
az login
az account set --subscription <SUBSCRIPTION_ID>
```

---

## 2. Provision Azure resources

The bicep template lives at `infra/main.bicep`. Set the required env
and run the provision script:

```bash
export UMBRA_RESOURCE_GROUP=rg-umbra-prototype
export UMBRA_LOCATION=australiaeast

# 12+ characters, mixed case + numbers + symbol. Avoid '!' on macOS shells
# unless single-quoting the whole string.
export UMBRA_DB_ADMIN_PASSWORD='<a-strong-password>'

npm run deploy:provision
```

The script:

1. Creates the resource group if it doesn't exist.
2. Reads your Azure AD object ID via `az ad signed-in-user show`.
3. Submits the bicep template with that object ID as
   `deployerObjectId` (so you get Key Vault Administrator on the new
   vault for the secret-population step below).
4. Prints all outputs as JSON.

Capture the outputs you'll need:

```bash
DEPLOYMENT_OUTPUTS=$(az deployment group show \
  --resource-group "$UMBRA_RESOURCE_GROUP" \
  --name <DEPLOYMENT_NAME_FROM_OUTPUT> \
  --query properties.outputs \
  --output json)

export UMBRA_ACR_NAME=$(echo "$DEPLOYMENT_OUTPUTS" | jq -r '.acrName.value')
export UMBRA_WEB_APP_NAME=$(echo "$DEPLOYMENT_OUTPUTS" | jq -r '.webAppName.value')
export UMBRA_WEB_APP_HOST=$(echo "$DEPLOYMENT_OUTPUTS" | jq -r '.webAppDefaultHostName.value')
export UMBRA_KEY_VAULT_NAME=$(echo "$DEPLOYMENT_OUTPUTS" | jq -r '.keyVaultName.value')
export UMBRA_POSTGRES_FQDN=$(echo "$DEPLOYMENT_OUTPUTS" | jq -r '.postgresFqdn.value')
export UMBRA_AOAI_NAME=$(echo "$DEPLOYMENT_OUTPUTS" | jq -r '.aoaiName.value')
```

After provisioning the Azure OpenAI **account**, deploy the GPT-4o
**model** under it:

```bash
az cognitiveservices account deployment create \
  --resource-group "$UMBRA_RESOURCE_GROUP" \
  --name "$UMBRA_AOAI_NAME" \
  --deployment-name gpt-4o \
  --model-name gpt-4o \
  --model-version 2024-08-06 \
  --model-format OpenAI \
  --sku-capacity 50 \
  --sku-name Standard
```

Capacity 50 = 50K TPM standard tier; the Phase-5 detection-coverage
work confirmed this is sufficient for concurrency=2.

---

## 3. Register the Azure AD app (SSO)

This is tenant-scoped, not in the bicep template.

```bash
TENANT_ID=$(az account show --query tenantId -o tsv)

REPLY_URL="https://${UMBRA_WEB_APP_HOST}/api/auth/callback/azure-ad"

APP=$(az ad app create \
  --display-name "Umbra Prototype" \
  --sign-in-audience AzureADMyOrg \
  --web-redirect-uris "$REPLY_URL" \
  --query "{appId:appId, id:id}" -o json)

CLIENT_ID=$(echo "$APP" | jq -r '.appId')
APP_OBJECT_ID=$(echo "$APP" | jq -r '.id')

# Create a client secret (default 6 month expiry; lengthen as needed).
CLIENT_SECRET=$(az ad app credential reset \
  --id "$APP_OBJECT_ID" \
  --display-name "umbra-prototype-secret" \
  --query password -o tsv)

echo "Client ID:     $CLIENT_ID"
echo "Tenant ID:     $TENANT_ID"
echo "Client secret: $CLIENT_SECRET   (you cannot retrieve this again — store it now)"
```

---

## 4. Populate Key Vault secrets

The Web App resolves secrets via `@Microsoft.KeyVault(...)` references
defined in the bicep. Populate each secret once:

```bash
# Database URL — note the sslmode=require suffix.
DB_URL="postgresql://umbra:${UMBRA_DB_ADMIN_PASSWORD}@${UMBRA_POSTGRES_FQDN}:5432/umbra?sslmode=require"
az keyvault secret set --vault-name "$UMBRA_KEY_VAULT_NAME" --name database-url --value "$DB_URL"

# NextAuth secret.
az keyvault secret set --vault-name "$UMBRA_KEY_VAULT_NAME" --name auth-secret --value "$(openssl rand -base64 32)"

# Server-action encryption key — keeps server-action hashes stable across
# deploys (see Dockerfile + next.config.ts comments).
az keyvault secret set --vault-name "$UMBRA_KEY_VAULT_NAME" --name next-server-actions-encryption-key --value "$(openssl rand -hex 32)"

# Azure OpenAI key.
AOAI_KEY=$(az cognitiveservices account keys list \
  --resource-group "$UMBRA_RESOURCE_GROUP" \
  --name "$UMBRA_AOAI_NAME" \
  --query key1 -o tsv)
az keyvault secret set --vault-name "$UMBRA_KEY_VAULT_NAME" --name azure-openai-key --value "$AOAI_KEY"

# Document Intelligence key.
DI_KEY=$(az cognitiveservices account keys list \
  --resource-group "$UMBRA_RESOURCE_GROUP" \
  --name "di-umbra-prototype" \
  --query key1 -o tsv)
az keyvault secret set --vault-name "$UMBRA_KEY_VAULT_NAME" --name azure-di-key --value "$DI_KEY"

# Storage connection string.
STORAGE_CONN=$(az storage account show-connection-string \
  --resource-group "$UMBRA_RESOURCE_GROUP" \
  --name "stumbraprototype" \
  --query connectionString -o tsv)
az keyvault secret set --vault-name "$UMBRA_KEY_VAULT_NAME" --name azure-storage-connection-string --value "$STORAGE_CONN"

# Azure AD SSO secrets (from step 3).
az keyvault secret set --vault-name "$UMBRA_KEY_VAULT_NAME" --name azure-ad-client-id --value "$CLIENT_ID"
az keyvault secret set --vault-name "$UMBRA_KEY_VAULT_NAME" --name azure-ad-client-secret --value "$CLIENT_SECRET"
az keyvault secret set --vault-name "$UMBRA_KEY_VAULT_NAME" --name azure-ad-tenant-id --value "$TENANT_ID"
```

Restart the Web App so it re-reads the Key Vault references:

```bash
az webapp restart --name "$UMBRA_WEB_APP_NAME" --resource-group "$UMBRA_RESOURCE_GROUP"
```

---

## 5. Build and push the Docker image

```bash
npm run deploy:build
# This runs `az acr build` against the local Dockerfile, tags the image
# as both `cr-<short-sha>` and `latest`. Capture the tag.
export UMBRA_IMAGE_TAG=cr-$(git rev-parse --short=7 HEAD)
```

The first build typically takes 5–8 minutes (LibreOffice + PyMuPDF
install in the runner stage). Subsequent builds are faster thanks to
ACR's layer cache.

---

## 6. Deploy the image to the Web App

```bash
npm run deploy:image
```

The script points the Web App's container reference at the new tag and
restarts. Cold start is ~30–60 seconds; tail logs with:

```bash
az webapp log tail \
  --name "$UMBRA_WEB_APP_NAME" \
  --resource-group "$UMBRA_RESOURCE_GROUP"
```

---

## 7. Run migrations

```bash
export UMBRA_DATABASE_URL="postgresql://umbra:${UMBRA_DB_ADMIN_PASSWORD}@${UMBRA_POSTGRES_FQDN}:5432/umbra?sslmode=require"

npm run deploy:migrate
```

Phase 11 freezes the schema. Subsequent schema changes need a real
migration (`npx prisma migrate dev --name <change>`), not the
0001_init regenerate pattern used pre-deploy.

---

## 8. Optional — seed Ministry of Demo data

```bash
npm run deploy:seed
```

The seed is idempotent (upserts); re-running doesn't duplicate. Skip
this step in customer-hosted deployments.

---

## 9. Smoke test

```bash
npm run deploy:smoke
```

The script hits `/api/health` and asserts `status=healthy` (or
`status=degraded` with a warning). 503 (`status=unhealthy`) means a
critical dependency (DB) is unreachable.

For a full end-to-end smoke, sign in via SSO at
`https://${UMBRA_WEB_APP_HOST}` and walk through the Phase 9
DEMO-SCRIPT.md flow.

---

## Subsequent deploys

For app-only changes (no schema change):

```bash
git pull
export UMBRA_IMAGE_TAG=cr-$(git rev-parse --short=7 HEAD)
npm run deploy:build && npm run deploy:image && npm run deploy:smoke
```

For schema-changing deploys, slot the migration call between image and
smoke:

```bash
npm run deploy:build && npm run deploy:image && npm run deploy:migrate && npm run deploy:smoke
```

---

## Rollback

To roll back to a prior image tag:

```bash
# List tags from ACR.
az acr repository show-tags \
  --name "$UMBRA_ACR_NAME" \
  --repository umbra-prototype \
  --orderby time_desc \
  --output table

# Pick a known-good tag, then:
export UMBRA_IMAGE_TAG=<known-good-tag>
npm run deploy:image
```

Schema rollback requires a forward migration — Postgres backups (see
"Disaster recovery" below) are the safety net for catastrophic schema
issues.

---

## Cost estimate

Rough Australia East monthly costs at low volume (~5 reviewers, ~50
batches, ~500 documents/month):

| Resource | SKU | Monthly |
|---|---|---|
| App Service Plan B1 | Linux B1 | NZ$22 |
| Postgres Flexible Burstable B1ms + 32 GB storage + 7-day backups | | NZ$22 |
| Storage account (Standard LRS, < 100 GB) | | NZ$3 |
| Container Registry Basic | | NZ$8 |
| Application Insights + Log Analytics (workspace-based, < 5 GB ingestion) | | NZ$10 |
| Key Vault | Standard | NZ$1 |
| **Fixed cost subtotal** | | **~NZ$70** |
| Azure OpenAI gpt-4o | usage-based | ~NZ$80 (10M input + 2M output tokens) |
| Document Intelligence prebuilt-read | usage-based | ~NZ$10 (2K pages OCR) |
| Bandwidth | egress | ~NZ$5 |
| **Total** | | **~NZ$165/month** |

Costs scale with AI usage — most of the fixed cost is the small
infra footprint. Quote NZD; the figures are converted from USD list
prices and may drift week-to-week.

---

## Disaster recovery + backup

| Layer | Mechanism |
|---|---|
| Postgres | Built-in PITR with 7-day retention. Zonally redundant by default in Aus East. Manual backup via `pg_dump` to blob storage as belt-and-braces. |
| Blob storage | 14-day soft-delete on blobs + container deletes (configured in bicep). Enables undeleting of accidentally-removed redactions or archives. |
| Key Vault | Soft-delete + purge protection (14-day window). |
| ACR | Images retained indefinitely on Basic tier; manual purge policy if size grows. |
| Container Registry images | Tagged with `cr-<sha>`; rollback path documented above. |
| Audit archive blobs | `archives/{YYYY}/{batchId}/...` is the immutable record of every purged batch. **Never** mutated post-write. |

The Phase 6c retention worker has its own roundtrip-verification
gate before any cascade-delete proceeds — see
`lib/jobs/audit-archive.ts`.

---

## Troubleshooting

**Web app returns 503 immediately after image deploy.** The container
is still pulling. Wait 30–60 seconds; check `az webapp log tail`.

**`/api/health` returns `status=unhealthy` with a database error.**
Postgres firewall rule may be missing — bicep adds the
`AllowAzureServices` rule but you can verify:

```bash
az postgres flexible-server firewall-rule list \
  --resource-group "$UMBRA_RESOURCE_GROUP" \
  --name "psql-umbra-prototype"
```

**Server-action errors after deploy: "An error occurred."**
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` changed between images. The bicep
build script reads it from Key Vault — confirm
`next-server-actions-encryption-key` is populated and the build script
ran with that env present.

**Azure OpenAI 429 (Too Many Requests).** The model deployment's
TPM/RPM limits are hit. Check the deployment's metrics in the portal;
either bump capacity or lower `AI_DETECT_CONCURRENCY` (default 2).

**Key Vault reference resolution fails.** Confirm the Web App's
managed identity has the Key Vault Secrets User role. The bicep
template assigns this; if you redeployed manually you may need:

```bash
az role assignment create \
  --role "Key Vault Secrets User" \
  --assignee-object-id $(az webapp identity show \
    --name "$UMBRA_WEB_APP_NAME" \
    --resource-group "$UMBRA_RESOURCE_GROUP" \
    --query principalId -o tsv) \
  --assignee-principal-type ServicePrincipal \
  --scope $(az keyvault show --name "$UMBRA_KEY_VAULT_NAME" --query id -o tsv)
```
