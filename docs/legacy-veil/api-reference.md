# Veil API Reference

Complete reference for all REST API endpoints and server actions.

---

## Authentication

Most endpoints require authentication via NextAuth session cookie. Three patterns are used:

| Pattern | Description |
|---------|-------------|
| `requireUser()` | Requires valid NextAuth session |
| `requireAdmin()` | Requires admin role |
| `authorizeForCase()` | Requires user has access to the specified case |
| Bearer token | SCIM endpoints use `SCIM_API_TOKEN` env var |

Public endpoints (no auth): `/api/health`, `/api/activation-status`, `/api/telemetry/error`

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| Document upload | 20 req/min per IP |
| Document processing | 30 req/min per user |
| Export generation | 10 req/min per user |
| Activation code | 5 attempts per IP per 15 min |

---

## REST Endpoints

### Document Management

#### `POST /api/documents/upload`

Upload documents to a case.

- **Auth:** Rate-limited by IP (no session required)
- **Body:** `multipart/form-data`
  - `caseId` (string, required)
  - `files` (File[], required, max 100MB each)
- **Response:** `201`
  ```json
  [{ "id": "string", "name": "string", "status": "string", "warnings": ["string"] }]
  ```
- **Errors:** `400` missing fields / too large / PST rejected, `404` case not found, `422` corrupted file

#### `GET /api/documents/[docId]/status`

Get processing status of a document.

- **Auth:** `requireUser()`, `authorizeForDocument()`
- **Response:** `200`
  ```json
  { "id": "string", "status": "string", "pageCount": 0, "detectionCount": 0, "error": null }
  ```

#### `POST /api/documents/[docId]/process`

Enqueue a document for AI processing.

- **Auth:** `requireUser()`, `authorizeForDocument()`, rate-limited
- **Response:** `200`
  ```json
  { "id": "string", "status": "string", "step": null, "queuePosition": 0 }
  ```

#### `GET /api/documents/queue-status`

Get processing queue status.

- **Auth:** `requireUser()`
- **Query:** `ids` (comma-separated document IDs, optional)
- **Response:** `200`
  ```json
  {
    "jobs": [{ "id": "string", "status": "string", "step": null, "error": null }],
    "stats": { "queued": 0, "processing": 0, "completed": 0, "failed": 0 }
  }
  ```

---

### Detection Management

#### `GET /api/detections/[detectionId]/history`

Get change history for a detection.

- **Auth:** `requireUser()`, `authorizeForDetection()`
- **Response:** `200`
  ```json
  [{ "id": "string", "field": "string", "previousValue": null, "newValue": "string", "changedBy": "string", "changedAt": "datetime" }]
  ```

---

### Export & Scheduling

#### `POST /api/export/[requestId]/generate`

Generate a redacted export package.

- **Auth:** `requireUser()`, `authorizeForCase()`, rate-limited
- **Body:**
  ```json
  {
    "packageType": "requester|internal|ombudsman",
    "documentIds": ["string"],
    "includeCoverLetter": true,
    "includeRightOfReview": true,
    "includeChainOfCustody": false,
    "batch": false,
    "maxPagesPerBatch": null
  }
  ```
- **Response:** `200`
  ```json
  { "exportId": "string" }
  ```
  Batch mode: `{ "batch": true, "batchGroupId": "string", "exportIds": ["string"] }`
- **Errors:** `400` no documents / unreviewed / missing grounds, `429` rate limited

#### `GET /api/export/[requestId]/[exportId]/status`

Poll export generation progress.

- **Auth:** `requireUser()`, `authorizeForCase()`
- **Response:** `200`
  ```json
  { "id": "string", "status": "pending|processing|complete|error", "progress": 0, "filename": null, "downloadKey": null, "error": null }
  ```

#### `GET /api/export/[requestId]/batch-status?batchGroupId=...`

Get batch export progress.

- **Auth:** `requireUser()`, `authorizeForCase()`
- **Response:** `200`
  ```json
  { "batchGroupId": "string", "exports": [], "overallProgress": 0, "allComplete": false }
  ```

#### `GET /api/export/[requestId]/[exportId]/download`

Download completed export as ZIP.

- **Auth:** `requireUser()`, `authorizeForCase()`
- **Response:** `200` `application/zip` binary
- **Headers:** `Content-Disposition: attachment`

#### `GET /api/schedule/[requestId]`

Generate withholding schedule PDF.

- **Auth:** `requireUser()`, `authorizeForCase()`
- **Response:** `200` `application/pdf` binary

---

### Reports

#### `GET /api/reports/cost-recovery?caseId=...`

Generate cost-recovery report PDF.

- **Auth:** `requireUser()`, `authorizeForCase()`
- **Response:** `200` `application/pdf` binary

---

### File Serving

#### `GET /api/files/[...path]`

Serve uploaded files securely. First path segment is `caseId` for authorization.

- **Auth:** `requireUser()`, `authorizeForCase()`
- **Response:** `200` file binary with appropriate `Content-Type`
- **Headers:** `Cache-Control: private, max-age=3600`, `X-Content-Type-Options: nosniff`
- **Note:** Forces download for potentially dangerous types (HTML, SVG)

---

### SCIM 2.0 User Provisioning

All SCIM endpoints use Bearer token authentication (`SCIM_API_TOKEN` env var).
Content type: `application/scim+json`.

#### `GET /api/scim/Users`

List users with optional filtering and pagination.

- **Query:** `filter` (e.g., `userName eq "user@example.com"`), `startIndex` (default 1), `count` (default 100, max 200)

#### `POST /api/scim/Users`

Create a new user. Default role: `reviewer`.

- **Body:** `{ "userName": "email", "displayName": "string", "name": { "givenName": "string", "familyName": "string" }, "active": true, "externalId": "azure-oid" }`
- **Errors:** `409` user already exists

#### `GET /api/scim/Users/[id]`

Get user by ID.

#### `PUT /api/scim/Users/[id]`

Full replacement of user attributes.

#### `PATCH /api/scim/Users/[id]`

Partial update via SCIM PatchOp.

- **Body:** `{ "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"], "Operations": [{ "op": "replace", "path": "displayName", "value": "string" }] }`

#### `DELETE /api/scim/Users/[id]`

Soft delete (deactivates user). Returns `204`.

---

### SCIM 2.0 Group Management

#### `GET /api/scim/Groups`

List role groups. Built-in roles: admin, request-manager, senior-reviewer, reviewer, final-approver.

#### `POST /api/scim/Groups`

Create custom role group.

#### `GET /api/scim/Groups/[id]`

Get group with member list.

#### `PUT /api/scim/Groups/[id]`

Replace group membership. Users removed from group are demoted to `reviewer`.

#### `PATCH /api/scim/Groups/[id]`

Add/remove members via SCIM PatchOp.

#### `DELETE /api/scim/Groups/[id]`

Delete custom group. Cannot delete built-in roles. Members demoted to `reviewer`.

---

### System & Monitoring

#### `GET /api/health`

Health check for load balancers. Returns `200` if healthy/degraded, `503` if unhealthy.

- **Auth:** None
- **Response:**
  ```json
  {
    "status": "healthy|degraded|unhealthy",
    "checks": { "app": "ok", "database": "ok|error", "openai": "ok|circuit-open", "documentIntelligence": "ok|circuit-open" },
    "timestamp": "datetime"
  }
  ```

#### `GET /api/activation-status`

Check if instance has been activated.

- **Auth:** None
- **Response:** `{ "activated": true }`

#### `POST /api/telemetry/error`

Client-side error reporting (fire-and-forget).

- **Auth:** None
- **Body:** `{ "message": "string", "digest": "string", "source": "string" }`
- **Response:** `204` (always succeeds)

#### `GET /api/notifications`

Get recent audit activity for notifications dropdown.

- **Auth:** `auth()` (NextAuth session)
- **Response:** `200` — array of recent audit entries (last 5)

---

## Server Actions

Server actions are called directly from React components via `"use server"` functions.

### Case Management

| Action | Auth | Description |
|--------|------|-------------|
| `createCase(data)` | `requireUser()` | Create LGOIMA request. Auto-generates reference (e.g., LGOIMA-2026-001). |

### Detection Actions

| Action | Auth | Description |
|--------|------|-------------|
| `markDocumentInReview(documentId)` | `requireUser()` | Transition document ready → in-review |
| `submitForSeniorReview(documentId)` | `requireUser()` | Submit in-review → reviewed, creates draft snapshot |
| `signOffDocument(documentId)` | `requireUser()` | Sign off reviewed → signed-off, creates final snapshot |
| `requestChanges(documentId, reason?)` | `requireUser()` | Send back reviewed → in-review |
| `acceptDetection(detectionId, ground?)` | `requireUser()` | Accept detection with withholding ground |
| `rejectDetection(detectionId, reason?)` | `requireUser()` | Reject false positive |
| `revertDetection(detectionId)` | `requireUser()` | Revert to pending (may regress document status) |
| `applyGround(detectionId, groundId)` | `requireUser()` | Apply/change withholding ground |
| `bulkAcceptDetections(ids[], ground?)` | `requireUser()` | Bulk accept across case |
| `bulkRejectDetections(ids[])` | `requireUser()` | Bulk reject across case |
| `applyConfidenceThreshold(caseId, threshold)` | `requireUser()`, admin/manager/senior | Auto-accept detections above threshold |
| `bulkApplyGroundToSimilar(caseId, text, ground, action)` | `requireUser()` | Apply to all matching entity text |
| `bulkApplyGroundByType(caseId, type, ground, action)` | `requireUser()` | Apply to all detections of a type |

### Manual Detections

| Action | Auth | Description |
|--------|------|-------------|
| `createManualDetection(input)` | `requireUser()` | Add detection AI missed. Creates feedback example. |
| `deleteManualDetection(detectionId)` | `requireUser()` | Delete manual detection only |
| `suggestCustomRule(detectionId)` | `requireUser()` | Create draft rule from manual detection |
| `scanCrossDocument(detectionId, caseId)` | `requireUser()` | Find matches across all case documents |
| `bulkCreateCrossDocDetections(input)` | `requireUser()` | Create detections from cross-doc scan results |

### Department Management

| Action | Auth | Description |
|--------|------|-------------|
| `createDepartment(data)` | `requireAdmin()` | Create department |
| `updateDepartment(id, data)` | `requireAdmin()` | Update department |
| `deleteDepartment(id)` | `requireAdmin()` | Delete department |
| `reorderDepartments(orderedIds)` | `requireAdmin()` | Update sort order |
| `seedDefaultDepartments()` | `requireAdmin()` | Seed 10 default council departments |

### User Management

| Action | Auth | Description |
|--------|------|-------------|
| `inviteUser(params)` | Admin | Send email invitation (14-day expiry) |
| `revokeInvitation(id)` | Admin | Revoke pending invitation |
| `resendInvitation(id)` | Admin | Regenerate token and resend |
| `updateProfile(params)` | `requireUser()` | Update own profile (department) |

### Custom Rules

| Action | Auth | Description |
|--------|------|-------------|
| `createRule(data)` | `requireAdmin()` | Create detection rule (Keyword/Regex/Pattern) |
| `updateRule(id, data)` | `requireAdmin()` | Update rule configuration |
| `deleteRule(id)` | `requireAdmin()` | Delete rule |
| `toggleRuleStatus(id)` | `requireAdmin()` | Toggle Active ↔ Disabled |

### Pipeline & Setup

| Action | Auth | Description |
|--------|------|-------------|
| `initializePipeline(caseId)` | `requireUser()` | Create default milestones |
| `savePipeline(caseId, milestones, assignments)` | `requireUser()` | Save pipeline config |
| `redeemActivationCode(code)` | Session | Activate instance, promote to admin |
| `saveOrgIdentity(data)` | `requireAdmin()` | Setup step 1: org details |
| `saveOrgBranding(data)` | `requireAdmin()` | Setup step 3: branding/signatory |
| `saveLGOIMAConfig(data)` | `requireAdmin()` | Setup step 4: LGOIMA settings |
| `saveDetectionPolicies(data)` | `requireAdmin()` | Setup step 5: confidence thresholds |
| `completeSetup()` | `requireAdmin()` | Finish setup wizard |
| `saveDetectionToggles(toggles)` | Implicit | Enable/disable detection types |
| `saveWorkflowConfig(config)` | Implicit | Workflow configuration |
| `saveNotificationPrefs(prefs)` | Implicit | Notification preferences |

---

## Summary

- **21 REST API routes** (3 public, 10 SCIM, 8 authenticated)
- **47 server actions** (case, detection, department, user, rule, pipeline, setup)
- **Rate limiting** on upload, processing, export, and activation endpoints
- **SCIM 2.0** compliant user/group provisioning for Azure AD integration
