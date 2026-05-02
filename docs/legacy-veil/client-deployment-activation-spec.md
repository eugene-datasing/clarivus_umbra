# Veil Client Deployment & Activation Specification

## 1. Overview

Each Veil client gets their own isolated deployment — their own App Service, database, and storage. There is no shared database or multi-tenancy. This spec covers:

1. **Domain strategy** — how each client gets a URL on their own domain
2. **Activation code** — a one-time code that unlocks a freshly provisioned instance
3. **Provisioning** — the process DataSing follows to stand up a new client
4. **Deployment updates** — how new versions are rolled out across clients

---

## 2. Per-Client Deployment

Each client deployment is a complete, independent Veil instance:

| Resource | Naming | Notes |
|----------|--------|-------|
| App Service | `app-veil-{slug}` | Same Docker image, unique env vars |
| PostgreSQL database | `veil` on `psql-veil-{slug}` | Own server, or own database on a shared server |
| Blob Storage | Container `documents` on `stveil{slug}` | Own account, or own container on a shared account |
| Key Vault | `kv-veil-{slug}` | Own vault, or prefixed secrets on a shared vault |
| Service Bus queue | `document-processing` on `sb-veil-{slug}` | Own namespace, or own queue on a shared namespace |

Shared across all clients (not per-client):

| Resource | Name | Notes |
|----------|------|-------|
| Container Registry | `acrveilprod` | One image, all clients pull the same version |
| Azure OpenAI | Shared endpoint | Per-client usage tracked via request headers |
| Document Intelligence | Shared endpoint | Per-client usage tracked via request headers |

The Veil application code is single-tenant by design. There are no `tenantId` columns, no cross-client query filters, and no URL path prefixes. Each deployment is its own world.

---

## 3. Domain Strategy

### Client-Owned Domains (Primary)

Each client uses a subdomain on their own domain:

```
veil.npdc.govt.nz           → CNAME → app-veil-npdc.azurewebsites.net
veil.waimakariri.govt.nz    → CNAME → app-veil-waimakariri.azurewebsites.net
veil.tauranga.govt.nz       → CNAME → app-veil-tauranga.azurewebsites.net
```

**Why client-owned domains:**

- Council staff see `npdc.govt.nz` in the address bar — it's clearly their system
- Government IT policies often require applications to be on their domain
- Trust signal for LGOIMA officers using it daily
- The council controls the DNS record — standard IT governance
- No wildcard SSL cert needed on DataSing's side

**How it works:**

1. Client's IT team creates one DNS CNAME record: `veil.npdc.govt.nz → app-veil-npdc.azurewebsites.net`
2. DataSing adds a custom domain binding on the App Service: `az webapp config hostname add`
3. Azure provisions a free managed SSL certificate for `veil.npdc.govt.nz` (DNS validation — the CNAME must exist first)
4. DataSing sets `NEXTAUTH_URL=https://veil.npdc.govt.nz` in the App Service env vars

Total setup time: ~10 minutes once the client has created the CNAME.

### Staging / Pre-Contract

Before the client has set up their DNS, use the default Azure URL:

| Phase | URL |
|-------|-----|
| Demo / pre-contract | `app-veil-npdc.azurewebsites.net` |
| Post-contract, client DNS ready | `veil.npdc.govt.nz` |

The custom domain is a configuration change — no code changes, no redeployment.

### Internal / DataSing Tooling

| Domain | Purpose |
|--------|---------|
| `datasing.nz` | DataSing company site |
| `clarivus.ai` | Clarivus product suite marketing |

No client-facing Veil instances live on DataSing or Clarivus domains. Each client's Veil is on their own domain.

### URL Structure Within Each Instance

No changes to internal URLs. Every client's instance serves identical routes:

```
veil.npdc.govt.nz/                                    → Dashboard
veil.npdc.govt.nz/requests                            → Cases list
veil.npdc.govt.nz/requests/abc123/review/def456       → Document review
veil.npdc.govt.nz/admin/settings                      → Settings
veil.npdc.govt.nz/activate                            → Activation (first use only)
```

Because each client is a separate deployment, there is no workspace slug in the URL path. The existing 63 hardcoded `href` references, 4 `router.push()` calls, 7 `fetch("/api/...")` calls, and the sidebar `navItems` array all remain unchanged.

---

## 4. Activation Code System

### Purpose

The activation code is a **commercial gate** — it proves the client has a valid contract and has been provisioned by DataSing. Once redeemed, it plays no further role. The code is delivered to the client as part of onboarding and consumed on first use.

### Code Format

```
VEIL-XXXX-XXXX-XXXX
```

- 12 alphanumeric characters in groups of 4, prefixed with `VEIL-`
- Uppercase, no ambiguous characters (no 0/O, 1/I/L)
- Example: `VEIL-A7K9-M3X2-P8R1`
- Generated server-side with `crypto.randomBytes()`, encoded to the safe character set
- Stored as a bcrypt hash (not plaintext) — the code itself is only ever known to DataSing and the client

### Activation Flow

```
PROVISIONING (DataSing side):
  1. DataSing runs provisioning script
  2. Azure resources created (App Service, DB, Blob, etc.)
  3. Prisma migrations applied to new database
  4. Activation code generated → bcrypt hash stored in database
  5. Organisation name pre-seeded in system_settings
  6. Client's IT team creates DNS CNAME
  7. DataSing adds custom domain binding + SSL
  8. Activation code delivered to client (email, onboarding call, or letter)

FIRST USE (Client side):
  1. Client admin visits veil.npdc.govt.nz
  2. Middleware detects: not yet activated → redirect to /activate
  3. Client enters activation code
  4. Server verifies bcrypt hash → marks code as redeemed with timestamp
  5. Redirect to /login
  6. Client signs in with Azure AD → first-admin bootstrap creates admin user
  7. Redirect to /setup → setup wizard (org details pre-filled from provisioning)
  8. Setup complete → normal operations

SUBSEQUENT USE:
  Activation code is consumed. All future visits go to /login → Azure AD.
  The /activate page shows "This instance has already been activated" if revisited.
```

### Schema Changes

Add to `prisma/schema.prisma`:

```prisma
model ActivationCode {
  id         String    @id @default(cuid())
  codeHash   String    // bcrypt hash of the activation code
  status     String    @default("pending")  // "pending" | "redeemed" | "revoked"
  redeemedAt DateTime?
  redeemedBy String?   // Email of the person who redeemed
  createdAt  DateTime  @default(now())
  expiresAt  DateTime? // Optional expiry (e.g., 90 days after provisioning)

  @@map("activation_codes")
}
```

Only one row exists per deployment. The model supports code regeneration (revoke old, create new) if a code is lost or compromised.

### Middleware Gate

In `lib/auth/auth.config.ts`, the `authorized` callback adds an activation check before the existing auth checks:

```
authorized({ auth, request: { nextUrl } }):
  pathname = nextUrl.pathname

  // Always allow static assets, auth API routes
  if (pathname matches static/auth) → allow

  // Always allow the activation page itself
  if (pathname === "/activate" || pathname === "/api/activate") → allow

  // Check activation status (cached in-memory after first check)
  if (!activated) → redirect to /activate

  // Existing auth checks continue unchanged...
  if (!isLoggedIn) → redirect to /login
  if (admin route && not admin role) → redirect to /
```

The activation status is checked once per process start and cached. It can only transition from `pending` to `redeemed`, never back.

**Edge middleware constraint:** The `authorized` callback runs in Edge runtime and cannot call Prisma directly. The recommended approach is to check activation status via a lightweight fetch to `/api/activation-status`, which reads a single `system_settings` row. The result is cached in a module-level variable — effectively a one-time check per cold start.

### New Files

| File | Purpose |
|------|---------|
| `app/activate/page.tsx` | Activation code entry page (server component) |
| `app/activate/activate-client.tsx` | Client component: code entry form, validation UI |
| `lib/actions/activation-actions.ts` | Server action: verify code against hash, mark redeemed |
| `app/api/activation-status/route.ts` | Lightweight GET endpoint returning `{ activated: boolean }` |

### Changes to Existing Files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `ActivationCode` model |
| `lib/auth/auth.config.ts` | Add activation gate before auth checks in `authorized` |
| `lib/data/settings.ts` | Add `ACTIVATION_STATUS` setting key |
| `app/login/page.tsx` | Show "Not yet activated" if accessed before activation |

---

## 5. Pre-Seeded Data on Provisioning

When DataSing provisions a new client, the following is seeded into their database before they ever see the application:

| Data | Source |
|------|--------|
| `org_identity` setting (name, abbreviation, type) | Provisioning input |
| `activation_codes` row (bcrypt hash of code) | Generated during provisioning |
| `setup_wizard_state` (step 0, no steps completed) | Default |

The setup wizard shows the pre-filled org name, which the client can adjust. This creates a "we've set it up for you" experience rather than a blank slate.

---

## 6. Provisioning Process

### Phase 1: CLI Script (1-5 Clients)

A parameterised Bash/Node.js script:

```bash
./scripts/provision-client.sh \
  --slug npdc \
  --org-name "New Plymouth District Council" \
  --org-abbrev NPDC \
  --org-type "District Council" \
  --admin-email "lgoima@npdc.govt.nz" \
  --region australiaeast
```

The script:

1. Creates Azure resources via `az` CLI (App Service, DB, Blob, Key Vault, Service Bus)
2. Runs `npx prisma migrate deploy` against the new database
3. Generates activation code, stores bcrypt hash in database
4. Seeds `org_identity` settings with org name, abbreviation, and type
5. Stores secrets in Key Vault, configures App Service env vars
6. Outputs: activation code, Azure URL, resource summary

The custom domain (`veil.npdc.govt.nz`) is added separately once the client's IT team has created the CNAME:

```bash
./scripts/add-custom-domain.sh \
  --slug npdc \
  --domain veil.npdc.govt.nz
```

This script is idempotent — running it twice for the same slug is safe.

### Phase 2: Bicep Template (Production Readiness)

Codify resource creation as a parameterised Bicep template so provisioning is repeatable and auditable:

```
Parameters:
  - slug: string (e.g., "npdc")
  - region: string (default: "australiaeast")
  - dbAdminPassword: securestring

Resources created:
  - Resource Group: rg-veil-{slug}
  - App Service Plan: asp-veil-{slug} (or reference to shared plan)
  - App Service: app-veil-{slug}
  - PostgreSQL Flexible Server + database (or database on shared server)
  - Storage Account + documents container
  - Key Vault with secrets
  - Service Bus namespace + queue
```

The provisioning script calls `az deployment group create` with this template.

### Phase 3: Admin Tool (When Needed, 10+ Clients)

A lightweight web tool for DataSing staff to manage client deployments. Only build this when the CLI script becomes operationally painful.

- Client CRUD: create, view status, suspend, reactivate
- Activation code management: generate, regenerate, view redemption status
- Trigger Azure provisioning via SDK
- Deployment management: push new version to all or selected clients

---

## 7. Infrastructure Cost

### Per Client (Isolated Resources)

| Resource | Monthly (NZD) |
|----------|--------------|
| App Service (B1) | $22 |
| PostgreSQL Flexible (B1ms) | $25 |
| Blob Storage (~5 GB) | $2 |
| Key Vault | $1 |
| Service Bus (Standard) | $15 |
| ACR (shared, amortised) | $2 |
| Azure OpenAI (usage) | $10-30 |
| Document Intelligence (usage) | $6 |
| **Total per client** | **~$83-103** |

### With Shared Base Resources (3+ Clients)

When running 3+ clients, share the App Service Plan, PostgreSQL server, Storage Account, and Service Bus namespace:

| Base infrastructure | Monthly (NZD) |
|--------------------|--------------|
| App Service Plan (S1, up to 10 apps) | $55 |
| PostgreSQL Flexible (D2s, shared server) | $130 |
| Storage Account (shared) | $2 |
| Key Vault (shared) | $1 |
| Service Bus (shared namespace) | $15 |
| Container Registry | $8 |
| **Base total** | **~$211** |

| Per additional client | Monthly (NZD) |
|----------------------|--------------|
| App Service (on shared plan) | $0 |
| Database (on shared server, ~$5 storage) | $5 |
| AI usage | $16-36 |
| **Incremental per client** | **~$21-41** |

| Clients | Total monthly | Per client |
|---------|--------------|-----------|
| 3 | ~$274 | ~$91 |
| 5 | ~$316 | ~$63 |
| 10 | ~$421 | ~$42 |

---

## 8. Deployment & Updates

### Rolling Updates

All clients run the same Docker image from ACR. To deploy a new version:

```bash
# 1. Build new image
az acr build --registry acrveilprod --image veil:v1.2.3 --image veil:latest .

# 2. Restart each client's App Service
for slug in npdc waimakariri tauranga; do
  az webapp restart --name app-veil-$slug --resource-group rg-veil-$slug
done

# 3. Run migrations for each client
for slug in npdc waimakariri tauranga; do
  DATABASE_URL="..." npx prisma migrate deploy
done
```

Each client restarts independently. If a migration fails for one client, the others are unaffected.

### Zero-Downtime Deploys (Later)

Use App Service deployment slots:

1. Deploy new image to staging slot
2. Run migrations
3. Swap staging → production
4. If issues, swap back

---

## 9. Security

| Property | Mechanism |
|----------|-----------|
| **Data isolation** | Separate database, separate storage per client. No shared data paths. |
| **Activation code** | bcrypt-hashed, one-time use, optional expiry. Never stored in plaintext. |
| **Authentication** | Azure AD — each client uses their own Entra ID tenant. |
| **Network isolation** | Each App Service can be VNet-integrated independently. |
| **Secret management** | Per-client Key Vault (or prefixed secrets on shared vault). Managed identity per App Service. |
| **Audit isolation** | Each client's audit trail is in their own database. No cross-client leakage. |
| **Image integrity** | All clients run the same verified image from ACR. No per-client code modifications. |

---

## 10. Codebase Impact

### Changes Required

| Area | Scope |
|------|-------|
| Database schema | 1 new model (`ActivationCode`) |
| New pages | 1 page (`/activate`) |
| New server actions | 1 file (`activation-actions.ts`) |
| New API routes | 1 route (`/api/activation-status`) |
| Middleware | ~10 lines added to `auth.config.ts` |

### What Does NOT Change

- No new columns on any existing table
- No changes to any existing query
- No URL restructuring
- No changes to the 63 `href` references across 16 client components
- No changes to session shape, auth callbacks, or the pipeline/export/review flows

---

## 11. Implementation Sequence

1. **Activation code feature** — `ActivationCode` model, `/activate` page, middleware gate, server action
2. **Provisioning script** — `scripts/provision-client.sh` with `az` CLI, parameterised by slug
3. **Custom domain script** — `scripts/add-custom-domain.sh` for adding `veil.{client}.govt.nz` after DNS setup
4. **Bicep template** — codify Azure resource creation for repeatable, auditable provisioning
5. **Shared infrastructure** — migrate from isolated to shared base resources when running 3+ clients
6. **Admin tool** — web UI for client management, only when CLI becomes painful

---

## 12. Client Suspension & Offboarding

### Suspension (Non-Payment)

If a client stops paying, DataSing suspends access without deleting data:

- **Option A:** Set `VEIL_SUSPENDED=true` as an App Service env var. Middleware redirects all routes to a "Your subscription has been suspended — contact DataSing" page. Data is preserved. Cost continues (App Service is running).
- **Option B:** Stop the App Service entirely (`az webapp stop`). Returns 403 to all requests. $0 compute cost while stopped. Data in database and storage is preserved.

Recommendation: Option B for cost efficiency. The client sees a generic Azure error page — add a custom error page later if needed.

### Offboarding (Client Leaves)

1. Export all client data: cases, documents, detections, audit trail, original files
2. Deliver export to client (encrypted archive)
3. Delete Azure resources: `az group delete --name rg-veil-{slug}`
4. Remove DNS custom domain binding
5. Client removes their CNAME record

A `scripts/export-client.sh` script should produce the complete archive.

---

## 13. Open Questions

1. **Activation code expiry?** Recommendation: 90-day expiry. If the client doesn't activate in time, DataSing regenerates the code. Prevents stale provisioned instances.

2. **Custom domain timing.** Should the custom domain be a requirement before activation, or can the client activate on the default `*.azurewebsites.net` URL first and add the custom domain later? Recommendation: allow activation on either URL — the custom domain is a nicety, not a gate.

3. **Backup strategy on shared PostgreSQL.** Server-wide backups mean a point-in-time restore for one client affects all clients on that server. For true isolation, use `pg_dump` per database on a schedule, or keep separate servers.
