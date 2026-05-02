# Veil Azure Infrastructure Specification

## 1. Service Architecture

Seven Azure services, all in `australiaeast` region.

```
                    ┌──────────────────┐
                    │   Azure AD /     │
                    │   Entra ID       │
                    │   (NPDC Tenant)  │
                    └────────┬─────────┘
                             │ OAuth2 / OIDC
                             │
┌────────────────────────────▼─────────────────────────────┐
│                    Azure App Service                      │
│                    (Linux, B1 Plan)                       │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Docker Container (ACR)                              │ │
│  │  ┌───────────┐  ┌──────────┐  ┌──────────────────┐ │ │
│  │  │ Next.js   │  │ NextAuth │  │ Python3 +        │ │ │
│  │  │ 15 Server │←→│ (Azure   │  │ PyMuPDF          │ │ │
│  │  │ Node 20   │  │  AD +    │  │ (PDF redaction)  │ │ │
│  │  │           │  │  Creds)  │  │                  │ │ │
│  │  └──┬──┬─────┘  └──────────┘  └──────────────────┘ │ │
│  └─────┼──┼───────────────────────────────────────────┘ │
└────────┼──┼─────────────────────────────────────────────┘
         │  │
  ┌──────┴──┴──────────────────────────────┐
  │         │                               │
  ▼         │                               ▼
┌──────────────────────┐  ┌─────────────────────────────┐
│ Azure Database for   │  │ Azure Blob Storage          │
│ PostgreSQL           │  │ (documents container)       │
│ Flexible Server      │  │                             │
│ (Burstable B1ms)     │  │ uploads/{caseId}/{docId}/   │
│                      │  │ exports/{caseId}/           │
└──────────────────────┘  └─────────────────────────────┘
         │
         ▼
┌──────────────────────────┐
│ Azure Service Bus        │
│ (Standard)               │
│                          │
│ document-processing      │
│   └─ $deadletterqueue    │
└──────────────────────────┘

     ┌──────────────────────────────────────┐
     │         Azure AI Services            │
     │  ┌──────────────┐ ┌───────────────┐  │
     │  │ Azure OpenAI │ │ Document      │  │
     │  │ (GPT-4o)     │ │ Intelligence  │  │
     │  └──────────────┘ └───────────────┘  │
     └──────────────────────────────────────┘

     ┌──────────────────┐    ┌──────────────────────┐
     │ Azure Key Vault  │    │ Azure Container      │
     │ (secrets)        │    │ Registry (Basic)     │
     └──────────────────┘    └──────────────────────┘
```

---

## 2. Service Selection & Rationale

### 2.1 Compute: Azure App Service (Linux)

**Selected tier:** B1 (1 vCPU, 1.75 GB RAM)

**Why App Service over alternatives:**

| Option | Verdict | Reason |
|--------|---------|--------|
| **App Service (Linux)** | Selected | Native Node.js support, simple deployment, custom containers for Python runtime, deployment slots, managed SSL, ~$22/month |
| Static Web Apps | Rejected | Cannot run Next.js server components with Prisma DB calls, Python subprocesses, or server-side file I/O. Designed for JAMstack. |
| Container Apps | Deferred | Good for horizontal auto-scaling across instances, but adds container registry management and scale-to-zero cold starts. Appropriate later when multi-instance is needed. |
| AKS | Rejected | Kubernetes operational overhead is unjustified for a single application. |
| VM | Rejected | Unmanaged infrastructure. No auto-patching, no deployment slots, manual scaling. |

**Custom Docker container** deployed to App Service rather than native Node.js runtime, because the app requires Python3 + PyMuPDF alongside Node.js for PDF redaction. App Service supports pulling container images from Azure Container Registry.

**Scaling path:** B1 → S1 ($55/month) → P1v3 ($180/month) as load increases. Horizontal scale-out available on S1+ (up to 10 instances). Azure Service Bus (section 2.7) ensures the job queue works correctly across multiple instances.

### 2.2 Database: Azure Database for PostgreSQL Flexible Server

**Selected tier:** Burstable B1ms (1 vCore, 2 GB RAM, 32 GB storage)

**Why this service:**

- Prisma connects via standard `postgresql://` connection string — zero code change
- The app already uses PostgreSQL 16 (Docker) with Prisma v7.5 and `@prisma/adapter-pg`
- Flexible Server is Azure's current-generation managed PostgreSQL (Single Server is deprecated)
- Burstable tier is ideal for variable-load workloads (prototype/early production)
- Automated daily backups with 7-day retention
- SSL enforced by default
- Point-in-time restore available

**Not Azure SQL Database** — the app is built entirely on PostgreSQL. The Prisma schema uses PostgreSQL-specific features and the JSON-heavy document content storage is optimised for PostgreSQL's `jsonb` type.

**Configuration:**
- PostgreSQL version: 16
- Storage: 32 GB (auto-grow enabled)
- Backup retention: 7 days
- High availability: Disabled for prototype (enable for production)
- Network: Public access with firewall rules (App Service IP whitelisted), or VNet integration for production

**Scaling path:** Burstable B1ms → General Purpose D2s ($130/month) → D4s ($260/month). Storage scales independently.

### 2.3 File Storage: Azure Blob Storage

**Selected tier:** Standard general-purpose v2, Hot access tier

**Why Blob Storage:**

- The app has an existing `StorageProvider` interface (`lib/storage/types.ts`) with `upload()`, `download()`, `exists()`, `delete()`, `getUrl()` methods
- Current implementation is `LocalStorageProvider` using `fs/promises`
- Need to add `BlobStorageProvider` implementing the same interface — clean swap with no changes to calling code
- Hot tier for active documents, Cool tier available for archived cases
- SDK: `@azure/storage-blob`

**Container structure:**
```
documents/
  uploads/{caseId}/{docId}/original.pdf
  uploads/{caseId}/{docId}/original.docx
  exports/{caseId}/requester-package.zip
  exports/{caseId}/internal-package.zip
  exports/{caseId}/ombudsman-package.zip
```

**Access control:** Storage account key stored in Key Vault. No public blob access — all access via server-side SDK. SAS tokens generated for time-limited download URLs if needed.

**Cost:** ~$0.03 NZD/GB/month for Hot tier. At prototype scale (< 5 GB), this is negligible.

### 2.4 Secrets: Azure Key Vault

**Selected tier:** Standard

**Secrets to store:**

| Secret | Purpose |
|--------|---------|
| `db-connection-string` | PostgreSQL connection URL |
| `azure-ad-client-secret` | Azure AD app registration secret |
| `azure-openai-key` | GPT-4o API key |
| `azure-di-key` | Document Intelligence API key |
| `auth-secret` | NextAuth JWT signing key |
| `storage-account-key` | Blob Storage access key |
| `service-bus-connection-string` | Service Bus namespace connection string |

**Integration:** App Service references Key Vault secrets directly in application settings using the syntax:
```
@Microsoft.KeyVault(SecretUri=https://{vault-name}.vault.azure.net/secrets/{secret-name}/)
```

This means environment variables in App Service resolve to Key Vault values at runtime. No code changes needed — the app reads `process.env.DATABASE_URL` as normal.

**Access:** App Service's managed identity is granted `Key Vault Secrets User` role. No keys or connection strings stored in app configuration or code.

### 2.5 Container Registry: Azure Container Registry

**Selected tier:** Basic

**Purpose:** Store the custom Docker image (Node.js 20 + Python3 + PyMuPDF) that App Service pulls from.

**Why needed:** App Service can pull custom containers from ACR. The Python runtime requirement makes a custom container necessary rather than using App Service's native Node.js runtime.

**Cost:** ~$8 NZD/month (Basic tier, 10 GB included storage).

**Workflow:** Currently, `az acr build` builds the image server-side in ACR. App Service is configured to pull from ACR via managed identity (AcrPull role). Target state: GitHub Actions triggers `az acr build` on push to main → App Service pulls the new image on restart.

### 2.6 AI Services (Existing)

Already provisioned and integrated. No changes needed.

**Azure OpenAI:**
- Deployment: GPT-4o in `australiaeast`
- SDK: `openai` v6.32.0 (AzureOpenAI class)
- API version: `2024-10-21`
- Env vars: `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY`, `AZURE_OPENAI_DEPLOYMENT`

**Azure Document Intelligence:**
- Model: `prebuilt-read` (OCR)
- SDK: `@azure/ai-form-recognizer` v5.1.0
- Region: `australiaeast`
- Env vars: `AZURE_DI_ENDPOINT`, `AZURE_DI_KEY`

### 2.7 Messaging: Azure Service Bus

**Selected tier:** Standard

**Why Service Bus over alternatives:**

| Option | Verdict | Reason |
|--------|---------|--------|
| **Azure Service Bus (Standard)** | Selected | Durable message delivery, dead-letter queue for failed jobs, peek-lock pattern ensures at-least-once processing, integrates cleanly with Node.js via `@azure/service-bus` SDK |
| In-process queue (current) | Replaced | Jobs stored in `globalThis` are lost on App Service restart, deployment, or scale event. Unacceptable for document processing where a single job may represent 30+ minutes of OCR + AI analysis. |
| Azure Queue Storage | Considered | Simpler and cheaper (~$0.01/month) but lacks dead-letter queues, message scheduling, and the peek-lock pattern. Service Bus is more appropriate for a processing pipeline where job failure handling matters. |
| Azure Event Grid | Rejected | Event-driven fan-out pattern — wrong model for sequential job processing with retries. |

**Why now (not deferred):**

The current in-process job queue (`lib/queue/job-queue.ts`) stores jobs in a `globalThis` Map with concurrency 2 and max 3 retries. This works on a local dev machine but fails in Azure App Service because:

1. **App Service restarts on deploy** — every `git push` kills running jobs mid-processing
2. **Platform restarts** — App Service may restart instances for patching, scaling, or health recovery
3. **No persistence** — if a document is mid-OCR when the process dies, the job is lost silently
4. **No visibility** — no way to inspect queued/failed jobs from outside the process

Service Bus solves all four issues with durable, inspectable message queues.

**Queue design:**

| Queue | Purpose | Max delivery count |
|-------|---------|-------------------|
| `document-processing` | OCR extraction + AI detection pipeline jobs | 3 |
| `document-processing/$deadletterqueue` | Auto-routed failed jobs for inspection/retry | — |

**Message schema:**
```json
{
  "documentId": "doc-xxx",
  "caseId": "case-xxx",
  "action": "process",
  "attempt": 1
}
```

**SDK:** `@azure/service-bus` (uses `ServiceBusClient` with connection string from Key Vault)

**Cost:** ~$15 NZD/month (Standard tier, base charge + per-message at prototype volumes).

---

## 3. Services Explicitly Not Included

| Service | Reason for exclusion | When to add |
|---------|---------------------|-------------|
| Azure AI Search | Database queries sufficient at prototype document volumes (< 1,000 docs). Prisma handles filtering and sorting. | When handling 1,000+ documents per case or when full-text search across document content is needed |
| Azure Communication Services | No notification workflow exists in the app yet. No email sending code. | When adding deadline alerts, review assignment notifications, or requester correspondence |
| Azure CDN / Front Door | App Service handles SSL termination and serves Next.js static assets adequately. Latency from Australia East to NZ is ~25ms. | When optimising for sub-10ms static asset delivery or adding WAF/DDoS protection |
| Azure Application Insights | Console logging sufficient for prototype debugging. | Before production launch — add for request tracing, error monitoring, performance metrics |
| Azure Redis Cache | No caching layer in the app. Database queries are fast at current scale. | When query performance becomes an issue or when session storage needs to be shared across instances |
| Azure VNet / Private Endpoints | Public endpoints with firewall rules and SSL are adequate for prototype. | Before production launch — add VNet integration so App Service → PostgreSQL traffic stays on Azure backbone |

---

## 4. Region & Data Sovereignty

**Region:** `australiaeast` (New South Wales, Australia)

All seven services deployed to the same region. This ensures:

- **Data sovereignty:** All data processing and storage within AU jurisdiction. NZ government data stays in the ANZ region. NPDC's RFP requires approved data residency (NZ/AU).
- **Latency:** ~25ms from New Zealand to Australia East. Acceptable for a web application.
- **Service availability:** All required services (App Service, PostgreSQL Flexible Server, Blob Storage, Key Vault, OpenAI, Document Intelligence, Container Registry, Service Bus) are available in `australiaeast`.
- **Co-location:** Database, storage, and compute in the same region eliminates cross-region data transfer costs and latency.

**Azure NZ North (Auckland):** Microsoft has announced a New Zealand Azure region but service availability varies. When PostgreSQL Flexible Server, OpenAI, and Document Intelligence are all available in NZ North, consider migrating for true in-country data residency — a strong differentiator for the NPDC bid.

---

## 5. Docker Container Specification

The app requires a multi-runtime container: Node.js 20 for Next.js and Python 3 for PyMuPDF PDF redaction. The container uses Next.js standalone output mode, which bundles only the required `node_modules` into `.next/standalone/` and runs via `node server.js` instead of `npm run start`.

```dockerfile
# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build the application
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 3: Production runtime
FROM node:20-alpine AS runner
WORKDIR /app

# Install Python3 + PyMuPDF for PDF redaction
RUN apk add --no-cache python3 py3-pip && \
    pip3 install --break-system-packages PyMuPDF

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy standalone build (includes bundled node_modules)
COPY --from=builder /app/.next/standalone ./
# Copy static assets and public files (not included in standalone)
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Copy Prisma schema + migrations (needed for prisma migrate deploy)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
# Copy generated Prisma client (v7 outputs to lib/generated/prisma)
COPY --from=builder /app/lib/generated/prisma ./lib/generated/prisma
# Copy Prisma CLI + engine for migrations
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
# Copy Python scripts for PDF redaction/verification
COPY --from=builder /app/lib/pipeline/redact_pdf_pymupdf.py ./lib/pipeline/redact_pdf_pymupdf.py
COPY --from=builder /app/lib/pipeline/verify_redaction_pymupdf.py ./lib/pipeline/verify_redaction_pymupdf.py

EXPOSE 3000

CMD ["node", "server.js"]
```

Key decisions:
- **Alpine base** — smallest image size (~150 MB vs ~900 MB for Debian)
- **Multi-stage build** — development dependencies not included in runtime image
- **Next.js standalone output** — `next.config.ts` has `output: "standalone"`, which bundles only needed `node_modules` into `.next/standalone/`. Runtime uses `node server.js` directly (not `npm run start`), reducing image size significantly
- **Prisma v7 paths** — Prisma v7 generates the client to `lib/generated/prisma` (configured via `output` in `schema.prisma`), not `node_modules/.prisma` as in earlier versions. The `prisma.config.ts` file must also be copied alongside the schema
- **Python scripts copied explicitly** — only the two `.py` files needed, not the full `lib/pipeline/` TypeScript source
- **Prisma client generated at build time** — `prisma generate` runs during build, not at startup
- **`HOSTNAME=0.0.0.0`** — required for App Service to reach the container (defaults to localhost otherwise)
- **`force-dynamic` in root layout** — `app/layout.tsx` exports `dynamic = "force-dynamic"` to prevent Next.js from attempting static prerendering during build, which fails because Prisma cannot connect to a database at Docker build time

---

## 6. Environment Variables (Production)

### 6.1 Currently Configured (Prototype)

The following are configured on `app-veil-prototype` App Service:

**Direct values (non-secret):**

```env
AZURE_OPENAI_ENDPOINT=https://australiaeast.api.cognitive.microsoft.com/
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_DI_ENDPOINT=https://australiaeast.api.cognitive.microsoft.com/
AZURE_STORAGE_ACCOUNT_NAME=stveilprototype
AZURE_STORAGE_CONTAINER_NAME=documents
AZURE_SERVICE_BUS_QUEUE_NAME=document-processing
NEXTAUTH_URL=https://app-veil-prototype.azurewebsites.net
AUTH_CREDENTIALS_ENABLED=true
WEBSITES_PORT=3000
```

**Key Vault references (secrets):**

```env
DATABASE_URL=@Microsoft.KeyVault(VaultName=kv-veil-prototype;SecretName=db-connection-string)
AUTH_SECRET=@Microsoft.KeyVault(VaultName=kv-veil-prototype;SecretName=auth-secret)
AZURE_OPENAI_KEY=@Microsoft.KeyVault(VaultName=kv-veil-prototype;SecretName=azure-openai-key)
AZURE_DI_KEY=@Microsoft.KeyVault(VaultName=kv-veil-prototype;SecretName=azure-di-key)
AZURE_STORAGE_ACCOUNT_KEY=@Microsoft.KeyVault(VaultName=kv-veil-prototype;SecretName=storage-account-key)
AZURE_SERVICE_BUS_CONNECTION_STRING=@Microsoft.KeyVault(VaultName=kv-veil-prototype;SecretName=service-bus-connection-string)
```

### 6.2 Not Yet Configured (Pending Azure AD Setup)

```env
AZURE_AD_CLIENT_ID=<app-registration-client-id>
AZURE_AD_CLIENT_SECRET=@Microsoft.KeyVault(VaultName=kv-veil-prototype;SecretName=azure-ad-client-secret)
AZURE_AD_TENANT_ID=<npdc-or-datasign-tenant-id>
```

Once Azure AD is configured, set `AUTH_CREDENTIALS_ENABLED=false` for production.

### 6.3 Key Vault Secrets

| Secret name | Content |
|-------------|---------|
| `db-connection-string` | `postgresql://veiladmin:{password}@psql-veil-prototype.postgres.database.azure.com:5432/veil?sslmode=require` |
| `auth-secret` | Random 32-char JWT signing key |
| `azure-openai-key` | GPT-4o API key |
| `azure-di-key` | Document Intelligence API key |
| `storage-account-key` | Blob Storage access key |
| `service-bus-connection-string` | Service Bus namespace connection string |
| `azure-ad-client-secret` | *(not yet created)* — Azure AD app registration secret |

All secret values resolved from Key Vault via App Service managed identity references. Only non-secret values (endpoints, deployment names, container names) stored directly in App Service configuration.

---

## 7. Deployment Pipeline

### 7.1 Current Deployment (Manual via CLI)

The prototype is currently deployed using `az acr build` (ACR Tasks) for cloud-side Docker builds:

```bash
# Build image in ACR (no local Docker required)
az acr build --registry acrveilprototype \
  --image veil-prototype:latest \
  --file Dockerfile .

# Restart App Service to pull new image
az webapp restart --name app-veil-prototype --resource-group rg-veil-prototype

# Run Prisma migrations against Azure PostgreSQL
DATABASE_URL="postgresql://veiladmin:{password}@psql-veil-prototype.postgres.database.azure.com:5432/veil?sslmode=require" \
  npx prisma migrate deploy
```

ACR Tasks uploads the source code and builds the Docker image server-side, so no local Docker daemon is needed.

### 7.2 Target Deployment (GitHub Actions)

```
Push to main branch
  │
  ├─ Checkout code
  ├─ Login to Azure Container Registry
  ├─ Build Docker image via ACR Tasks (az acr build)
  ├─ Tag image with :latest and :sha-{commit}
  ├─ Restart App Service (pulls new image from ACR)
  └─ Run Prisma migrations against Azure PostgreSQL
       └─ npx prisma migrate deploy (applies pending migrations)
```

### 7.3 Migration Strategy

Prisma migrations run as a separate step after the container is deployed but before it receives traffic:

- `prisma migrate deploy` applies any pending migrations
- This is a non-destructive operation (only applies forward migrations)
- If a migration fails, the deployment is rolled back
- App Service deployment slots can be used for zero-downtime deploys:
  1. Deploy to staging slot
  2. Run migrations
  3. Swap staging → production

### 7.4 ACR Image Cleanup Policy

The Basic tier ACR includes 10 GB of storage. Without cleanup, old images accumulate and eventually exceed the quota. An automated purge command runs as part of the GitHub Actions workflow after each successful deploy:

```bash
az acr run --cmd "acr purge --filter 'veil-prototype:.*' --untagged --ago 30d" \
  --registry acrveilprototype /dev/null
```

This removes:
- **Untagged images** — leftover intermediate layers from multi-stage builds
- **Images older than 30 days** — retains roughly the last month of deployments
- **`:latest` and recent `:sha-*` tags are preserved** — the purge only targets images not matching any current tag

The purge runs inside ACR (server-side) via `az acr run`, so no image data transits the GitHub Actions runner.

**Alternative:** Configure an ACR retention policy (Preview feature) to auto-delete untagged manifests after a set period. Once this feature exits preview, it can replace the CLI-based purge.

### 7.5 Branch Strategy

| Branch | Deploys to | Auto-deploy? |
|--------|-----------|-------------|
| `main` | Production App Service | Yes (on push) |
| `staging` | Staging deployment slot | Yes (on push) |
| Feature branches | — | No (PR review only) |

---

## 8. Code Changes Required for Deployment

### 8.1 Completed

| Change | File(s) | Status |
|--------|---------|--------|
| **Create Dockerfile** | `Dockerfile` | Done — multi-stage build with standalone output (section 5) |
| **Next.js standalone output** | `next.config.ts` | Done — `output: "standalone"` |
| **Force-dynamic rendering** | `app/layout.tsx` | Done — `export const dynamic = "force-dynamic"` prevents static prerendering during Docker build (Prisma needs DB at runtime, not build time) |
| **Create .dockerignore** | `.dockerignore` | Done — excludes node_modules, .next, .env*, uploads, .git |
| **Prisma migrations deployed** | `prisma/migrations/` | Done — 10 migrations applied to Azure PostgreSQL |
| **Key Vault integration** | App Service config | Done — 6 secrets stored, resolved via managed identity references |
| **ACR image built and deployed** | `acrveilprototype` | Done — image running on `app-veil-prototype` |

### 8.2 Remaining (before production)

| Change | File(s) | Description |
|--------|---------|-------------|
| **Add BlobStorageProvider** | `lib/storage/blob.ts` | Implement `StorageProvider` interface using `@azure/storage-blob` SDK. Currently using local filesystem — files stored in container's ephemeral storage. |
| **Wire storage provider** | `lib/storage/index.ts` | Switch to `BlobStorageProvider` when `AZURE_STORAGE_ACCOUNT_NAME` is set |
| **Add `@azure/storage-blob`** | `package.json` | New dependency |
| **Migrate job queue to Service Bus** | `lib/queue/job-queue.ts`, `lib/queue/service-bus.ts` | Replace `globalThis` in-process queue with `@azure/service-bus` client. Service Bus namespace and queue are provisioned (`sb-veil-prototype` / `document-processing`) but not yet wired into the app code. |
| **Add `@azure/service-bus`** | `package.json` | New dependency |
| **Create GitHub Actions workflow** | `.github/workflows/deploy.yml` | Automate: ACR build, App Service restart, Prisma migrate deploy |

### 8.3 Non-blocking (can iterate after deploy)

| Change | File(s) | Description |
|--------|---------|-------------|
| Azure AD provider | `lib/auth/auth-options.ts` | Add NextAuth Azure AD provider (per auth spec) |
| User schema fields | `prisma/schema.prisma` | Add `azureAdOid`, `isActive` (per auth spec) |
| User management CRUD | `lib/actions/user-actions.ts`, admin settings UI | Replace mock user data with real DB operations |
| First-run bootstrap | Auth callbacks, login page | Auto-provision first admin on Azure AD sign-in |
| Setup wizard flow | Dashboard redirect, setup page | Redirect to setup when `system_settings` is empty |
| Department management | Admin settings UI | CRUD outside the setup wizard |

---

## 9. Estimated Monthly Cost (NZD)

### 9.1 Prototype / Staging

| Service | Tier | Monthly |
|---------|------|---------|
| App Service | B1 (1 core, 1.75 GB) | $22 |
| PostgreSQL Flexible | Burstable B1ms (1 vCore, 2 GB) + 32 GB storage | $25 |
| Blob Storage | Hot, ~5 GB | $2 |
| Azure OpenAI | GPT-4o, ~200K tokens/month | $10–30 |
| Document Intelligence | ~200 pages/month | $6 |
| Key Vault | Standard, ~500 operations | $1 |
| Container Registry | Basic | $8 |
| Service Bus | Standard | $15 |
| **Total** | | **$89–109** |

### 9.2 Production (estimated, when scaling up)

| Service | Tier | Monthly |
|---------|------|---------|
| App Service | S1 (1 core, 1.75 GB) + 2 instances | $110 |
| PostgreSQL Flexible | General Purpose D2s (2 vCore, 8 GB) + 128 GB | $180 |
| Blob Storage | Hot, ~50 GB | $5 |
| Azure OpenAI | GPT-4o, ~2M tokens/month | $60–100 |
| Document Intelligence | ~5,000 pages/month | $75 |
| Key Vault | Standard | $1 |
| Container Registry | Basic | $8 |
| Service Bus | Standard | $15 |
| Application Insights | ~5 GB logs/month | $15 |
| **Total** | | **$469–509** |

---

## 10. Security Architecture

### 10.1 Network

| Path | Security |
|------|----------|
| Browser → App Service | HTTPS (TLS 1.2+), managed certificate or custom cert |
| App Service → PostgreSQL | SSL required (`?sslmode=require` in connection string) |
| App Service → Blob Storage | HTTPS, authenticated via storage account key from Key Vault |
| App Service → Azure OpenAI | HTTPS, authenticated via API key from Key Vault |
| App Service → Document Intelligence | HTTPS, authenticated via API key from Key Vault |
| App Service → Key Vault | Managed identity (no credentials needed) |

### 10.2 Identity & Access

| Principal | Access |
|-----------|--------|
| App Service managed identity | Key Vault Secrets User, ACR Pull |
| GitHub Actions service principal | ACR Push, App Service Contributor |
| NPDC Azure AD users | Application sign-in (via app registration) |
| DataSing admin | Resource group Owner (for infrastructure management) |

### 10.3 Data Protection

| Data | At rest | In transit |
|------|---------|-----------|
| Database | Azure-managed encryption (AES-256) | SSL/TLS |
| Blob Storage | Azure-managed encryption (AES-256) | HTTPS |
| Secrets | Key Vault HSM-backed encryption | HTTPS |
| Session tokens | Signed JWT (AUTH_SECRET via Key Vault) | httpOnly Secure cookie |

### 10.4 Production Hardening (Before Go-Live)

These are not needed for prototype deployment but should be completed before NPDC production.

**Priority 1 — Network isolation (implement first):**

- [ ] **Enable VNet integration with private endpoints** — This is the single highest-priority hardening item. App Service, PostgreSQL, Blob Storage, Service Bus, and Key Vault should all communicate over private endpoints within a VNet. Public access to PostgreSQL and Service Bus should be disabled entirely. For the NPDC bid, VNet integration signals enterprise-grade security posture and is a strong differentiator — NPDC's technical requirements explicitly call for encrypted communications and network security controls.

**Priority 2 — Monitoring & detection:**

- [ ] Enable Application Insights with Log Analytics workspace
- [ ] Enable diagnostic settings on all services → Log Analytics
- [ ] Enable Azure Defender for PostgreSQL
- [ ] Enable PostgreSQL audit logging

**Priority 3 — Resilience:**

- [ ] Configure geo-redundant backup for PostgreSQL
- [ ] Set up backup verification and restore testing
- [ ] Configure Azure Front Door with WAF rules

**Priority 4 — Compliance tightening:**

- [ ] Review and restrict CORS origins
- [ ] Set minimum TLS version to 1.2 on all services

---

## 11. Resource Naming Convention

All resources in a single resource group: `rg-veil-{environment}`

| Resource | Name |
|----------|------|
| Resource Group | `rg-veil-prototype` |
| App Service Plan | `asp-veil-prototype` |
| App Service | `app-veil-prototype` |
| PostgreSQL Server | `psql-veil-prototype` |
| PostgreSQL Database | `veil` |
| Storage Account | `stveilprototype` (no hyphens, globally unique) |
| Key Vault | `kv-veil-prototype` |
| Container Registry | `acrveilprototype` (no hyphens, globally unique) |
| Service Bus Namespace | `sb-veil-prototype` |
| Azure AD App Registration | `Veil - Prototype` (display name in Entra ID) |

Production equivalents use `-prod` suffix (e.g., `rg-veil-prod`, `app-veil-prod`).

---

## 12. Current Deployment Status

**Live URL:** https://app-veil-prototype.azurewebsites.net

**Subscription:** `clarivus_veil` (`c44bfeca-7446-4802-8ebe-d33207f5f786`)

**Region:** `australiaeast`

**Resource Group:** `rg-veil-prototype`

### Provisioned Resources

| Resource | Name | Status |
|----------|------|--------|
| App Service Plan | `asp-veil-prototype` (Linux B1) | Running |
| App Service | `app-veil-prototype` | Running, custom Docker container |
| Container Registry | `acrveilprototype` (Basic, admin-enabled) | Image: `veil-prototype:latest` |
| PostgreSQL Flexible Server | `psql-veil-prototype` (Burstable B1ms, v16) | Running, 10 migrations applied |
| PostgreSQL Database | `veil` | Empty (clean, no seed data) |
| Storage Account | `stveilprototype` (Standard LRS, Hot) | `documents` container created |
| Key Vault | `kv-veil-prototype` (Standard, RBAC) | 6 secrets stored |
| Service Bus | `sb-veil-prototype` (Standard) | `document-processing` queue created |

### Identity & Access

| Principal | Role assignments |
|-----------|-----------------|
| App Service managed identity (`cf0d3a4f-d8b5-4188-8b42-71571c44c2ab`) | Key Vault Secrets User, AcrPull |

### What's Working

- Login page renders at `/login` with credentials auth
- Full application accessible after sign-in
- Database connected via Key Vault-referenced connection string
- Azure OpenAI and Document Intelligence keys resolved from Key Vault
- Prisma schema matches deployed PostgreSQL

### Not Yet Working in Azure

- **File uploads** — using local filesystem storage (ephemeral in container). Need `BlobStorageProvider` for persistence.
- **Job queue** — using in-process `globalThis` queue. Need Service Bus integration for durability.
- **Azure AD authentication** — app registration not yet created. Using credentials auth only.
- **GitHub Actions CI/CD** — deployments are manual via `az acr build`.
