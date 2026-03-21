# Veil Authentication & First-Run Onboarding Specification

## 1. Overview

This spec covers two tightly coupled systems:

1. **Azure AD (Entra ID) authentication** — replacing credentials-only login with Microsoft SSO as the primary auth method
2. **First-run onboarding** — the path from empty database to a working system with an admin, departments, and users

These must be built together because the first-admin bootstrap depends on the auth provider, and the onboarding flow depends on user management being real (not mock).

---

## 2. Authentication Architecture

### 2.1 Provider Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Identity provider | Azure AD / Entra ID | OAuth2 + OpenID Connect |
| Auth framework | NextAuth v5 (`next-auth`) | OAuth flow, session management, middleware |
| Azure AD provider | `@auth/azure-ad` | NextAuth provider plugin |
| Session strategy | JWT (httpOnly cookie) | Stateless, no server-side session store |
| Fallback provider | NextAuth Credentials | Dev/demo mode only |

### 2.2 Why NextAuth, Not Raw MSAL

Veil is a Next.js 15 app with server components, server actions, and Edge middleware. NextAuth v5 is purpose-built for this stack:

- **Server-side token exchange** — OAuth tokens never reach the browser JavaScript. NextAuth handles the code-for-token exchange server-side and stores the session in an httpOnly cookie. This eliminates XSS risk on bearer tokens.
- **No client-side library needed** — No `@azure/msal-browser`, no Axios interceptors, no `acquireTokenSilent()` calls. Server components call `auth()` directly.
- **Existing infrastructure stays intact** — The middleware (`auth.config.ts`), `requireUser()`, `requireAdmin()`, `authorizeForCase()`, and all server actions continue working unchanged. They read the session; they don't care which provider created it.
- **Multiple providers simultaneously** — Azure AD for production, Credentials for dev/demo, same session shape from both.

### 2.3 Login Flow

```
User visits any protected route
  → Edge middleware (auth.config.ts) checks session
  → No session → redirect to /login

/login page renders:
  → If AZURE_AD_CLIENT_ID is configured:
      Primary: "Sign in with Microsoft" button (Azure AD OAuth)
      Secondary: Dev credentials form (collapsed, toggle to show)
  → If AZURE_AD_CLIENT_ID is not configured:
      Primary: Credentials form only (local dev / demo mode)

Azure AD flow:
  → User clicks "Sign in with Microsoft"
  → NextAuth redirects to Azure AD authorize endpoint
  → User authenticates with Microsoft (SSO, MFA, etc.)
  → Azure AD redirects back to /api/auth/callback/azure-ad
  → NextAuth exchanges auth code for tokens (server-side)
  → signIn callback fires (see §2.5)
  → Session cookie set → redirect to / or /setup
```

### 2.4 Session Shape

The session shape is unchanged from the current implementation. Both Azure AD and Credentials providers produce the same structure:

```typescript
{
  user: {
    id: string;       // Veil user ID (cuid)
    name: string;     // Display name
    email: string;    // Email address
    role: string;     // "admin" | "senior-reviewer" | "request-manager" | "final-approver" | "reviewer"
  }
}
```

This is critical — every downstream consumer (`requireUser()`, `requireAdmin()`, `authorizeForCase()`, role checks in middleware, sidebar visibility) reads this shape. No changes needed anywhere downstream.

### 2.5 The signIn Callback

This is the core logic, equivalent to `findOrCreateFromAzureClaims()` from the reference architecture. It runs server-side in `auth-options.ts`:

```
signIn({ user, account, profile }):

  IF account.provider === "azure-ad":

    oid   = profile.oid
    email = profile.email ?? profile.preferred_username ?? profile.upn
    name  = profile.name

    1. LOOKUP BY OID (returning user — fast path):
       → SELECT * FROM User WHERE azureAdOid = oid
       → If found:
          → If !isActive → DENY "Your account has been deactivated"
          → Update name/email if changed in AD
          → ALLOW

    2. LOOKUP BY EMAIL (pre-registered user, first sign-in):
       → SELECT * FROM User WHERE email = email (case-insensitive)
       → If found:
          → If !isActive → DENY "Your account has been deactivated"
          → UPDATE User SET azureAdOid = oid (link account)
          → ALLOW

    3. CHECK USER COUNT (first-admin bootstrap):
       → SELECT COUNT(*) FROM User
       → If count === 0:
          → INSERT User { name, email, azureAdOid: oid, role: "admin" }
          → ALLOW

    4. DENY:
       → "Your account has not been set up. Contact your administrator."

  IF account.provider === "credentials":
    → Existing bcrypt validation (unchanged)
    → ALLOW or DENY based on password match
```

### 2.6 The jwt and session Callbacks

```
jwt({ token, user, account, profile }):
  IF user (sign-in event):
    → token.userId = user.id
    → token.role = user.role
    IF account.provider === "azure-ad":
      → token.azureAdOid = profile.oid
  RETURN token

session({ session, token }):
  → session.user.id = token.userId
  → session.user.role = token.role
  RETURN session
```

### 2.7 Environment Variables

```env
# Azure AD (Entra ID) — required for production
AZURE_AD_CLIENT_ID=<Application (client) ID from Azure app registration>
AZURE_AD_CLIENT_SECRET=<Client secret>
AZURE_AD_TENANT_ID=<Directory (tenant) ID>

# NextAuth
AUTH_SECRET=<random 32+ char string for JWT signing>
NEXTAUTH_URL=https://veil.npdc.govt.nz  # or http://localhost:3000 for dev

# Database
DATABASE_URL=postgresql://...

# Optional: disable credentials provider entirely in production
AUTH_CREDENTIALS_ENABLED=false
```

### 2.8 Azure App Registration

Required configuration in Azure Portal → App registrations:

| Setting | Value |
|---------|-------|
| Redirect URI | `https://{domain}/api/auth/callback/azure-ad` |
| Supported account types | Single tenant (NPDC's tenant only) |
| Token configuration | ID token claims: `email`, `name`, `oid`, `preferred_username` |
| API permissions | `openid`, `profile`, `email` (delegated) |
| Client secret | Generate one, store in Key Vault |

No custom API scope is needed (unlike the reference architecture) because NextAuth handles auth server-side — there are no browser-to-API bearer token calls.

---

## 3. Schema Changes

### 3.1 User Model

```prisma
model User {
  id           String   @id @default(cuid())
  name         String
  email        String?  @unique
  passwordHash String?               // Only used for dev/demo credentials login
  azureAdOid   String?  @unique      // NEW: Azure AD object ID, linked on first sign-in
  isActive     Boolean  @default(true) // NEW: Soft deactivation
  role         String   @default("reviewer")
  departmentId String?
  department   Department? @relation(fields: [departmentId], references: [id])
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  // Existing relations
  CaseAssignment CaseAssignment[]
  AuditEntry     AuditEntry[]
}
```

New fields:
- `azureAdOid` — Unique, nullable. Populated on first Azure AD sign-in. Used as the primary lookup key for returning users.
- `isActive` — Boolean, defaults to true. When false, the signIn callback rejects the user. This is checked on every sign-in, not cached in the session, so deactivation takes effect immediately (next page load / session refresh).

### 3.2 Migration

```sql
ALTER TABLE "User" ADD COLUMN "azure_ad_oid" TEXT UNIQUE;
ALTER TABLE "User" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX "User_azure_ad_oid_idx" ON "User"("azure_ad_oid");
```

---

## 4. First-Run Onboarding Flow

### 4.1 The Complete Sequence

```
EMPTY DATABASE (migrations applied, zero rows)

Step 1: First Admin Sign-In
  → Admin visits app → redirected to /login
  → Signs in with Microsoft (Azure AD)
  → signIn callback: zero users → auto-create as admin
  → Session established → redirect to /

Step 2: Setup Detection
  → Dashboard (or middleware) checks: is setup complete?
  → system_settings table is empty → setup not complete
  → Redirect to /setup

Step 3: Setup Wizard (6 steps)
  → Organisation Identity (name, address, contact)
  → Departments & Teams (create or seed defaults)
  → Document Branding (signatory, Ombudsman, footer)
  → LGOIMA Workflow Configuration (response days, escalation)
  → Detection Policies (confidence thresholds)
  → Review & Confirm
  → Setup marked complete → redirect to /

Step 4: Create Users
  → Admin navigates to Settings → Users & Roles
  → Creates users: email + name + role + department
  → Each user record: azureAdOid = null, isActive = true
  → Users can now sign in via Azure AD (pre-registration gate passes)

Step 5: Normal Operations
  → Admin or request-manager creates first case
  → Assigns departments → uploads documents
  → Pipeline auto-generates → assigns reviewers
  → Reviewers sign in → see their queue → begin review
```

### 4.2 Setup Completion Detection

The middleware or layout component checks whether setup is complete:

```typescript
async function isSetupComplete(): Promise<boolean> {
  const state = await getSetupWizardState();
  return state.completedSteps.length >= 6; // All 6 wizard steps done
}
```

**Where to check:**
- Option A: In middleware (`auth.config.ts`) — redirect to /setup if not complete. Simple but adds a DB query to every request.
- Option B: In the root layout or dashboard page — check once, redirect if needed. More efficient.

**Recommendation: Option B.** The dashboard page (`app/page.tsx`) already fetches data. Add a setup-complete check there. If not complete, redirect to `/setup`. This avoids adding DB overhead to middleware for a check that only matters once.

### 4.3 Login Page Adaptation

The login page should be context-aware:

| State | What the user sees |
|-------|-------------------|
| Zero users + Azure AD configured | "Sign in with Microsoft to begin setup" |
| Zero users + no Azure AD | Credentials form + "Create your admin account" |
| Users exist + Azure AD configured | "Sign in with Microsoft" (primary) + dev credentials (collapsed) |
| Users exist + no Azure AD | Credentials form with demo accounts listed |

The zero-user state detection is a simple `SELECT COUNT(*) FROM User` — cached for the page load, not called on every render.

---

## 5. User Management

### 5.1 Pre-Registration Model

Admins create user records before the person ever signs in. The record contains:

| Field | Set by admin | Set on first sign-in |
|-------|-------------|---------------------|
| name | Yes | Updated from AD if different |
| email | Yes (required) | Verified against AD |
| role | Yes | — |
| departmentId | Yes (optional) | — |
| azureAdOid | — | Linked automatically |
| isActive | Yes (default true) | — |
| passwordHash | — (not needed) | — |

### 5.2 Admin Settings → Users & Roles (Replace Mock Data)

The current `app/admin/settings/settings-client.tsx` has a "Users & Roles" tab with hardcoded `mockUsers[]`. This needs to become real CRUD.

**Server page** (`app/admin/settings/page.tsx`):
- Fetch all users from DB: `prisma.user.findMany({ include: { department: true } })`
- Fetch all departments for the role/department dropdowns
- Pass to client component

**User list display:**

| Column | Source |
|--------|--------|
| Name | `user.name` |
| Email | `user.email` |
| Role | `user.role` (dropdown to edit) |
| Department | `user.department.name` (dropdown to edit) |
| Status | `user.isActive` ? "Active" : "Deactivated" |
| Linked | `user.azureAdOid` ? "Yes" : "Pending first sign-in" |

**Actions:**
- **Create user**: Form with name, email, role, department. Server action creates the record. No password field — auth is via Azure AD.
- **Edit user**: Inline or modal edit of role, department, active status. Server action updates.
- **Deactivate user**: Sets `isActive = false`. User is rejected on next sign-in attempt.
- **Reactivate user**: Sets `isActive = true`.
- **Delete user**: Hard delete (or keep deactivate-only for audit trail integrity).

**Server actions** (new file `lib/actions/user-actions.ts`):

```
createUser(data: { name, email, role, departmentId? })
  → requireAdmin()
  → Validate email uniqueness
  → prisma.user.create(...)
  → Audit entry: "Created user {name} with role {role}"

updateUser(userId, data: { name?, role?, departmentId?, isActive? })
  → requireAdmin()
  → Prevent self-demotion (admin can't remove their own admin role)
  → prisma.user.update(...)
  → Audit entry: "Updated user {name}: {changes}"

deactivateUser(userId)
  → requireAdmin()
  → Prevent self-deactivation
  → prisma.user.update({ isActive: false })
  → Audit entry: "Deactivated user {name}"
```

### 5.3 Role Definitions

| Role | Access | Can create users? | Can run setup? |
|------|--------|-------------------|----------------|
| `admin` | Everything | Yes | Yes |
| `senior-reviewer` | Admin pages, all cases | No | No |
| `request-manager` | Admin pages, all cases | No | No |
| `final-approver` | Admin pages, all cases | No | No |
| `reviewer` | Main pages, assigned cases only | No | No |

Only `admin` can manage users and run the setup wizard. This is enforced by `requireAdmin()` in server actions.

---

## 6. Department Management

### 6.1 Current State

Departments can only be created inside the setup wizard (step 2). After setup is marked complete, there's no UI to add, edit, or remove departments.

### 6.2 Required Changes

Add a "Departments" section to the admin settings page (or as a standalone `/admin/departments` page):

- **List departments** with user count per department
- **Create department**: Name field
- **Edit department**: Rename
- **Delete department**: Only if no users or cases reference it (or reassign first)

The existing `lib/actions/department-actions.ts` already has `createDepartment()` and `seedDefaultDepartments()`. These just need UI outside the setup wizard.

---

## 7. Dev/Demo Mode

### 7.1 When Azure AD Is Not Configured

If `AZURE_AD_CLIENT_ID` is not set in the environment:

- The Azure AD provider is not registered with NextAuth
- The login page shows only the credentials form
- The demo account hints appear (as they do now)
- The seed script can be used to populate demo data

This is the mode for:
- Local development
- Internal demos without Azure AD access
- CI/CD testing

### 7.2 When Azure AD Is Configured

If `AZURE_AD_CLIENT_ID` is set:

- Azure AD is the primary sign-in method
- Credentials provider availability controlled by `AUTH_CREDENTIALS_ENABLED` env var
- In production: set `AUTH_CREDENTIALS_ENABLED=false` to disable credentials entirely
- In staging: keep credentials enabled for test accounts

### 7.3 Seeding for Dev/Demo

The existing `prisma/seed.ts` continues to work for dev mode. It creates users with `passwordHash` values, which the credentials provider uses. In production (Azure AD mode), the seed script is not used — users are created through the admin UI.

---

## 8. Files to Create/Modify

### New files

| File | Purpose |
|------|---------|
| `lib/actions/user-actions.ts` | Server actions: createUser, updateUser, deactivateUser |
| `app/admin/settings/users-section.tsx` | Real user management UI (replaces mock data) |
| `docs/azure-ad-setup.md` | Azure app registration instructions for deployment |

### Modified files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `azureAdOid`, `isActive` to User model |
| `prisma/migrations/` | New migration for schema changes |
| `lib/auth/auth-options.ts` | Add Azure AD provider, signIn callback with OID lookup/linking |
| `lib/auth/auth.config.ts` | No changes needed (session shape unchanged) |
| `app/login/page.tsx` | Add "Sign in with Microsoft" button, context-aware display |
| `app/login/login-client.tsx` | Client component for login page with Azure AD + credentials |
| `app/page.tsx` | Add setup-complete check, redirect to /setup if not done |
| `app/setup/page.tsx` | Remove or relax `requireUser()` for first-run (user exists after Azure AD sign-in, so this may work as-is) |
| `app/admin/settings/page.tsx` | Fetch real users from DB instead of passing nothing |
| `app/admin/settings/settings-client.tsx` | Replace `mockUsers[]` with real data, wire up CRUD actions |
| `package.json` | Add `@auth/azure-ad` dependency (if not bundled with next-auth) |

### Unchanged files (verification)

These files should require zero changes:

- `middleware.ts` — reads session, provider-agnostic
- `lib/auth/auth.config.ts` — session callbacks work for both providers
- `lib/auth/session.ts` — `requireUser()` reads session
- `lib/auth/authorize.ts` — `requireAdmin()`, `authorizeForCase()` read session
- All server actions in `lib/actions/detection-actions.ts`, `pipeline-actions.ts`, etc.
- All page components that call `requireUser()`

---

## 9. Deployment Considerations (Azure)

### 9.1 Current Deployment

The prototype is live at **https://app-veil-prototype.azurewebsites.net**.

| Component | Azure Service | Resource Name |
|-----------|--------------|---------------|
| Next.js app | Azure App Service (Linux B1, custom Docker container) | `app-veil-prototype` |
| PostgreSQL | Azure Database for PostgreSQL Flexible Server (Burstable B1ms, v16) | `psql-veil-prototype` |
| File storage | Azure Blob Storage (Standard LRS, Hot) | `stveilprototype` |
| Secrets | Azure Key Vault (Standard, RBAC) | `kv-veil-prototype` |
| Container images | Azure Container Registry (Basic) | `acrveilprototype` |
| Message queue | Azure Service Bus (Standard) | `sb-veil-prototype` |
| DNS/SSL | App Service managed certificate | `*.azurewebsites.net` |

All resources in `australiaeast` region, resource group `rg-veil-prototype`, subscription `clarivus_veil`.

See `docs/azure-infrastructure-spec.md` for full architecture and provisioning details.

### 9.2 Auth Status

- **Currently active:** NextAuth Credentials provider (email/password login)
- **Not yet configured:** Azure AD provider — requires an Azure AD app registration with redirect URI `https://app-veil-prototype.azurewebsites.net/api/auth/callback/azure-ad`
- **Key Vault secret `azure-ad-client-secret`** needs to be created once the app registration exists
- **`AUTH_CREDENTIALS_ENABLED`** is currently `true` — set to `false` once Azure AD is the primary auth method

### 9.3 Data Sovereignty

All data processing and storage in AU Azure region (`australiaeast`). This is a key differentiator in the RFP response:

- Database: Australia East
- Blob Storage: Australia East
- App Service: Australia East
- Azure OpenAI: Australia East (GPT-4o)
- Azure Document Intelligence: Australia East
- Key Vault: Australia East
- Service Bus: Australia East

### 9.4 Azure AD Tenant

NPDC would use their own Azure AD tenant. The app registration lives in their tenant. Veil is registered as a single-tenant application — only NPDC staff can authenticate.

For development/staging, DataSing uses its own tenant with a separate app registration.

### 9.5 CI/CD

Currently manual via CLI (`az acr build` + `az webapp restart`). Target:

```
GitHub Actions:
  → Push to main → build Docker image via ACR Tasks → restart App Service
  → Prisma migrations run via npx prisma migrate deploy
  → Environment variables managed via Azure Key Vault references
```

---

## 10. Implementation Sequence

### Phase 1: Schema & Auth Foundation
- Add `azureAdOid` and `isActive` to User model
- Run migration
- Add Azure AD provider to `auth-options.ts`
- Implement signIn callback (OID lookup, email lookup, first-admin bootstrap, deny)
- Update jwt/session callbacks to handle Azure AD profile data

### Phase 2: Login Page
- Refactor login page: "Sign in with Microsoft" button when Azure AD configured
- Add context-aware messaging (zero users, setup not complete)
- Keep credentials form for dev/demo mode
- Test: Azure AD sign-in → first admin auto-created → session works

### Phase 3: Setup Wizard Flow
- Add setup-complete check to dashboard → redirect to /setup
- Verify setup wizard works after Azure AD sign-in (user is authenticated, `requireUser()` passes)
- Test: first admin signs in → lands on setup → completes wizard → lands on dashboard

### Phase 4: User Management
- Create `lib/actions/user-actions.ts` (createUser, updateUser, deactivateUser)
- Replace mock users in admin settings with real DB-backed CRUD
- Build user creation form (name, email, role, department)
- Build user list with edit/deactivate actions
- Test: admin creates user → user signs in via Azure AD → OID linked → access granted

### Phase 5: Department Management
- Add department CRUD to admin settings (or standalone page)
- Wire existing `department-actions.ts` to new UI
- Test: admin creates department → assigns users → creates case with department

### Phase 6: End-to-End Verification
- Fresh database (migrations only, no seed)
- First admin signs in via Azure AD → auto-created
- Completes setup wizard (org, departments, branding, workflow, detection)
- Creates additional users
- Creates first case
- Uploads documents → pipeline runs
- Reviewer signs in → sees queue → reviews document
- Full audit trail verified

---

## 11. Security Properties

| Property | Mechanism |
|----------|-----------|
| Authentication | Azure AD OAuth2 / OpenID Connect via NextAuth |
| Token handling | Server-side only — no tokens in browser JS |
| Session security | httpOnly, Secure, SameSite cookie |
| Pre-registration gate | signIn callback rejects unknown emails |
| Account deactivation | `isActive` check on every sign-in |
| Role enforcement | Edge middleware + server-side `requireAdmin()` / `authorizeForCase()` |
| First-admin security | Only Azure AD tenant members can trigger bootstrap |
| Audit trail | All user management actions logged |
| Data sovereignty | All Azure services in NZ/AU region |
| Secret management | Azure Key Vault (production) |
