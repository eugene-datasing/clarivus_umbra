# Operations & Deployment Architecture

**Document:** 07-operations-deployment.md
**Product:** Veil — AI-Powered Document Redaction & LGOIMA Disclosure Platform
**Version:** 1.0
**Last Updated:** 2026-03-23

---

## Overview

This document describes the operational architecture, deployment strategy, CI/CD pipelines, monitoring, and disaster recovery procedures for Veil. The platform is designed for per-client isolated deployments on Azure infrastructure with comprehensive observability and automated operations.

---

## 1. Deployment Architecture

### Isolation Model

Veil uses **per-client isolated instances** rather than a multi-tenant architecture. Each client deployment consists of:

- Dedicated Azure App Service instance
- Dedicated Azure Database for PostgreSQL Flexible Server
- Shared Azure AI services (OpenAI, Document Intelligence) with tenant isolation via API keys
- Dedicated Blob Storage containers

**Rationale:** Public sector clients require complete data isolation, independent scaling, and dedicated resource guarantees. The cost delta is acceptable given the requirements.

### Container Architecture

Each client instance runs as a **Docker container on Azure App Service (Linux B1)**:

```dockerfile
# Multi-stage build optimized for production
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

# Install Python runtime for PyMuPDF (PDF processing)
RUN apk add --no-cache python3 py3-pip
RUN pip3 install --break-system-packages PyMuPDF

# Run as non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone build
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

USER nextjs

EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
```

**Key Features:**
- **Multi-stage build:** Minimizes final image size (~150 MB)
- **Stage 1 (deps):** Clean dependency installation via `npm ci`
- **Stage 2 (builder):** Prisma client generation + Next.js build
- **Stage 3 (runner):** Standalone Next.js + Python 3 + PyMuPDF for PDF processing
- **Non-root execution:** Container runs as user `nextjs:nodejs` (UID/GID 1001)
- **Network binding:** Port 3000, `HOSTNAME=0.0.0.0` for container networking

### Compute Resources

**Standard deployment (B1 tier):**
- 1 vCPU
- 1.75 GB RAM
- Linux container
- ~$21 NZD/month

**Scale-up path:** P1v2 (2 vCPU, 3.5 GB RAM) for high-volume clients processing 500+ documents/day.

---

## 2. CI/CD Pipeline

Three GitHub Actions workflows automate testing, building, and deployment.

### ci.yml (Continuous Integration)

Triggers: `push`, `pull_request` to any branch

```yaml
name: CI

on:
  push:
    branches: ['**']
  pull_request:
    branches: ['**']

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: veil_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/veil_test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx prisma generate
      - run: npx prisma migrate deploy
      - run: npm run test

  build:
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx prisma generate
      - run: npm run build
```

**Features:**
- **Job 1 (lint-and-typecheck):** TypeScript compilation check + ESLint
- **Job 2 (test):** PostgreSQL 16 service container, Vitest unit tests, Prisma migrations
- **Job 3 (build):** Production build validation (requires lint-and-typecheck)
- **Concurrency control:** Cancels in-progress runs per branch to save CI minutes

### docker.yml (Container Build & Push)

Triggers: `push` to `main`, tags matching `v*`

```yaml
name: Docker Build & Push

on:
  push:
    branches: [main]
    tags: ['v*']

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=ref,event=branch
            type=sha,prefix={{branch}}-
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

**Features:**
- **Registry:** GitHub Container Registry (`ghcr.io`)
- **Tagging strategy:**
  - Branch name (e.g., `main`)
  - Git SHA with branch prefix (e.g., `main-a1b2c3d`)
  - Semantic version from tags (e.g., `v1.2.3` → `1.2.3`, `1.2`, `1`)
  - `latest` tag on main branch
- **Layer caching:** GitHub Actions cache for faster rebuilds

### migrate.yml (Database Migrations)

Triggers: Manual workflow dispatch

```yaml
name: Database Migration

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        required: true
        type: choice
        options:
          - staging
          - production

jobs:
  migrate:
    runs-on: ubuntu-latest
    environment: ${{ github.event.inputs.environment }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx prisma generate
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      - run: npx prisma migrate status
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

**Features:**
- **Manual trigger:** Prevents accidental production migrations
- **Environment selection:** Staging or production with environment-specific secrets
- **Verification:** Runs `prisma migrate status` after deployment to confirm success

---

## 3. Client Provisioning

### Activation Code System

New deployments use a **secure activation code** for first-time setup:

**Code format:** `VEIL-XXXX-XXXX-XXXX` (12 alphanumeric characters, dash-separated)

**Generation:**
```typescript
// lib/activation/generate-code.ts
import crypto from 'crypto';
import bcrypt from 'bcrypt';

const bytes = crypto.randomBytes(9);
const code = `VEIL-${bytes.toString('base64url').substring(0, 12).toUpperCase()}`;
const hash = await bcrypt.hash(code, 12);
// Store hash in database, display code once to admin
```

**Validation:**
- Code shown once during provisioning
- Bcrypt hash stored in `OrgSettings.activationCode`
- Code expires after first use (activationUsedAt timestamp)
- 12-round bcrypt prevents brute force

### Provisioning Script

**`scripts/provision-client.sh`:**

```bash
#!/bin/bash
# Usage: ./provision-client.sh --slug npdc --org-name "New Plymouth District Council"

CLIENT_SLUG=$1
ORG_NAME=$2
REGION="Australia East"

# 1. Create Azure resources
az group create --name "rg-veil-${CLIENT_SLUG}" --location "$REGION"

az postgres flexible-server create \
  --resource-group "rg-veil-${CLIENT_SLUG}" \
  --name "psql-veil-${CLIENT_SLUG}" \
  --location "$REGION" \
  --admin-user veiladmin \
  --admin-password "$(openssl rand -base64 32)" \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --version 16

az appservice plan create \
  --resource-group "rg-veil-${CLIENT_SLUG}" \
  --name "plan-veil-${CLIENT_SLUG}" \
  --is-linux \
  --sku B1

az webapp create \
  --resource-group "rg-veil-${CLIENT_SLUG}" \
  --plan "plan-veil-${CLIENT_SLUG}" \
  --name "app-veil-${CLIENT_SLUG}" \
  --deployment-container-image-name ghcr.io/datasing/veil-prototype:latest

# 2. Generate activation code
ACTIVATION_CODE=$(node -e "console.log(require('./lib/activation/generate-code').generateActivationCode())")
echo "Activation Code: ${ACTIVATION_CODE}"
echo "Save this code - it will not be shown again."

# 3. Seed org settings
DATABASE_URL=$(az postgres flexible-server show-connection-string \
  --server-name "psql-veil-${CLIENT_SLUG}" \
  --database-name veil \
  --admin-user veiladmin \
  --admin-password "${DB_PASSWORD}" \
  --query connectionStrings.psql_cmd -o tsv)

npx prisma db seed -- --org-name "$ORG_NAME" --activation-code "$ACTIVATION_CODE"
```

**Provisioning steps:**
1. Create resource group, PostgreSQL server, App Service plan, Web App
2. Generate cryptographically secure activation code
3. Seed organization settings with activation hash
4. Configure environment variables and connection strings
5. Deploy latest container image

### Domain Setup

**Custom domain configuration:**
1. Client creates CNAME: `veil.clientdomain.nz` → `app-veil-{slug}.azurewebsites.net`
2. Azure App Service custom domain verification
3. Managed SSL certificate provisioning (Let's Encrypt via Azure)
4. Automatic renewal every 90 days

### Cost Per Client

**Isolated deployment:**
- App Service B1: $21 NZD/month
- PostgreSQL Burstable B1ms (32 GB): $62 NZD/month
- **Total: $83 NZD/month base**

**With AI usage:**
- GPT-4o: $0.30 per 100 documents (average)
- Document Intelligence: $0.001 per page
- **Total: $83-103 NZD/month** (light-moderate usage)

**Shared infrastructure (3+ clients):**
- Base: $211/month (Azure OpenAI, Document Intelligence, Key Vault, App Insights)
- Incremental per client: $21-41/month (App Service + storage delta)

---

## 4. Health Monitoring

### Health Check Endpoint

**GET /api/health**

Returns comprehensive health status:

```json
{
  "status": "healthy",
  "timestamp": "2026-03-23T12:34:56.789Z",
  "checks": {
    "app": {
      "status": "healthy",
      "uptime": 86400,
      "version": "1.0.0"
    },
    "database": {
      "status": "healthy",
      "latency": 12
    },
    "openai": {
      "status": "healthy",
      "circuitBreaker": "closed",
      "failures": 0
    },
    "documentIntelligence": {
      "status": "healthy",
      "circuitBreaker": "closed",
      "failures": 0
    }
  }
}
```

**Status codes:**
- `200 OK`: `status: "healthy"` or `"degraded"`
- `503 Service Unavailable`: `status: "unhealthy"` (database down)

**Health states:**
- **Healthy:** All checks passing
- **Degraded:** AI services circuit breaker open (jobs queued but not processing)
- **Unhealthy:** Database connectivity lost

**Azure App Service integration:**
- Configured as health probe endpoint
- Probe interval: 30 seconds
- Failure threshold: 3 consecutive failures → automatic restart

### Application Insights

**Server-side instrumentation:**

```typescript
// instrumentation.ts
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { AzureMonitorTraceExporter } from '@azure/monitor-opentelemetry-exporter';

export function register() {
  if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
    const exporter = new AzureMonitorTraceExporter({
      connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
    });

    registerInstrumentations({
      instrumentations: [
        // Auto-instrumentation for HTTP, database, etc.
      ],
    });
  }
}
```

**Tracking:**
- `trackException`: Unhandled errors, API failures
- `trackEvent`: User actions (upload, redact, export)
- `trackMetric`: Processing time, page counts, detection rates
- `trackDependency`: Azure AI service calls with latency

**Client-side telemetry:**

```typescript
// POST /api/telemetry/error
// Fire-and-forget from browser
fetch('/api/telemetry/error', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message, stack, url, userAgent }),
});
```

### Structured Logging

**Development mode:**
```
14:32:45 INFO  [auth] User login successful userId=user_abc123
14:32:46 DEBUG [api/documents] Processing request caseId=case_001
14:32:47 WARN  [ai/detection] Confidence below threshold score=0.68
14:32:48 ERROR [ai/openai] API rate limit exceeded retryAfter=2s
```

**Production mode (JSON):**
```json
{"timestamp":"2026-03-23T14:32:45.123Z","level":"info","message":"User login successful","context":{"module":"auth","userId":"user_abc123"}}
{"timestamp":"2026-03-23T14:32:46.456Z","level":"debug","message":"Processing request","context":{"module":"api/documents","caseId":"case_001"}}
```

**Logger implementation:**

```typescript
// lib/logging/logger.ts
export const Logger = {
  debug: (msg: string, ctx?: object) => log('debug', msg, ctx),
  info: (msg: string, ctx?: object) => log('info', msg, ctx),
  warn: (msg: string, ctx?: object) => log('warn', msg, ctx),
  error: (msg: string, ctx?: object) => log('error', msg, ctx),
  child: (ctx: object) => ({ /* scoped logger */ }),
};
```

**Features:**
- Color-coded levels in development (debug=gray, info=blue, warn=yellow, error=red)
- Single-line JSON in production for log aggregation
- `Logger.child()` for module-scoped context
- Debug level suppressed in production (only info/warn/error)

---

## 5. Job Queue Operations

### PostgreSQL-Backed Queue

**Schema:**
```prisma
model ProcessingJob {
  id           String   @id @default(cuid())
  caseId       String
  documentId   String
  status       String   // queued, processing, complete, error
  attempts     Int      @default(0)
  maxAttempts  Int      @default(3)
  error        String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  completedAt  DateTime?
}
```

**Queue parameters:**
- **Concurrency:** 2 concurrent jobs per instance
- **Max attempts:** 3 retries per job
- **Poll interval:** 3 seconds
- **Job TTL:** Completed/errored jobs purged after 15 minutes

### Job Lifecycle

1. **Queued:** Document uploaded, job created with `status='queued'`
2. **Processing:** Worker claims job via optimistic locking:
   ```sql
   UPDATE ProcessingJob
   SET status='processing', attempts=attempts+1
   WHERE id=$1 AND status='queued'
   ```
3. **Complete:** Job finishes, `status='complete'`, `completedAt` timestamp
4. **Error:** Failure recorded, `attempts` incremented, retry if `attempts < maxAttempts`

### Crash Recovery

**Startup recovery process:**

```typescript
// lib/queue/startup-recovery.ts
export async function recoverStaleJobs() {
  const staleJobs = await db.processingJob.updateMany({
    where: { status: 'processing' },
    data: { status: 'queued' },
  });
  Logger.info(`Recovered ${staleJobs.count} stale jobs from crash`);
}
```

**Logic:** Any job marked "processing" at startup was interrupted (server crash, restart). Reset to "queued" for reprocessing.

### Optimistic Locking

Prevents multiple workers from claiming the same job:

```typescript
const claimed = await db.processingJob.updateMany({
  where: {
    id: jobId,
    status: 'queued'  // Only claim if still queued
  },
  data: { status: 'processing' },
});

if (claimed.count === 0) {
  // Job already claimed by another worker
  return null;
}
```

### Production Migration Path

**Current:** PostgreSQL-backed queue (sufficient for MVP)

**Future (Azure Service Bus):**
- Service Bus namespace: `sb-veil-prototype`
- Queue: `document-processing`
- Dead-letter queue for failed jobs
- At-least-once delivery with auto-complete
- Distributed across multiple App Service instances

**Migration trigger:** >5 concurrent instances or >1000 jobs/day

---

## 6. Database Operations

### Migrations

**Local development:**
```bash
npx prisma migrate dev --name add_bulk_review
# Creates migration file, applies to local DB, regenerates client
```

**Production deployment:**
```bash
npx prisma migrate deploy
# Applies pending migrations, read-only (no schema drift)
```

**Migration files:**
```
prisma/migrations/
  20260301120000_init/
  20260315143000_add_audit_trail/
  20260320091500_add_bulk_review/
  migration_lock.toml
```

### Seeding

**Demo data seeding:**

```bash
npx prisma db seed
# Runs prisma/seed.ts
```

**Seed contents:**
- 3 demo users (admin, legal reviewer, subject matter expert)
- 2 demo cases (active, completed)
- 5 demo documents with mock processing results
- 15 detections across document types
- Audit trail entries

**Production seeding:**
```bash
npx prisma db seed -- --org-name "New Plymouth District Council" --activation-code "VEIL-ABC123XYZ890"
# Seeds only org settings + activation code
```

### Database Studio

**Interactive GUI:**
```bash
npx prisma studio
# Opens at http://localhost:5555
```

**Features:**
- Browse all tables
- Edit records directly (use with caution in production)
- Query builder
- Schema visualization

**Security:** Never expose Prisma Studio to the internet. Use SSH tunnel for production access.

### Backup & Restore

**Azure automated backups:**
- **Frequency:** Daily automated backups
- **Retention:** 7 days (default), configurable to 35 days
- **Point-in-time restore:** Any point within retention window (5-minute granularity)
- **Storage:** Geo-redundant storage (GRS) in production

**Manual backup:**
```bash
# Local backup
docker exec veil-postgres pg_dump -U postgres veil > backup_$(date +%Y%m%d).sql

# Azure backup (point-in-time)
az postgres flexible-server restore \
  --resource-group rg-veil-prototype \
  --name psql-veil-prototype-restore \
  --source-server psql-veil-prototype \
  --restore-time "2026-03-23T10:00:00Z"
```

**Restore procedure:**
1. Create new PostgreSQL server from backup/restore point
2. Update App Service `DATABASE_URL` to new server
3. Verify application connectivity via health check
4. Run `npx prisma migrate deploy` to ensure schema current
5. Verify audit trail integrity (hash chain validation)

### Connection Management

**Prisma singleton pattern:**

```typescript
// lib/db/prisma.ts
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

export const db = globalForPrisma.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
```

**Connection pooling:**
- Default pool size: 10 connections
- Max pool size: 20 connections (B1ms PostgreSQL limit)
- Idle timeout: 30 seconds
- Connection timeout: 5 seconds

---

## 7. Container Build & Deployment

### Local Development

**Quick start:**

```bash
# Start PostgreSQL
docker compose up -d

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Apply migrations
npx prisma migrate dev

# Start dev server
npm run dev
```

**Docker Compose (local testing):**

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: veil
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data

  veil:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/veil
      AUTH_SECRET: dev-secret-change-in-production
    depends_on:
      - postgres

volumes:
  postgres-data:
```

### Production Deployment

**Build and push to Azure Container Registry:**

```bash
# Build image
az acr build \
  --registry acrveilprototype \
  --image veil-prototype:latest \
  --image veil-prototype:$(git rev-parse --short HEAD) \
  --file Dockerfile \
  .

# Update App Service (pulls new image)
az webapp config container set \
  --name app-veil-prototype \
  --resource-group rg-veil-prototype \
  --docker-custom-image-name acrveilprototype.azurecr.io/veil-prototype:latest

# Restart to apply
az webapp restart \
  --name app-veil-prototype \
  --resource-group rg-veil-prototype
```

**Deployment validation:**

```bash
# Check health endpoint
curl https://app-veil-prototype.azurewebsites.net/api/health

# View logs
az webapp log tail \
  --name app-veil-prototype \
  --resource-group rg-veil-prototype
```

### Image Details

**Base image:** `node:20-alpine`

**System packages:**
- `python3` (3.11+)
- `py3-pip`
- `PyMuPDF` (via pip, for PDF manipulation)

**Image size:** ~150 MB (compressed), ~400 MB (unpacked)

**Non-root user:**
- User: `nextjs`
- Group: `nodejs`
- UID/GID: 1001

**Security features:**
- No shell access (Alpine base, minimal attack surface)
- Read-only root filesystem (except /tmp, /app/.next)
- No privileged escalation
- Dropped capabilities (no CAP_SYS_ADMIN, etc.)

---

## 8. Environment Management

### Required Variables

**Minimum viable configuration:**

```bash
DATABASE_URL=postgresql://user:pass@host:5432/veil
AUTH_SECRET=<64-char-random-string>
```

### Azure AI Services (Production)

```bash
# Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://openai-veil-prototype.openai.azure.com/
AZURE_OPENAI_API_KEY=<key-vault-reference>
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o

# Document Intelligence
AZURE_DI_ENDPOINT=https://di-veil-prototype.cognitiveservices.azure.com/
AZURE_DI_API_KEY=<key-vault-reference>
```

### Optional Services

```bash
# Azure AD (SSO)
AZURE_AD_CLIENT_ID=<app-registration-id>
AZURE_AD_CLIENT_SECRET=<key-vault-reference>
AZURE_AD_TENANT_ID=<tenant-guid>

# SCIM Provisioning
SCIM_AUTH_TOKEN=<bearer-token>

# Blob Storage
AZURE_STORAGE_CONNECTION_STRING=<key-vault-reference>
AZURE_STORAGE_CONTAINER_ORIGINALS=veil-originals
AZURE_STORAGE_CONTAINER_REDACTED=veil-redacted

# Communication Services
AZURE_COMMUNICATION_CONNECTION_STRING=<key-vault-reference>
AZURE_COMMUNICATION_SENDER_ADDRESS=noreply@veil.datasing.com

# Application Insights
APPLICATIONINSIGHTS_CONNECTION_STRING=<key-vault-reference>
```

### Secret Management

**Azure Key Vault references:**

```bash
# App Service configuration
AZURE_OPENAI_API_KEY=@Microsoft.KeyVault(SecretUri=https://kv-veil.vault.azure.net/secrets/openai-api-key/)
```

**Automatic refresh:**
- App Service polls Key Vault every 24 hours
- Updated secrets applied without restart (for most services)
- Sensitive: Restart required if connection pooling caches old value

**Managed identity:**
- App Service system-assigned identity
- Key Vault access policy: GET secrets
- No client secrets required for vault access

### Environment Validation

**Startup validation:**

```typescript
// lib/config/validate-env.ts
export function validateEnvironment() {
  const required = ['DATABASE_URL', 'AUTH_SECRET'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    Logger.error('Missing required environment variables', { missing });
    process.exit(1);
  }

  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length < 32) {
    Logger.error('AUTH_SECRET must be at least 32 characters');
    process.exit(1);
  }

  Logger.info('Environment validation passed');
}
```

**Fail-fast principle:** Application refuses to start if critical configuration is missing or invalid.

---

## 9. Disaster Recovery

### Recovery Point Objective (RPO)

**Database:** 24 hours (daily backup schedule)

- Worst-case data loss: Documents uploaded since last backup
- Mitigation: Increase backup frequency to 6-hour intervals for high-value clients

**Blob Storage:** 0 hours (LRS with soft delete)

- Deleted blobs retained for 7 days
- Accidental deletion recoverable within retention window

### Recovery Time Objective (RTO)

**Application tier:** 2 minutes

- App Service restart: ~30 seconds
- Health check validation: ~30 seconds
- DNS propagation: ~1 minute (if domain change required)

**Database tier:** 15-30 minutes

- Azure point-in-time restore: ~10-20 minutes
- Prisma migration deployment: ~1 minute
- Connection string update + restart: ~2 minutes
- Data validation: ~5 minutes

**Total system RTO:** 30 minutes

### Audit Trail Integrity

**Hash chain verification:**

```typescript
// lib/audit/verify-chain.ts
export async function verifyAuditChain(caseId: string): Promise<boolean> {
  const entries = await db.auditEntry.findMany({
    where: { caseId },
    orderBy: { timestamp: 'asc' },
  });

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const prevHash = i === 0 ? 'GENESIS' : entries[i - 1].hash;
    const computed = computeHash(entry, prevHash);

    if (computed !== entry.hash) {
      Logger.error('Audit chain integrity violation', { entryId: entry.id });
      return false;
    }
  }

  return true;
}
```

**Post-restore validation:**
1. Restore database from backup
2. Run `verifyAuditChain()` for all active cases
3. If integrity check fails → investigate tampering or corruption
4. If valid → chain provides cryptographic proof of audit trail completeness

### File Storage Redundancy

**Current (MVP):** Locally Redundant Storage (LRS)

- 3 synchronous copies within single datacenter
- 99.999999999% (11 nines) durability
- Protection against drive/rack failures

**Production upgrade path:** Geo-Redundant Storage (GRS)

- 6 copies (3 local + 3 in paired region)
- 99.99999999999999% (16 nines) durability
- Protection against datacenter/region failures
- Read access to secondary region (RA-GRS)

### Disaster Recovery Procedure

**Full system recovery:**

1. **Assess scope:** Database corruption? Datacenter outage? Ransomware?
2. **Create new resource group** (if region-level failure)
3. **Restore PostgreSQL server** from latest backup or point-in-time
4. **Restore Blob Storage** from geo-redundant copy (if GRS enabled)
5. **Deploy application** to new App Service or restart existing
6. **Update DNS** if new endpoints created
7. **Verify audit trail integrity** via hash chain validation
8. **Test document upload/redaction/export** end-to-end
9. **Notify users** of downtime window and data loss (if any)
10. **Post-mortem:** Document incident, update runbooks

**Backup frequency adjustment:**

For high-criticality clients (e.g., active LGOIMA requests with tight deadlines):
- Increase Azure backup frequency to 6-hour intervals
- Enable point-in-time restore with 1-minute granularity
- Configure Azure Backup vault with geo-replication

---

## 10. Performance Monitoring

### Processing Metrics

**Per-document telemetry:**

```typescript
interface ProcessingMetrics {
  documentId: string;
  extractionMs: number;           // Document Intelligence OCR time
  patternDetectionMs: number;     // Regex pattern matching time
  aiDetectionMs: number;          // GPT-4o contextual detection time
  totalProcessingMs: number;      // End-to-end processing time
  pageCount: number;
  detectionCount: number;
}
```

**Application Insights queries:**

```kusto
// Average processing time by page count
customMetrics
| where name == "documentProcessingTime"
| extend pageCount = toint(customDimensions.pageCount)
| summarize avg(value) by bin(pageCount, 10)

// P95 AI detection latency
customMetrics
| where name == "aiDetectionMs"
| summarize percentile(value, 95)
```

### Queue Monitoring

**GET /api/documents/queue-status**

```json
{
  "queued": 12,
  "processing": 2,
  "completed": 145,
  "failed": 3,
  "avgProcessingTime": 18500,
  "throughput": {
    "last1h": 24,
    "last24h": 458
  }
}
```

**Alerts:**
- Queue depth > 50 for >10 minutes → scale alert
- Failed jobs > 10% of total → investigation alert
- Average processing time > 60s → performance degradation alert

### Throughput Metrics

**Pages processed per hour (rolling 24h):**

```sql
SELECT
  DATE_TRUNC('hour', "completedAt") AS hour,
  SUM("pageCount") AS pages_processed,
  COUNT(*) AS documents_processed,
  AVG("processingTimeMs") AS avg_processing_ms
FROM "Document"
WHERE "completedAt" > NOW() - INTERVAL '24 hours'
  AND "status" = 'complete'
GROUP BY DATE_TRUNC('hour', "completedAt")
ORDER BY hour DESC;
```

**Target benchmarks (from RFP):**
- 5,000 pages in 4 hours = 1,250 pages/hour
- Current capacity: ~300 pages/hour per B1 instance
- **Scale requirement:** 5 concurrent instances for RFP benchmark compliance

### AI Governance Metrics

**Detection accuracy by entity type:**

```typescript
interface AccuracyMetrics {
  entityType: 'person' | 'email' | 'phone' | 'commercial' | 'legal';
  precision: number;      // TP / (TP + FP)
  recall: number;         // TP / (TP + FN)
  f1Score: number;        // 2 * (precision * recall) / (precision + recall)
  falsePositiveRate: number;  // FP / (FP + TN)
  totalDetections: number;
  humanReviewed: number;
  acceptedByHuman: number;
  rejectedByHuman: number;
}
```

**Tracking:**
- Store human accept/reject decisions in `Detection.reviewStatus`
- Calculate precision = `accepted / (accepted + rejected)`
- Export quarterly reports for AI governance audit
- Retrain/fine-tune if precision drops below 85%

### Health Endpoint Circuit Breaker State

**GET /api/health** includes circuit breaker diagnostics:

```json
{
  "checks": {
    "openai": {
      "status": "degraded",
      "circuitBreaker": "half-open",
      "failures": 7,
      "lastFailure": "2026-03-23T14:25:00Z",
      "nextRetry": "2026-03-23T14:26:00Z"
    }
  }
}
```

**Circuit breaker states:**
- **Closed:** Normal operation, requests flow through
- **Open:** Failure threshold exceeded (5 failures in 60s), requests fail fast
- **Half-open:** Testing recovery, limited requests allowed

**Monitoring:**
- Alert if circuit breaker open for >5 minutes
- Track failure reasons (rate limit vs. service outage vs. auth failure)
- Automatic recovery when health checks pass

---

## Summary

Veil's operational architecture prioritizes:

1. **Isolation:** Per-client instances ensure data sovereignty and independent scaling
2. **Automation:** CI/CD pipelines, health monitoring, and crash recovery minimize manual intervention
3. **Observability:** Structured logging, Application Insights, and health checks provide comprehensive visibility
4. **Resilience:** Circuit breakers, queue-based processing, and disaster recovery procedures ensure continuity
5. **Security:** Non-root containers, Key Vault secrets, managed identities, and audit trail integrity

The architecture scales from single-client deployments (~$83/month) to multi-client shared infrastructure with proven Azure services and industry-standard DevOps practices.

---

**Next Steps:**
- Configure production Azure resources per client
- Establish monitoring dashboards in Application Insights
- Document runbooks for incident response
- Schedule disaster recovery drills
