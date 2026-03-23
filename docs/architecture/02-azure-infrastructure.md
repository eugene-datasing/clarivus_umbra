# Azure Infrastructure Architecture

## Document Control
- **Version:** 1.0
- **Last Updated:** 2026-03-23
- **Status:** Active
- **Owner:** DataSing Technical Team

---

## 1. Resource Inventory

### Core Resources

| Resource Type | Resource Name | SKU/Tier | Configuration | Purpose |
|--------------|---------------|----------|---------------|---------|
| Resource Group | `rg-veil-prototype` | N/A | Region: australiaeast | Container for all Veil resources |
| App Service Plan | `asp-veil-prototype` | B1 (Basic) | 1 vCPU, 1.75 GB RAM, Linux | Hosting compute for web application |
| App Service | `app-veil-prototype` | B1 (via Plan) | Custom Docker container, port 3000 | Next.js web application |
| PostgreSQL Flexible Server | `psql-veil-prototype` | Burstable B1ms | 1 vCore, 2 GB RAM, 32 GB storage, PostgreSQL 16 | Primary database |
| Storage Account | `stveilprototype` | Standard GRS v2 | Hot tier, LRS replication | Document storage |
| Blob Container | `documents` | N/A | Within stveilprototype | Document file storage |
| Key Vault | `kv-veil-prototype` | Standard | RBAC access model, soft-delete enabled | Secrets management |
| Container Registry | `acrveilprototype` | Basic | 10 GB storage, 10 webhooks | Docker image storage |
| Service Bus Namespace | `sb-veil-prototype` | Standard | 1,000 messaging operations | Async processing queue |
| Service Bus Queue | `document-processing` | N/A | Within sb-veil-prototype | Document processing tasks |

### Shared Azure AI Services

| Service | Endpoint | Deployment/Model | Region | Usage |
|---------|----------|------------------|--------|-------|
| Azure OpenAI | Shared endpoint | GPT-4o deployment | australiaeast | AI-powered redaction detection |
| Azure Document Intelligence | Shared endpoint | prebuilt-read model | australiaeast | OCR and document parsing |

### Region Strategy
- **Primary Region:** australiaeast (Sydney)
- **Rationale:** Data sovereignty (Australian data residency), proximity to NZ, Azure OpenAI availability
- **Future:** Consider australiasoutheast (Melbourne) for DR

---

## 2. Network Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Internet / Users                            │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ HTTPS (TLS 1.2+)
                                 │ Managed SSL Certificate
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Azure App Service                                 │
│                  app-veil-prototype.azurewebsites.net               │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │ Next.js Application Container (port 3000)                   │   │
│  │ - Node.js 20 runtime                                        │   │
│  │ - Managed Identity: cf0d3a4f-d8b5-4188-8b42-71571c44c2ab  │   │
│  └────────────────────────────────────────────────────────────┘   │
└──┬────────┬────────┬────────┬────────┬──────────────────────────────┘
   │        │        │        │        │
   │        │        │        │        └─────────────────┐
   │        │        │        │                          │
   │        │        │        └─────────┐                │
   │        │        │                  │                │
   │        │        └────────┐         │                │
   │        │                 │         │                │
   │        │                 │         │                │
   ▼        ▼                 ▼         ▼                ▼
┌──────┐ ┌──────┐  ┌─────────────┐ ┌─────────┐ ┌──────────────┐
│ Key  │ │ Blob │  │ PostgreSQL  │ │ Azure   │ │   Document   │
│Vault │ │Storage│ │  Flexible   │ │ OpenAI  │ │ Intelligence │
│      │ │      │  │   Server    │ │         │ │              │
└──────┘ └──────┘  └─────────────┘ └─────────┘ └──────────────┘
   │        │              │              │              │
   │        │              │              │              │
   │        │              │              │              │
RBAC   Storage Key   SSL/TLS          API Key        API Key
Auth   (rotated)     (sslmode=       (rotated)      (rotated)
                      require)

┌─────────────────────────────────────────────────────────────────────┐
│                        Azure AD / Entra ID                           │
│                                                                      │
│  User Authentication: OIDC / OAuth 2.0                              │
│  → App Service /.auth/login/aad                                     │
└─────────────────────────────────────────────────────────────────────┘

NOTES:
- All connections use TLS 1.2 or higher
- No VNet integration in prototype (public endpoints only)
- Production hardening requires private endpoints + VNet
- Managed Identity used for Key Vault (passwordless)
- Database SSL enforced (sslmode=require in connection string)
```

### Current Security Posture
- **Authentication:** Azure AD OIDC via App Service Easy Auth
- **Network:** Public endpoints with TLS encryption
- **Access Control:** RBAC for Key Vault, firewall rules on PostgreSQL
- **Secrets:** All credentials stored in Key Vault, referenced via @Microsoft.KeyVault syntax

### Production Network Recommendations
1. **VNet Integration:** Deploy App Service into Azure VNet
2. **Private Endpoints:** PostgreSQL, Blob Storage, Key Vault
3. **Network Security Groups:** Restrict traffic flows
4. **Azure Front Door:** Global load balancing + WAF
5. **DDoS Protection:** Standard tier for VNet

---

## 3. Compute Architecture

### Docker Container Build

The application uses a multi-stage Docker build optimized for size and security:

```dockerfile
# Stage 1: Dependencies (node_modules)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Build (compile Next.js + Prisma)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 3: Runner (production runtime)
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache python3 py3-pip gcc g++ musl-dev
RUN pip3 install --break-system-packages PyMuPDF
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

### Build Characteristics
- **Base Image:** `node:20-alpine` (minimal attack surface)
- **Multi-stage:** Separates build dependencies from runtime
- **Non-root User:** Runs as `nextjs:nodejs` (UID 1001, GID 1001)
- **Standalone Mode:** Next.js standalone output (self-contained)
- **PyMuPDF:** Required for PDF manipulation operations
- **Port:** 3000 (mapped by App Service)

### App Service Configuration

| Setting | Value | Purpose |
|---------|-------|---------|
| Runtime | Custom Docker Container | Flexible containerized deployment |
| Container Registry | acrveilprototype.azurecr.io | Private registry for images |
| Image Tag | `veil-prototype:latest` | Container image reference |
| Port | 3000 | Next.js default port |
| Startup Command | `node server.js` | Entrypoint for standalone build |
| Health Check Path | `/api/health` | Liveness probe |
| Health Check Interval | 30 seconds | Monitoring frequency |
| Always On | Enabled | Prevents cold starts |
| ARR Affinity | Disabled | Stateless application |

### Health Monitoring

The application exposes a health check endpoint at `/api/health`:

```typescript
Response format:
{
  status: "healthy" | "degraded" | "unhealthy",
  timestamp: ISO8601,
  services: {
    database: "operational" | "error",
    azureOpenAI: "operational" | "degraded" | "error",
    documentIntelligence: "operational" | "degraded" | "error",
    storage: "operational" | "error"
  }
}
```

- **HTTP 200:** Status is "healthy"
- **HTTP 503:** Status is "degraded" or "unhealthy"
- **Circuit Breaker Integration:** Reports "degraded" when circuits are open

---

## 4. Database Architecture

### PostgreSQL Configuration

| Component | Specification |
|-----------|---------------|
| Server Name | `psql-veil-prototype.postgres.database.azure.com` |
| Version | PostgreSQL 16 |
| Compute Tier | Burstable |
| SKU | B1ms (1 vCore, 2 GB RAM) |
| Storage | 32 GB (auto-grow enabled) |
| Backup Retention | 7 days |
| Geo-Redundant Backup | Disabled (prototype) |
| High Availability | Disabled (prototype) |
| SSL Mode | Required (sslmode=require) |
| Connection Limit | 50 connections |

### ORM and Schema Management

- **ORM:** Prisma v7 with `@prisma/adapter-pg`
- **Driver:** `pg` (PostgreSQL native driver)
- **Connection Pooling:** Managed by Prisma (default: 10 connections)
- **Migrations:** 17+ migrations tracked in `prisma/migrations/`
- **Schema Location:** `/prisma/schema.prisma`

### Database Models (18 models)

```
Core Entities:
- User (authentication and profile)
- Session (user sessions)
- Organization (tenant structure)
- Case (LGOIMA request containers)

Document Management:
- Document (ingested files)
- DocumentMetadata (key-value metadata)
- DocumentPage (page-level content)
- Redaction (redaction instances)

Workflow:
- ReviewTask (assigned review work)
- ReviewComment (collaboration)
- ReviewDecision (approve/reject/modify)
- AuditLog (immutable audit trail)

Compliance:
- WithholdingGround (LGOIMA s6, s7, s17)
- WithholdingSchedule (export schedules)

Exports:
- Export (release packages)
- ExportDocument (documents in exports)

Configuration:
- RedactionRule (custom patterns)
- NotificationPreference (user settings)
```

### Connection String Management

```bash
# Stored in Key Vault as "db-connection-string"
postgresql://user:password@psql-veil-prototype.postgres.database.azure.com:5432/veil?sslmode=require

# Referenced in App Service via Key Vault reference:
DATABASE_URL=@Microsoft.KeyVault(VaultName=kv-veil-prototype;SecretName=db-connection-string)
```

### Local Development

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - "5434:5432"
    environment:
      POSTGRES_USER: veil
      POSTGRES_PASSWORD: veil_dev_password
      POSTGRES_DB: veil
    volumes:
      - postgres_data:/var/lib/postgresql/data
```

- **Local Connection:** `postgresql://veil:veil_dev_password@localhost:5434/veil`
- **Port 5434:** Avoids conflict with other local PostgreSQL instances
- **Volume Persistence:** Data survives container restarts

---

## 5. Storage Architecture

### Azure Blob Storage Configuration

| Component | Specification |
|-----------|---------------|
| Storage Account | `stveilprototype` |
| Account Kind | StorageV2 (general-purpose v2) |
| Performance | Standard |
| Replication | LRS (Locally Redundant Storage) |
| Access Tier | Hot |
| Blob Container | `documents` |
| Public Access | Private (no anonymous access) |
| Versioning | Disabled (prototype) |
| Soft Delete | Disabled (prototype) |

### Storage Provider Abstraction

The application uses a `StorageProvider` interface to allow swapping between local filesystem and Azure Blob Storage:

```typescript
interface StorageProvider {
  uploadFile(caseId: string, docId: string, file: Buffer, filename: string): Promise<string>
  getFile(path: string): Promise<Buffer>
  deleteFile(path: string): Promise<void>
  listFiles(caseId: string, docId: string): Promise<string[]>
}

Implementations:
- LocalStorageProvider (dev: ./uploads/{caseId}/{docId}/)
- AzureBlobStorageProvider (prod: documents container)
```

### File Path Structure

```
Blob Container: documents/
└── {caseId}/
    └── {documentId}/
        ├── original.{ext}          # Preserved original file
        ├── processed.pdf           # OCR-processed version
        ├── redacted-draft.pdf      # Working redaction draft
        └── redacted-final.pdf      # Final release-ready document
```

### File Serving

- **Endpoint:** `/api/files/[...path]`
- **Authentication:** Required (session-based)
- **Authorization:** Case-level access control
- **MIME Type Detection:** Based on file extension
- **Streaming:** Large files streamed efficiently
- **Security:** Path traversal protection, no directory listing

### Storage Access

- **Prototype:** Storage account key (rotated quarterly)
- **Production:** Managed Identity + RBAC (recommended)
- **Connection String:** Stored in Key Vault as `storage-account-key`

```bash
AZURE_STORAGE_CONNECTION_STRING=@Microsoft.KeyVault(VaultName=kv-veil-prototype;SecretName=storage-account-key)
```

### Lifecycle Management

| File Type | Retention Policy | Tier Transition |
|-----------|------------------|-----------------|
| Original Documents | Permanent | Hot (prototype) → Cool (90 days) → Archive (1 year) |
| Processed PDFs | 7 years | Hot → Cool (30 days) → Archive (1 year) |
| Draft Redactions | Until case closed + 90 days | Hot |
| Final Exports | 7 years (Public Records Act) | Hot → Cool (90 days) |
| Audit Logs | Permanent | Hot → Cool (90 days) → Archive (2 years) |

---

## 6. Secrets Management

### Azure Key Vault Configuration

| Component | Specification |
|-----------|---------------|
| Vault Name | `kv-veil-prototype` |
| Pricing Tier | Standard |
| Access Policy Model | RBAC (Azure role-based access control) |
| Soft Delete | Enabled (90-day retention) |
| Purge Protection | Disabled (prototype) |
| Public Network Access | Enabled |
| Firewall | Disabled (prototype) |

### Managed Identity

- **Principal ID:** `cf0d3a4f-d8b5-4188-8b42-71571c44c2ab`
- **Type:** System-assigned
- **Assigned To:** `app-veil-prototype`
- **Key Vault Role:** Key Vault Secrets User

### Secrets Inventory

| Secret Name | Purpose | Rotation Frequency | Referenced By |
|-------------|---------|-------------------|---------------|
| `db-connection-string` | PostgreSQL connection | 90 days | DATABASE_URL |
| `auth-secret` | NextAuth.js session encryption | 180 days | NEXTAUTH_SECRET |
| `azure-openai-key` | Azure OpenAI API authentication | 90 days | AZURE_OPENAI_API_KEY |
| `azure-di-key` | Document Intelligence API auth | 90 days | AZURE_DI_API_KEY |
| `storage-account-key` | Blob Storage access | 90 days | AZURE_STORAGE_CONNECTION_STRING |
| `service-bus-connection-string` | Service Bus queue access | 90 days | SERVICE_BUS_CONNECTION_STRING |

### App Service Configuration

Secrets are referenced using Key Vault reference syntax:

```bash
# Application Settings in App Service

# Secrets (Key Vault references)
DATABASE_URL=@Microsoft.KeyVault(VaultName=kv-veil-prototype;SecretName=db-connection-string)
NEXTAUTH_SECRET=@Microsoft.KeyVault(VaultName=kv-veil-prototype;SecretName=auth-secret)
AZURE_OPENAI_API_KEY=@Microsoft.KeyVault(VaultName=kv-veil-prototype;SecretName=azure-openai-key)
AZURE_DI_API_KEY=@Microsoft.KeyVault(VaultName=kv-veil-prototype;SecretName=azure-di-key)
AZURE_STORAGE_CONNECTION_STRING=@Microsoft.KeyVault(VaultName=kv-veil-prototype;SecretName=storage-account-key)
SERVICE_BUS_CONNECTION_STRING=@Microsoft.KeyVault(VaultName=kv-veil-prototype;SecretName=service-bus-connection-string)

# Non-secret configuration (direct values)
AZURE_OPENAI_ENDPOINT=https://australiaeast.api.cognitive.microsoft.com/
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_DI_ENDPOINT=https://australiaeast.api.cognitive.microsoft.com/
AZURE_STORAGE_CONTAINER_NAME=documents
NODE_ENV=production
NEXTAUTH_URL=https://app-veil-prototype.azurewebsites.net
```

### Key Vault Access Flow

```
1. App Service starts
2. Managed Identity authenticates to Azure AD
3. Azure AD issues access token
4. App Service requests secrets from Key Vault
5. Key Vault validates token + RBAC permissions
6. Secrets returned and cached by App Service
7. Application reads secrets from environment variables
```

### Secret Rotation Procedure

1. Generate new secret value
2. Add new secret version to Key Vault
3. App Service automatically picks up new version (within 24 hours)
4. Verify application functionality
5. Rotate credentials in source service (PostgreSQL, Storage, etc.)
6. Update Key Vault secret with new value
7. Monitor for errors

---

## 7. AI Services Architecture

### Azure OpenAI Service

| Component | Configuration |
|-----------|---------------|
| Endpoint | `https://australiaeast.api.cognitive.microsoft.com/` |
| Deployment | `gpt-4o` |
| Model Version | Latest stable |
| Temperature | 0.1 (low creativity, high consistency) |
| Max Tokens | 4096 |
| Top P | 0.95 |
| Frequency Penalty | 0.0 |
| Presence Penalty | 0.0 |

#### Processing Strategy

```
Document Processing:
1. Document split into pages
2. Pages batched in groups of 3
3. Each batch sent to GPT-4o with system prompt
4. Responses parsed for redaction suggestions
5. Confidence scoring applied
6. Results aggregated across batches

System Prompt Structure:
- Role: LGOIMA compliance expert
- Task: Identify information requiring redaction
- Output Format: JSON with confidence scores
- Grounding: LGOIMA s6, s7, s17 definitions
```

#### Rate Limits and Throttling

- **Tokens per Minute (TPM):** 10,000 (shared endpoint)
- **Requests per Minute (RPM):** 60
- **Handling:** Circuit breaker + exponential backoff
- **429 Responses:** Retry after delay specified in Retry-After header

### Azure Document Intelligence

| Component | Configuration |
|-----------|---------------|
| Endpoint | `https://australiaeast.api.cognitive.microsoft.com/` |
| Model | `prebuilt-read` |
| Version | Latest (2024-11-30) |
| Features | OCR, layout analysis, handwriting recognition |
| Languages | English (primary), multi-language support |

#### Processing Capabilities

```
Input Formats:
- PDF (scanned and digital)
- TIFF (multi-page)
- JPEG, PNG, BMP
- Office documents (via conversion)

Output:
- Page-level text extraction
- Bounding box coordinates
- Confidence scores per word
- Reading order
- Table detection (disabled in prototype)
```

#### Rate Limits

- **Requests per Minute:** 15
- **Concurrent Requests:** 5
- **File Size Limit:** 500 MB
- **Page Limit:** 2,000 pages per request

### Circuit Breaker Implementation

Both AI services are wrapped with a circuit breaker pattern:

```typescript
Circuit States:
- CLOSED: Normal operation, requests flow through
- OPEN: Threshold exceeded, requests fail fast
- HALF_OPEN: Testing if service recovered

Thresholds:
- Failure Count: 5 consecutive failures → OPEN
- Timeout: 60 seconds in OPEN state → HALF_OPEN
- Success Count: 1 successful request in HALF_OPEN → CLOSED

Configuration:
- openThreshold: 5 failures
- closeTimeout: 60000 ms (60 seconds)
- halfOpenMaxAttempts: 1 probe request
```

### Retry Logic

Retry mechanism runs INSIDE circuit breaker:

```typescript
Retry Configuration:
- Max Attempts: 3
- Base Delay: 1000 ms
- Max Delay: 30000 ms
- Backoff: Exponential with jitter
- Jitter: ±20% randomization

Retriable Errors:
- Network errors (ECONNRESET, ETIMEDOUT, ENOTFOUND)
- HTTP 429 (Too Many Requests)
- HTTP 500, 502, 503, 504 (Server errors)
- Azure throttling errors

Non-Retriable Errors:
- HTTP 400 (Bad Request)
- HTTP 401 (Unauthorized)
- HTTP 403 (Forbidden)
- HTTP 404 (Not Found)
- HTTP 422 (Unprocessable Entity)
```

### Error Handling Flow

```
Request → Circuit Breaker (CLOSED) → Retry Handler → Azure Service
                ↓ (if 5 failures)
           Circuit OPEN
                ↓ (fail fast for 60s)
           Circuit HALF_OPEN
                ↓ (1 probe request)
           Success → CLOSED | Failure → OPEN (60s more)
```

---

## 8. Resilience Patterns

### Circuit Breaker Pattern

The application implements a three-state circuit breaker for all external service calls:

#### State Machine

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ┌──────────┐  5 consecutive   ┌──────────┐  60s timeout      │
│  │          │  failures         │          │  elapsed          │
│  │  CLOSED  ├──────────────────►│   OPEN   ├────────────┐      │
│  │          │                   │          │            │      │
│  └────▲─────┘                   └──────────┘            │      │
│       │                                                 │      │
│       │ 1 successful                                    ▼      │
│       │ probe request                           ┌──────────┐   │
│       │                                         │          │   │
│       └─────────────────────────────────────────┤HALF_OPEN │   │
│                                                 │          │   │
│                   Failure on probe ─────────────┤          │   │
│                   (returns to OPEN)             └──────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Configuration by Service

| Service | Open Threshold | Close Timeout | Half-Open Attempts |
|---------|----------------|---------------|--------------------|
| Azure OpenAI | 5 failures | 60s | 1 probe |
| Document Intelligence | 5 failures | 60s | 1 probe |
| PostgreSQL | 3 failures | 30s | 1 probe |
| Blob Storage | 3 failures | 30s | 1 probe |

#### Failure Detection

A failure is counted when:
- Request times out (30s default)
- HTTP 5xx response received
- Network error occurs
- Service returns rate limit error (429) and retries exhausted

A failure is NOT counted when:
- Request succeeds (2xx, 3xx)
- Client error occurs (4xx except 429)
- Request is cancelled by application

### Retry Pattern

Exponential backoff with jitter for transient failures:

```typescript
Attempt 1: Immediate
Attempt 2: 1000ms + jitter (800-1200ms)
Attempt 3: 2000ms + jitter (1600-2400ms)
Attempt 4: 4000ms + jitter (3200-4800ms)
...
Max delay: 30000ms
```

#### Retry Decision Tree

```
Error Occurs
    │
    ├─ Network Error? ─────────────────► RETRY
    ├─ HTTP 429 (Rate Limit)? ────────► RETRY (with Retry-After header)
    ├─ HTTP 500, 502, 503, 504? ──────► RETRY
    ├─ Azure Throttling Error? ────────► RETRY
    ├─ HTTP 400, 401, 403, 404? ──────► FAIL (no retry)
    └─ Other Error? ───────────────────► FAIL (no retry)
```

#### Retry Limits

- **Maximum Attempts:** 3 (initial + 2 retries)
- **Total Timeout:** 90 seconds across all attempts
- **Retry Budget:** If 50% of requests are retrying, stop retrying new requests (protect downstream)

### Health Check Integration

The `/api/health` endpoint reports service status based on circuit breaker state:

```typescript
{
  status: "healthy" | "degraded" | "unhealthy",
  services: {
    azureOpenAI: {
      status: "operational",      // CLOSED
      circuitState: "CLOSED"
    },
    documentIntelligence: {
      status: "degraded",          // HALF_OPEN
      circuitState: "HALF_OPEN"
    },
    database: {
      status: "operational",       // CLOSED
      circuitState: "CLOSED"
    }
  }
}

Overall Status Rules:
- "healthy": All circuits CLOSED
- "degraded": One or more circuits HALF_OPEN or OPEN (service continues with reduced capacity)
- "unhealthy": Critical service (database) circuit OPEN
```

### Fallback Strategies

| Service | Primary | Fallback | Degraded Mode |
|---------|---------|----------|---------------|
| Azure OpenAI | GPT-4o | None | Manual redaction only, AI disabled |
| Document Intelligence | prebuilt-read | None | Upload text-based PDFs only |
| PostgreSQL | Azure Flexible Server | None | Service unavailable |
| Blob Storage | Azure Blob | Local filesystem (dev only) | New uploads disabled |

### Timeout Configuration

| Operation Type | Timeout | Rationale |
|----------------|---------|-----------|
| Database Query | 10s | Complex queries with joins |
| Azure OpenAI Request | 60s | Large context windows |
| Document Intelligence | 120s | OCR processing time |
| Blob Storage Upload | 300s | Large file transfers |
| Blob Storage Download | 60s | Streaming downloads |
| Health Check | 5s | Fast failure detection |
| HTTP API Calls | 30s | Standard REST operations |

---

## 9. Scaling Path

### Current State (Prototype)

| Resource | SKU | Monthly Cost (NZD) | Limits |
|----------|-----|-------------------|--------|
| App Service Plan (B1) | 1 vCPU, 1.75 GB RAM | $22 | 10 concurrent requests, no auto-scale |
| PostgreSQL (B1ms) | 1 vCore, 2 GB RAM, 32 GB | $25 | 50 connections, limited IOPS |
| Blob Storage (Hot, LRS) | Standard, Hot tier | $0.03/GB + operations | Single region, no redundancy |
| Key Vault (Standard) | Standard tier | $0.03/10k operations | No FIPS 140-2 Level 2 HSM |
| Container Registry (Basic) | 10 GB, 10 webhooks | $8 | No geo-replication |
| Service Bus (Standard) | 1k messaging operations | $15 | No topics, limited throughput |
| **Total (without AI services)** | | **~$80/month** | Single instance, no HA |

### Next Tier (Staging / Light Production)

| Resource | SKU | Monthly Cost (NZD) | Improvements |
|----------|-----|-------------------|--------------|
| App Service Plan (S1) | 1 vCPU, 1.75 GB RAM | $55 | Auto-scale (1-3 instances), staging slots |
| PostgreSQL (D2s v3) | 2 vCores, 8 GB RAM, 128 GB | $130 | 100 connections, 3,200 IOPS |
| Blob Storage (Hot+Cool, LRS) | Standard, tiered | $0.03/GB + $0.01/GB cool | Lifecycle policies, versioning |
| Key Vault (Standard) | Standard tier | $0.03/10k operations | Same |
| Container Registry (Standard) | 100 GB, 100 webhooks | $30 | Geo-replication, vulnerability scanning |
| Service Bus (Standard) | 1k messaging operations | $15 | Same (sufficient for staging) |
| **Total (without AI services)** | | **~$240/month** | Auto-scale, better DB performance |

### Production Tier (Full Production)

| Resource | SKU | Monthly Cost (NZD) | Production Features |
|----------|-----|-------------------|---------------------|
| App Service Plan (P1v3) | 2 vCPUs, 8 GB RAM | $180 | Auto-scale (2-10 instances), reserved instances |
| PostgreSQL (D4s v3 + HA) | 4 vCores, 16 GB RAM, 256 GB | $260 + $130 (HA) | Zone-redundant HA, 6,400 IOPS, geo-backup |
| Blob Storage (Hot+Cool+Archive, ZRS) | Zone-redundant | $0.05/GB + tiers | Zone redundancy, immutable storage, versioning |
| Key Vault (Premium) | HSM-backed | $190 | FIPS 140-2 Level 2 HSM keys |
| Container Registry (Premium) | 500 GB, unlimited webhooks | $75 | Multi-region replication, content trust |
| Service Bus (Premium) | Dedicated capacity | $300 | Message partitioning, large messages (1 MB) |
| Azure Front Door (Standard) | CDN + WAF | $100 | Global load balancing, DDoS protection, WAF |
| Application Insights | Standard | $35 | Full telemetry, 5 GB/month |
| Log Analytics Workspace | 10 GB/month | $35 | Centralized logging, 90-day retention |
| **Total (without AI services)** | | **~$1,440/month** | Full HA, multi-region, production SLAs |

### AI Services Scaling

Azure OpenAI and Document Intelligence are billed separately based on usage:

| Service | Prototype | Staging | Production |
|---------|-----------|---------|------------|
| Azure OpenAI (GPT-4o) | ~$0.01/1k input tokens, ~$0.03/1k output tokens | Same (shared quota) | Dedicated deployment (provisioned throughput: ~$500/month for 10k TPM) |
| Document Intelligence | ~$1.50/1k pages | Same | Same (volume discounts at >1M pages) |

**Estimated Monthly AI Costs:**
- Prototype (100 documents, 500 pages): ~$50/month
- Staging (500 documents, 2,500 pages): ~$200/month
- Production (5,000 documents, 25,000 pages): ~$1,000/month

### Scaling Triggers

| Metric | Current Limit | Scale Trigger | Next Tier |
|--------|---------------|---------------|-----------|
| CPU Utilization | 85% for 10 min | Sustained >70% | Scale out (+1 instance) |
| Memory Utilization | 90% | Sustained >80% | Scale up (next SKU) |
| Database Connections | 50 | >40 connections | Scale up (D4s) |
| Database IOPS | ~640 (B1ms) | >500 IOPS | Scale up (D2s: 3,200 IOPS) |
| Storage Operations | No limit | >10k ops/sec | Enable CDN |
| Document Queue Depth | In-memory | >100 queued | Move to Service Bus queue |
| Response Time | <2s P95 | >5s P95 | Scale out or optimize queries |

### Performance Benchmarks

| Tier | Documents/Hour | Concurrent Users | P95 Response Time |
|------|----------------|------------------|-------------------|
| Prototype (B1) | ~50 (OCR + AI) | 5-10 | <5s (degraded under load) |
| Staging (S1) | ~150 (with auto-scale) | 20-30 | <3s |
| Production (P1v3) | ~500 (with queue) | 100+ | <2s |

---

## 10. Production Hardening Roadmap

### Priority 1: Network Isolation (Highest Security Impact)

**Current State:** All resources use public endpoints with TLS encryption.

**Target State:** Private network with VNet integration and private endpoints.

| Component | Hardening Action | Configuration |
|-----------|------------------|---------------|
| VNet | Create Azure Virtual Network | Address space: 10.0.0.0/16, Subnets: Web (10.0.1.0/24), Data (10.0.2.0/24), Integration (10.0.3.0/24) |
| App Service | Enable VNet Integration | Integrate into Integration subnet (10.0.3.0/24) |
| PostgreSQL | Enable Private Endpoint | Disable public access, create private endpoint in Data subnet |
| Blob Storage | Enable Private Endpoint | Disable public access, create private endpoint in Data subnet |
| Key Vault | Enable Private Endpoint | Disable public access, create private endpoint in Integration subnet |
| Network Security Groups | Apply NSGs to subnets | Web: Allow 443 inbound; Data: Allow only from Web/Integration subnets |
| Azure Firewall | Deploy Azure Firewall | Route egress traffic through firewall, restrict outbound to approved endpoints |

**Estimated Cost Impact:** +$100/month (VNet, Private Endpoints, NSGs)

---

### Priority 2: WAF and DDoS Protection

**Current State:** No web application firewall or DDoS protection.

**Target State:** Azure Front Door with WAF and DDoS Standard.

| Component | Hardening Action | Configuration |
|-----------|------------------|---------------|
| Azure Front Door | Deploy Front Door Standard | Origin: App Service, Caching: Enabled, Compression: Enabled |
| WAF Policy | Enable WAF with OWASP 3.2 ruleset | Mode: Prevention, Custom rules for rate limiting |
| DDoS Protection | Enable DDoS Standard on VNet | Always-on traffic monitoring, automatic mitigation |
| TLS Policy | Enforce TLS 1.2 minimum | Disable TLS 1.0/1.1, prefer TLS 1.3 |
| Custom Domain | Configure custom domain | veil.datasing.nz → Front Door → App Service |
| SSL Certificate | Azure-managed certificate | Auto-renewal, subject alternative names |

**Estimated Cost Impact:** +$100/month (Front Door Standard + WAF)

---

### Priority 3: Async Processing with Service Bus

**Current State:** Document processing runs in-process, blocking HTTP requests.

**Target State:** Async processing via Service Bus queue.

| Component | Hardening Action | Configuration |
|-----------|------------------|---------------|
| Service Bus Queue | Configure document-processing queue | Max delivery count: 5, Dead-letter on message expiration, Session enabled |
| Queue Consumer | Deploy background worker | Separate App Service (B1) or Azure Function, processes queue messages |
| Retry Policy | Implement exponential backoff | Base delay: 5s, Max delay: 5min, Max retries: 5 |
| Dead Letter Queue | Monitor DLQ for failures | Alert on DLQ message count >10 |
| Scaling | Auto-scale based on queue depth | Scale out when queue depth >50 messages |

**Estimated Cost Impact:** +$35/month (Background worker B1 + Service Bus operations)

---

### Priority 4: High Availability for Database

**Current State:** Single-instance PostgreSQL Flexible Server (no HA).

**Target State:** Zone-redundant high availability.

| Component | Hardening Action | Configuration |
|-----------|------------------|---------------|
| PostgreSQL HA | Enable zone-redundant HA | Standby in different availability zone, auto-failover |
| Backup | Configure geo-redundant backup | Backup retention: 35 days, Geo-restore enabled |
| Read Replica | Deploy read replica (optional) | Offload reporting queries, same region |
| Connection Pooling | Optimize Prisma connection pool | Pool size: 20, Connection timeout: 10s |
| Monitoring | Enable Query Store + Insights | Track slow queries, optimize indexes |

**Estimated Cost Impact:** +$130/month (HA replica) + $20/month (geo-backup)

---

### Priority 5: Observability and Monitoring

**Current State:** Basic App Service logging, no centralized monitoring.

**Target State:** Full observability with Application Insights and Log Analytics.

| Component | Hardening Action | Configuration |
|-----------|------------------|---------------|
| Application Insights | Enable App Insights | Instrumentation key → Key Vault, 5 GB/month included |
| Log Analytics Workspace | Create workspace | Retention: 90 days, Link to App Service, PostgreSQL, Storage |
| Diagnostic Settings | Enable diagnostic logs | App Service: HTTP logs, App logs, Metrics; PostgreSQL: Query logs, Slow query logs |
| Alerts | Configure alert rules | CPU >80% for 10 min, Memory >90%, 5xx errors >10/min, Circuit breaker OPEN |
| Dashboards | Create monitoring dashboard | Real-time metrics, SLA tracking, error rates |
| Distributed Tracing | Enable OpenTelemetry | Trace requests across services, identify bottlenecks |

**Estimated Cost Impact:** +$70/month (Application Insights + Log Analytics data ingestion)

---

### Priority 6: Compliance and Governance

**Current State:** Basic RBAC, no compliance auditing.

**Target State:** Full compliance posture for government clients.

| Component | Hardening Action | Configuration |
|-----------|------------------|---------------|
| Azure Policy | Apply policy assignments | Enforce encryption at rest, require tags, block public endpoints |
| Microsoft Defender for Cloud | Enable Defender for Cloud | Continuous security assessment, vulnerability scanning |
| Immutable Storage | Enable immutable blobs | WORM (Write Once Read Many) for audit logs and originals |
| Purge Protection | Enable on Key Vault | Prevent accidental secret deletion |
| Soft Delete | Enable on Storage Account | 30-day retention for deleted blobs |
| Managed Identity | Replace all API keys | Use managed identity for Azure services (OpenAI, DI, Storage) |
| Privileged Identity Management | Enable Azure AD PIM | Just-in-time admin access, approval workflows |

**Estimated Cost Impact:** +$50/month (Defender for Cloud)

---

### Priority 7: Data Residency and Sovereignty

**Current State:** All resources in australiaeast (Sydney).

**Target State:** Confirmed NZ data residency for NPDC requirements.

| Component | Hardening Action | Configuration |
|-----------|------------------|---------------|
| Region Assessment | Evaluate Azure NZ regions | Australia East (Sydney) vs. Australia Southeast (Melbourne) — no Azure regions in NZ |
| Contractual Commitment | Document data residency | All customer data stored in Australian regions, no cross-border transfers |
| Compliance Certification | Obtain certifications | ISO 27001, SOC 2 Type II, IRAP (AU government) |
| Data Classification | Implement data classification | PII, Commercially Sensitive, Legally Privileged labels |
| Geo-Restriction | Block non-ANZ access | Front Door geo-filtering, allow only AU/NZ IP ranges |

**Estimated Cost Impact:** $0 (policy/process changes)

---

### Summary Roadmap

| Priority | Hardening Area | Cost Impact | Security Improvement |
|----------|----------------|-------------|----------------------|
| 1 | VNet + Private Endpoints | +$100/month | High — eliminates public exposure |
| 2 | WAF + DDoS | +$100/month | High — protects against attacks |
| 3 | Service Bus Queue | +$35/month | Medium — async processing, resilience |
| 4 | Database HA | +$150/month | High — eliminates single point of failure |
| 5 | Observability | +$70/month | Medium — incident detection and response |
| 6 | Compliance Tools | +$50/month | Medium — governance and auditing |
| 7 | Data Residency | $0 | Medium — contractual compliance |
| **Total** | | **+$505/month** | **Production-ready security posture** |

**Total Production Cost:** $80 (current) + $505 (hardening) + $500 (scale up to P1v3/D4s) = **~$1,085/month** for hardened production environment.

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-23 | DataSing Technical Team | Initial architecture documentation |

---

## Related Documents

- `/docs/architecture/01-system-overview.md` — High-level system architecture
- `/docs/architecture/03-security-model.md` — Detailed security architecture
- `/docs/architecture/04-data-flow.md` — Data flow diagrams
- `/prisma/schema.prisma` — Database schema definition
- `/docker-compose.yml` — Local development infrastructure
