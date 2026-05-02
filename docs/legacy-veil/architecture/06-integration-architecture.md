# Integration Architecture

**Version:** 1.0
**Last Updated:** 2026-03-23
**Status:** Living Document

---

## Overview

This document describes the integration architecture for Veil, covering all external service integrations, their implementation patterns, authentication mechanisms, resilience strategies, and maturity levels.

Veil integrates with both Azure services (for AI processing, authentication, and infrastructure) and external systems (for document ingestion, records management, and eDiscovery workflows). Integrations are categorized as either **LIVE** (production-ready, actively used) or **FRAMEWORK** (API implemented, graceful degradation enabled, not yet wired into UI).

---

## 1. Integration Landscape

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              VEIL PLATFORM                                  │
│                         (Next.js 15 + TypeScript)                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
        │                             │                             │
┌───────▼────────┐          ┌─────────▼──────────┐       ┌─────────▼─────────┐
│  LIVE Services │          │ FRAMEWORK Services │       │  Infrastructure   │
└────────────────┘          └────────────────────┘       └───────────────────┘
        │                             │                             │
        │                             │                             │
        ├─ Azure OpenAI              ├─ Microsoft 365              ├─ Azure AD / Entra ID
        │  (GPT-4o)                  │  (Graph API)                │  (SSO + SCIM)
        │  • LIVE                    │  • FRAMEWORK                │  • LIVE
        │  • REST API                │  • REST API v1.0            │  • OAuth 2.0 / OIDC
        │  • API Key auth            │  • OAuth 2.0                │  • SCIM 2.0
        │                            │                             │
        ├─ Azure Document            ├─ Records Management         ├─ Application Insights
        │  Intelligence              │  (EDRMS)                    │  (Telemetry)
        │  • LIVE                    │  • FRAMEWORK                │  • LIVE
        │  • prebuilt-read           │  • REST API                 │  • Lazy-loaded SDK
        │  • Azure Key auth          │  • OAuth 2.0                │  • Auto-instrumentation
        │                            │  • Multiple providers       │
        ├─ PyMuPDF                   │                             ├─ Azure Communication
        │  (Python subprocess)       ├─ eDiscovery Platforms       │  Services (Email)
        │  • LIVE                    │  (Relativity, Nuix, etc.)   │  • LIVE
        │  • JSON IPC                │  • FRAMEWORK                │  • REST API + polling
        │  • Temp file exchange      │  • REST API                 │  • Connection string
        │  • 120s timeout            │  • Bearer + API Key         │
        │                            │  • Multiple providers       │
        └────────────────            │                             └───────────────────
                                     ├─ Azure Speech-to-Text
                                     │  (Audio redaction)
                                     │  • FRAMEWORK
                                     │  • REST API
                                     │  • Subscription key
                                     │
                                     ├─ Azure Video Indexer
                                     │  (Video redaction)
                                     │  • FRAMEWORK
                                     │  • REST API + polling
                                     │  • ARM token
                                     │
                                     └─ Azure Computer Vision
                                        (Image redaction)
                                        • FRAMEWORK
                                        • REST API
                                        • Subscription key
```

---

## 2. Azure OpenAI Integration

### Purpose
Contextual AI-powered detection of sensitive information (personal, commercial, legally privileged) with LGOIMA-aware reasoning and withholding ground recommendations.

### Implementation Details

| Aspect | Details |
|--------|---------|
| **SDK** | `openai` npm package (v4.x) |
| **Endpoint** | Azure OpenAI REST API (region-specific) |
| **Model** | GPT-4o (gpt-4o deployment) |
| **API Version** | 2024-10-21 |
| **Authentication** | API key (AZURE_OPENAI_KEY) |

### Processing Configuration

```typescript
{
  model: "gpt-4o",
  temperature: 0.1,              // Low temperature for consistency
  max_tokens: 4096,              // Sufficient for batch analysis
  response_format: { type: "json_object" },
  messages: [
    { role: "system", content: LGOIMA_SYSTEM_PROMPT },
    { role: "user", content: documentBatch }
  ]
}
```

### Batch Processing
- **Batch size:** 3 pages per API call
- **Rationale:** Balance between context window utilization and response latency
- **Parallelization:** Multiple batches processed concurrently (Promise.all)

### System Prompt Design
The system prompt (`lib/ai/ai-detection.ts`) includes:
- LGOIMA s6 (conclusive grounds), s7 (qualified grounds), s17 (consultation) definitions
- Public interest balancing test guidance
- Anti-hallucination rules (no references without page numbers)
- Strict JSON schema enforcement
- Confidence scoring calibration

### Deduplication Logic
AI detections are filtered against pattern-based matches to prevent double-redaction:
```typescript
// Remove AI detections that overlap >70% with pattern matches
aiDetections.filter(ai =>
  !patternDetections.some(pattern => overlapPercentage(ai, pattern) > 0.7)
)
```

### Feedback Loop
Recent manual detections (approved/rejected by humans) are appended to the system prompt as few-shot examples:
```typescript
Recent manual feedback:
- "John Smith" at page 3 → APPROVED (s7(2)(a) privacy)
- "Q3 revenue forecast" at page 5 → APPROVED (s7(2)(b) commercial)
- "the meeting" → REJECTED (insufficient context)
```

### Resilience Strategy

**Circuit Breaker Pattern:**
```typescript
{
  failureThreshold: 3,      // Open circuit after 3 failures
  resetTimeout: 30000,      // 30 seconds
  halfOpenTimeout: 15000    // 15 seconds in half-open state
}
```

**Retry Policy:**
```typescript
{
  maxRetries: 3,
  initialDelay: 1000,       // 1 second
  maxDelay: 15000,          // 15 seconds
  backoffMultiplier: 2
}
```

**Graceful Degradation:**
When circuit is open, `detectSensitiveContent` returns:
```typescript
{
  detections: [],           // Empty AI detections
  patternDetections: [...], // Pattern matches still work
  aiUnavailable: true       // Flag for UI messaging
}
```

### Error Handling
- **AIUnavailableError:** Circuit breaker open or Azure OpenAI unreachable
- **AIResponseError:** Malformed JSON or schema violations
- **Logging:** All API calls logged to Application Insights with duration, token count, error details

---

## 3. Azure Document Intelligence Integration

### Purpose
OCR and layout analysis for scanned PDFs, images, and handwriting recognition.

### Implementation Details

| Aspect | Details |
|--------|---------|
| **SDK** | `@azure/ai-form-recognizer` (v5.x) |
| **Model** | `prebuilt-read` (general document OCR + layout) |
| **Authentication** | `AzureKeyCredential` (AZURE_DOCUMENT_INTELLIGENCE_KEY) |
| **Endpoint** | Region-specific (AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT) |

### Input/Output

**Input:**
```typescript
Buffer | Uint8Array  // PDF, JPEG, PNG, TIFF, BMP
```

**Output:**
```typescript
{
  pages: [
    {
      pageNumber: 1,
      text: "Extracted text content...",
      width: 612,          // Points (PDF coordinate system)
      height: 792,
      words: [
        {
          content: "CONFIDENTIAL",
          polygon: [x1, y1, x2, y2, x3, y3, x4, y4]  // 4-point bounding box
        }
      ]
    }
  ]
}
```

### Bounding Box Calculation
Word-level polygons are used to calculate precise redaction coordinates:
```typescript
const bounds = {
  minX: Math.min(polygon[0], polygon[2], polygon[4], polygon[6]),
  minY: Math.min(polygon[1], polygon[3], polygon[5], polygon[7]),
  maxX: Math.max(polygon[0], polygon[2], polygon[4], polygon[6]),
  maxY: Math.max(polygon[1], polygon[3], polygon[5], polygon[7])
};

// Convert to PDF coordinates (origin bottom-left)
const redaction = {
  posX: bounds.minX,
  posY: pageHeight - bounds.maxY,
  posW: bounds.maxX - bounds.minX,
  posH: bounds.maxY - bounds.minY
};
```

### Resilience Strategy

**Circuit Breaker:** Same pattern as Azure OpenAI (3 failures, 30s reset)

**Retry Policy:** Same pattern as Azure OpenAI (3 attempts, exponential backoff)

**Graceful Degradation:**
When circuit is open:
```typescript
throw new OCRUnavailableError(
  "OCR service temporarily unavailable. Please try again later."
);
```

### Error Handling
- **OCRUnavailableError:** Service unreachable or circuit open
- **ExtractionCorruptionError:** File damaged, unsupported format, or extraction failed
- **Timeout:** 60 seconds per document (configurable)

### Supported File Types
- PDF (native and scanned)
- JPEG, PNG, TIFF, BMP (images)
- Maximum file size: 50 MB
- Maximum pages: 2,000 per document

---

## 4. PyMuPDF Integration (PDF Redaction)

### Purpose
Genuine content stream redaction for PDFs (not just visual overlays). Ensures redacted content is irreversibly removed from the file structure.

### Architecture

```
┌──────────────┐                  ┌──────────────────┐
│   Node.js    │  child_process   │  Python Runtime  │
│   Process    │ ───────────────> │                  │
│              │                  │  PyMuPDF (fitz)  │
│  execFile()  │ <─────────────── │                  │
└──────────────┘   JSON + bytes   └──────────────────┘
       │                                   │
       │ Temp file exchange                │
       │ (input.pdf, output.pdf)           │
       └───────────────────────────────────┘
```

### Scripts

**1. redact_pdf_pymupdf.py**
```python
# Read redaction spec from stdin (JSON)
# Load PDF from temp file
# For each redaction:
#   page.add_redact_annot(quad, text="[REDACTED]", fill=(0,0,0))
# page.apply_redactions(images=PDF_REDACT_IMAGE_METHOD_REMOVE)
# Save output PDF
```

**2. verify_redaction_pymupdf.py**
```python
# Load redacted PDF
# Extract all text content
# Search for redacted text fragments
# Return { isClean: boolean, leakedFragments: [...] }
```

### Input Format (JSON)

```json
{
  "inputPath": "/tmp/original-abc123.pdf",
  "outputPath": "/tmp/redacted-abc123.pdf",
  "redactions": [
    {
      "page": 0,          // 0-indexed
      "posX": 100,
      "posY": 200,
      "posW": 150,
      "posH": 20,
      "label": "Name (Privacy s7(2)(a))"
    }
  ]
}
```

### Execution

```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFilePromise = promisify(execFile);

const { stdout, stderr } = await execFilePromise(
  'python3',
  ['scripts/redact_pdf_pymupdf.py'],
  {
    input: JSON.stringify(redactionSpec),
    timeout: 120000,  // 120 seconds
    maxBuffer: 50 * 1024 * 1024  // 50 MB
  }
);
```

### Temp File Management

```typescript
const inputPath = path.join(os.tmpdir(), `veil-input-${uuid}.pdf`);
const outputPath = path.join(os.tmpdir(), `veil-output-${uuid}.pdf`);

try {
  await fs.writeFile(inputPath, pdfBuffer);
  await execPyMuPDF({ inputPath, outputPath, redactions });
  const redactedBuffer = await fs.readFile(outputPath);
  return redactedBuffer;
} finally {
  await fs.unlink(inputPath).catch(() => {});
  await fs.unlink(outputPath).catch(() => {});
}
```

### Fallback for Non-PDF Formats

For images and other non-PDF formats, `pdf-lib` is used to generate a new PDF with visual redaction markers:
```typescript
import { PDFDocument, rgb } from 'pdf-lib';

// Create new PDF
const pdfDoc = await PDFDocument.create();
const page = pdfDoc.addPage([width, height]);

// Embed original image
const image = await pdfDoc.embedPng(imageBuffer);
page.drawImage(image, { x: 0, y: 0, width, height });

// Draw black rectangles over redacted areas
redactions.forEach(r => {
  page.drawRectangle({
    x: r.posX,
    y: r.posY,
    width: r.posW,
    height: r.posH,
    color: rgb(0, 0, 0)
  });
});

return await pdfDoc.save();
```

### Verification Process

After redaction, `verify_redaction_pymupdf.py` is automatically run:
```typescript
const verifyResult = await execFilePromise('python3', [
  'scripts/verify_redaction_pymupdf.py'
], {
  input: JSON.stringify({ pdfPath: outputPath, expectedRedactions })
});

const { isClean, leakedFragments } = JSON.parse(verifyResult.stdout);

if (!isClean) {
  throw new RedactionVerificationError(
    `Redaction incomplete: found ${leakedFragments.length} leaked fragments`
  );
}
```

### Error Handling
- **Python not found:** Clear error message with installation instructions
- **Script error:** Full stderr logged to Application Insights
- **Timeout (120s):** Process killed, temp files cleaned up
- **Verification failure:** Redaction rejected, admin alerted

---

## 5. Azure Communication Services (Email)

### Purpose
Transactional email for user invitations, workflow notifications, and alerts.

### Implementation Details

| Aspect | Details |
|--------|---------|
| **SDK** | `@azure/communication-email` (v1.x) |
| **Protocol** | REST API with long-polling (LRO pattern) |
| **Authentication** | Connection string (AZURE_COMMUNICATION_CONNECTION_STRING) |
| **Sender** | Configurable (default: DoNotReply@veil.datasing.co.nz) |

### Email Templates

**1. User Invitation Email**
```typescript
{
  subject: "You've been invited to Veil",
  html: `
    <h1>Welcome to Veil</h1>
    <p>You've been invited to join the Veil redaction platform as a ${role}.</p>
    <a href="${inviteUrl}">Accept Invitation</a>
  `,
  plainText: `You've been invited to Veil. Visit: ${inviteUrl}`
}
```

**2. Welcome Email (post-signup)**
```typescript
{
  subject: "Welcome to Veil - Get Started",
  html: `
    <h1>Your Veil account is ready</h1>
    <p>Start by creating your first project...</p>
  `,
  plainText: "Your Veil account is ready. Log in to get started."
}
```

### Sending Pattern (Long-Running Operation)

```typescript
import { EmailClient } from '@azure/communication-email';

const emailClient = new EmailClient(connectionString);

// Start send operation
const poller = await emailClient.beginSend({
  senderAddress: "DoNotReply@veil.datasing.co.nz",
  content: {
    subject: "Subject",
    html: "<p>HTML content</p>",
    plainText: "Plain text content"
  },
  recipients: {
    to: [{ address: "user@example.com" }]
  }
});

// Poll until complete (max 60s)
const result = await poller.pollUntilDone({ abortSignal: timeout(60000) });

if (result.status === "Succeeded") {
  console.log("Email sent successfully");
} else {
  throw new Error(`Email failed: ${result.error}`);
}
```

### Security Measures

**HTML Escaping:**
```typescript
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
```

**URL Sanitization:**
```typescript
function sanitizeUrl(url: string): string {
  const allowed = /^https?:\/\//;
  if (!allowed.test(url)) {
    throw new Error("Invalid URL scheme (must be http/https)");
  }
  if (url.includes('javascript:') || url.includes('data:')) {
    throw new Error("Blocked dangerous URL pattern");
  }
  return url;
}
```

### Fallback Behavior

In development mode (when `AZURE_COMMUNICATION_CONNECTION_STRING` is not set):
```typescript
console.log("[DEV] Email would be sent to:", recipients);
console.log("[DEV] Subject:", subject);
console.log("[DEV] Body:", plainText);
```

### Monitoring
- All email sends logged to Application Insights
- Metrics: send duration, success rate, bounce rate
- Alerts: >5% failure rate triggers notification

---

## 6. Azure AD / Entra ID (SSO)

### Purpose
Enterprise single sign-on, user provisioning (SCIM), and identity management.

### Authentication Protocol: OAuth 2.0 / OpenID Connect

**Provider Configuration (NextAuth):**
```typescript
{
  id: "microsoft-entra-id",
  name: "Microsoft Entra ID",
  type: "oauth",
  wellKnown: "https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration",
  authorization: {
    params: {
      scope: "openid profile email User.Read"
    }
  },
  profile(profile) {
    return {
      id: profile.oid,          // Office 365 Object ID (stable)
      email: profile.email,
      name: profile.name
    }
  }
}
```

### Domain Restriction

Configured via `instance_config` table:
```typescript
const allowedDomain = await getInstanceConfig("allowedDomain");
// e.g., "npdc.govt.nz"

if (user.email && !user.email.endsWith(`@${allowedDomain}`)) {
  throw new Error(`Email domain must be @${allowedDomain}`);
}
```

### User Matching Strategy

**Primary:** OID (Object ID) matching
```typescript
const existingUser = await db.user.findUnique({
  where: { azureOid: profile.oid }
});
```

**Fallback:** Email matching (for first-time users)
```typescript
if (!existingUser) {
  const userByEmail = await db.user.findUnique({
    where: { email: profile.email }
  });

  if (userByEmail) {
    // Update with OID for future stable matching
    await db.user.update({
      where: { id: userByEmail.id },
      data: { azureOid: profile.oid }
    });
  }
}
```

**Rationale:** OID is stable even if user email changes (e.g., name change, department transfer).

### SCIM 2.0 Provisioning

**Endpoints:**
- `POST /api/scim/Users` - Create user
- `GET /api/scim/Users/:id` - Get user
- `PATCH /api/scim/Users/:id` - Update user (partial)
- `DELETE /api/scim/Users/:id` - Deactivate user
- `POST /api/scim/Groups` - Create group (role mapping)
- `GET /api/scim/Groups/:id` - Get group

**Authentication:**
```typescript
const authHeader = request.headers.get("authorization");
const expectedToken = process.env.SCIM_API_TOKEN;

if (authHeader !== `Bearer ${expectedToken}`) {
  return new Response("Unauthorized", { status: 401 });
}
```

**User Schema:**
```json
{
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
  "id": "user-123",
  "userName": "jsmith@npdc.govt.nz",
  "name": {
    "givenName": "Jane",
    "familyName": "Smith"
  },
  "emails": [
    { "value": "jsmith@npdc.govt.nz", "primary": true }
  ],
  "active": true,
  "externalId": "azure-oid-abc123"
}
```

**Group/Role Mapping:**
```json
{
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:Group"],
  "id": "group-456",
  "displayName": "Veil Reviewers",
  "members": [
    { "value": "user-123", "$ref": "/scim/Users/user-123" }
  ]
}
```

Mapped to Veil roles: `viewer`, `editor`, `reviewer`, `admin`

### Security Features
- **Token validation:** All ID tokens verified against Microsoft public keys
- **Nonce validation:** Prevents replay attacks
- **State parameter:** CSRF protection
- **PKCE (optional):** Can be enabled for additional security

---

## 7. Microsoft 365 Integration (Framework)

### Purpose
Ingest documents directly from SharePoint, OneDrive, and Outlook for redaction workflows.

### Implementation Details

| Aspect | Details |
|--------|---------|
| **API** | Microsoft Graph REST API v1.0 |
| **Authentication** | OAuth 2.0 client credentials grant |
| **Scopes** | Sites.Read.All, Files.Read.All, Mail.Read |
| **Configuration** | M365_TENANT_ID, M365_CLIENT_ID, M365_CLIENT_SECRET |

### Token Management

```typescript
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';

const credential = new ClientSecretCredential(
  tenantId,
  clientId,
  clientSecret
);

const authProvider = {
  async getAccessToken() {
    const token = await credential.getToken('https://graph.microsoft.com/.default');
    return token.accessToken;
  }
};

const client = Client.initWithMiddleware({ authProvider });
```

**Token Caching:**
```typescript
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken() {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60000) {
    // Token valid for at least 60 more seconds
    return cachedToken.token;
  }

  const tokenResponse = await credential.getToken('https://graph.microsoft.com/.default');
  cachedToken = {
    token: tokenResponse.token,
    expiresAt: tokenResponse.expiresOnTimestamp
  };
  return cachedToken.token;
}
```

### API Capabilities

**1. List SharePoint Sites**
```typescript
const sites = await client
  .api('/sites?search=')
  .get();
```

**2. List Files in SharePoint Library**
```typescript
const files = await client
  .api(`/sites/${siteId}/drive/root/children`)
  .get();
```

**3. Download File**
```typescript
const fileStream = await client
  .api(`/drives/${driveId}/items/${itemId}/content`)
  .getStream();
```

**4. Search Across M365**
```typescript
const searchResults = await client
  .api('/search/query')
  .post({
    requests: [{
      entityTypes: ['driveItem'],
      query: { queryString: 'type:pdf modified>2024-01-01' }
    }]
  });
```

### Graceful Degradation

When not configured (`M365_CLIENT_ID` absent):
```typescript
export async function listSharePointFiles(siteUrl: string) {
  if (!process.env.M365_CLIENT_ID) {
    console.warn("M365 integration not configured. Returning stub data.");
    return { files: [], warning: "M365 integration not available" };
  }

  // ... actual implementation
}
```

### Status
- **API calls:** Fully implemented
- **Authentication:** Working
- **UI integration:** Not yet wired into ingest flow
- **Next steps:** Add "Import from SharePoint" button to project ingest page

---

## 8. Records Management Integration (Framework)

### Purpose
Register finalized documents in the organization's Electronic Document and Records Management System (EDRMS) and sync disposal schedules.

### Supported Providers

| Provider | System | Protocol |
|----------|--------|----------|
| `sharepoint-records` | SharePoint Records Center | Microsoft Graph API |
| `opentext` | OpenText Content Server | REST API |
| `hprm` | Micro Focus HPRM (HPE Records Manager) | SOAP/REST API |
| `generic-cmis` | Any CMIS 1.1 compliant system | CMIS REST bindings |

### Configuration

```typescript
{
  RECORDS_PROVIDER: "opentext",
  RECORDS_ENDPOINT: "https://records.npdc.govt.nz/api",
  RECORDS_CLIENT_ID: "veil-client",
  RECORDS_CLIENT_SECRET: "***",
  RECORDS_DEFAULT_CLASSIFICATION: "GDA25-LGOIMA-Responses"
}
```

### API Operations

**1. Register Document**
```typescript
interface RegisterDocumentRequest {
  title: string;
  content: Buffer;
  metadata: {
    classification: string;      // e.g., "GDA25-LGOIMA-Responses"
    retentionPeriod: string;      // e.g., "7 years"
    securityLevel: "PUBLIC" | "IN_CONFIDENCE" | "RESTRICTED";
    relatedRequest?: string;      // LGOIMA request reference
  };
}

const recordId = await recordsClient.registerDocument({
  title: "LGOIMA Response - Request 2024-123 (REDACTED)",
  content: redactedPdfBuffer,
  metadata: {
    classification: "GDA25-LGOIMA-Responses",
    retentionPeriod: "7 years",
    securityLevel: "PUBLIC"
  }
});
```

**2. Sync Disposal Schedule**
```typescript
const schedule = await recordsClient.getDisposalSchedule("GDA25-LGOIMA-Responses");

// Returns:
{
  classificationCode: "GDA25-LGOIMA-Responses",
  retentionTrigger: "Date of response",
  retentionPeriod: "7 years",
  disposalAction: "ARCHIVE_THEN_DESTROY",
  approvalAuthority: "Archives New Zealand"
}
```

### Provider Abstraction

```typescript
interface RecordsProvider {
  registerDocument(request: RegisterDocumentRequest): Promise<string>;
  getDisposalSchedule(classification: string): Promise<DisposalSchedule>;
  updateMetadata(recordId: string, metadata: Partial<Metadata>): Promise<void>;
}

// Factory pattern
function createRecordsProvider(config: RecordsConfig): RecordsProvider {
  switch (config.provider) {
    case 'sharepoint-records':
      return new SharePointRecordsProvider(config);
    case 'opentext':
      return new OpenTextProvider(config);
    case 'hprm':
      return new HPRMProvider(config);
    case 'generic-cmis':
      return new CMISProvider(config);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
```

### Graceful Degradation

```typescript
export async function registerDocument(request: RegisterDocumentRequest) {
  if (!process.env.RECORDS_PROVIDER) {
    console.warn("Records management not configured. Document not registered.");
    return { recordId: null, warning: "Records integration unavailable" };
  }

  // ... actual implementation
}
```

### Status
- **Connector framework:** Complete
- **Provider implementations:** Stub methods (return mock data)
- **Production backend:** Not configured
- **Next steps:** Obtain NPDC EDRMS credentials and configure provider

---

## 9. eDiscovery Integration (Framework)

### Purpose
Export redacted documents to eDiscovery platforms for legal review, and import custodian/matter metadata for context-aware redaction.

### Supported Providers

| Provider | System | Authentication |
|----------|--------|----------------|
| `relativity` | Relativity (RelativityOne or Server) | OAuth 2.0 |
| `nuix` | Nuix Workstation / Discover | API Key |
| `clearwell` | OpenText Clearwell (legacy) | Basic Auth |
| `generic` | Generic REST API | Bearer Token |

### Configuration

```typescript
{
  EDISCOVERY_PROVIDER: "relativity",
  EDISCOVERY_ENDPOINT: "https://relativity.npdc.govt.nz/api",
  EDISCOVERY_API_KEY: "***",
  EDISCOVERY_WORKSPACE_ID: "12345"
}
```

### API Operations

**1. Create Matter**
```typescript
interface CreateMatterRequest {
  name: string;
  description?: string;
  custodians: string[];         // Email addresses
  dateRange?: { start: Date; end: Date };
}

const matterId = await ediscoveryClient.createMatter({
  name: "LGOIMA Request 2024-123",
  description: "Request for all correspondence regarding Project XYZ",
  custodians: ["jsmith@npdc.govt.nz", "bdoe@npdc.govt.nz"],
  dateRange: { start: new Date("2023-01-01"), end: new Date("2024-12-31") }
});
```

**2. Export Documents**
```typescript
interface ExportDocumentRequest {
  matterId: string;
  documents: {
    filename: string;
    content: Buffer;
    metadata: {
      custodian?: string;
      dateCreated?: Date;
      redactionApplied: boolean;
      redactionGrounds?: string[];
    };
  }[];
}

await ediscoveryClient.exportDocuments({
  matterId: "matter-abc123",
  documents: [
    {
      filename: "email-001-redacted.pdf",
      content: redactedPdfBuffer,
      metadata: {
        custodian: "jsmith@npdc.govt.nz",
        dateCreated: new Date("2024-03-15"),
        redactionApplied: true,
        redactionGrounds: ["s7(2)(a) Privacy"]
      }
    }
  ]
});
```

**3. Import Custodians**
```typescript
const custodians = await ediscoveryClient.getCustodians("matter-abc123");

// Returns:
[
  {
    email: "jsmith@npdc.govt.nz",
    name: "Jane Smith",
    department: "Planning",
    documentCount: 1247
  },
  {
    email: "bdoe@npdc.govt.nz",
    name: "Bob Doe",
    department: "Legal",
    documentCount: 89
  }
]
```

### Provider Abstraction

```typescript
interface EDiscoveryProvider {
  createMatter(request: CreateMatterRequest): Promise<string>;
  exportDocuments(request: ExportDocumentRequest): Promise<void>;
  getCustodians(matterId: string): Promise<Custodian[]>;
}

// Factory pattern (same as records management)
```

### Graceful Degradation

```typescript
export async function exportToEDiscovery(request: ExportDocumentRequest) {
  if (!process.env.EDISCOVERY_PROVIDER) {
    console.warn("eDiscovery integration not configured. Export skipped.");
    return { success: false, warning: "eDiscovery integration unavailable" };
  }

  // ... actual implementation
}
```

### Status
- **Connector framework:** Complete
- **Provider implementations:** Stub methods
- **Production backend:** Not configured
- **Next steps:** Determine if NPDC uses Relativity, Nuix, or other platform

---

## 10. Multimedia Processing (Framework)

### Purpose
Extend redaction capabilities to audio, video, and image files.

### 10.1 Audio Redaction (Azure Speech-to-Text)

**Protocol:** REST API
**Authentication:** Subscription key (AZURE_SPEECH_KEY)
**Endpoint:** Region-specific (e.g., https://australiaeast.api.cognitive.microsoft.com/)

**Workflow:**
1. Upload audio file (MP3, WAV, M4A) to Speech-to-Text batch API
2. Poll for transcription completion
3. Download transcript with word-level timestamps
4. Convert transcript to Veil "pages" (1 page per minute of audio)
5. AI detection runs on transcript text
6. Generate redaction spec with time ranges (start/end seconds)
7. Use FFmpeg to silence audio segments:
   ```bash
   ffmpeg -i input.mp3 -af "volume=0:enable='between(t,10,15)'" output.mp3
   ```

**Output Format:**
```typescript
{
  pages: [
    {
      pageNumber: 1,              // Minute 0-1
      text: "This is Jane Smith calling from NPDC...",
      timeRange: { start: 0, end: 60 }
    },
    {
      pageNumber: 2,              // Minute 1-2
      text: "Regarding the Planning consent for 123 High Street...",
      timeRange: { start: 60, end: 120 }
    }
  ],
  detections: [
    {
      text: "Jane Smith",
      pageNumber: 1,
      timeRange: { start: 4.2, end: 5.1 },
      confidence: 0.95,
      ground: "s7(2)(a)"
    }
  ]
}
```

**Graceful Degradation:**
```typescript
if (!process.env.AZURE_SPEECH_KEY) {
  return {
    pages: [{ pageNumber: 1, text: "[Audio transcription unavailable]" }],
    warning: "Speech-to-Text not configured"
  };
}
```

### 10.2 Video Redaction (Azure Video Indexer)

**Protocol:** REST API + ARM authentication
**Authentication:** Azure AD service principal
**Endpoint:** https://api.videoindexer.ai

**Workflow:**
1. Upload video (MP4, AVI, MOV) to Video Indexer
2. Poll for indexing completion (OCR, faces, transcript, keywords)
3. Extract insights:
   - **Transcript:** Word-level timestamps (same as audio)
   - **Faces:** Bounding boxes per frame
   - **OCR:** Text visible in video (e.g., on-screen documents)
4. AI detection runs on transcript + OCR text
5. Generate redaction spec with time ranges + bounding boxes
6. Use FFmpeg to blur faces and overlay black boxes:
   ```bash
   ffmpeg -i input.mp4 -filter_complex \
     "[0:v]drawbox=x=100:y=200:w=150:h=150:color=black:t=fill:enable='between(t,10,15)'[out]" \
     -map "[out]" output.mp4
   ```

**Graceful Degradation:**
```typescript
if (!process.env.AZURE_VIDEO_INDEXER_ACCOUNT_ID) {
  return {
    pages: [{ pageNumber: 1, text: "[Video indexing unavailable]" }],
    warning: "Video Indexer not configured"
  };
}
```

### 10.3 Image Redaction (Azure Computer Vision)

**Protocol:** REST API
**Authentication:** Subscription key (AZURE_COMPUTER_VISION_KEY)
**Endpoint:** Region-specific

**Workflow:**
1. Upload image (JPEG, PNG) to Computer Vision API
2. Call **Analyze API** (faces, objects, text)
3. Call **Read API** (OCR for text regions)
4. AI detection runs on extracted text
5. Generate redaction spec with pixel coordinates
6. Use ImageMagick or Sharp.js to draw black rectangles:
   ```typescript
   import sharp from 'sharp';

   const image = sharp('input.jpg');
   const metadata = await image.metadata();

   const overlay = Buffer.from(
     `<svg width="${metadata.width}" height="${metadata.height}">
       <rect x="100" y="200" width="150" height="50" fill="black"/>
     </svg>`
   );

   await image
     .composite([{ input: overlay }])
     .toFile('output.jpg');
   ```

**Graceful Degradation:**
```typescript
if (!process.env.AZURE_COMPUTER_VISION_KEY) {
  return {
    pages: [{ pageNumber: 1, text: "[Image analysis unavailable]" }],
    warning: "Computer Vision not configured"
  };
}
```

### Status
- **APIs:** All stub implementations return mock data
- **Configuration:** Optional (graceful degradation when absent)
- **UI:** Multimedia upload not yet enabled
- **Next steps:** Enable audio/video/image upload in ingest UI, wire to processing APIs

---

## 11. Application Insights (Telemetry)

### Purpose
Distributed tracing, performance monitoring, error tracking, and usage analytics.

### Implementation Details

| Aspect | Details |
|--------|---------|
| **SDK** | `applicationinsights` (v2.x) |
| **Initialization** | `instrumentation.ts` (Node.js `--require` hook) |
| **Configuration** | APPLICATIONINSIGHTS_CONNECTION_STRING |

### Instrumentation Setup

**instrumentation.ts:**
```typescript
import * as appInsights from 'applicationinsights';

if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  appInsights
    .setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
    .setAutoDependencyCorrelation(true)
    .setAutoCollectRequests(true)
    .setAutoCollectPerformance(true, true)
    .setAutoCollectExceptions(true)
    .setAutoCollectDependencies(true)
    .setAutoCollectConsole(true, true)
    .setUseDiskRetryCaching(true)
    .start();

  console.log("Application Insights initialized");
}
```

**Next.js Integration:**
```typescript
// next.config.js
module.exports = {
  experimental: {
    instrumentationHook: true
  }
};

// instrumentation.ts is auto-loaded on server start
```

### Telemetry Functions

**1. trackException**
```typescript
import { getAppInsightsClient } from '@/lib/telemetry';

try {
  // ... risky operation
} catch (error) {
  getAppInsightsClient()?.trackException({
    exception: error as Error,
    properties: {
      userId: session?.user?.id,
      projectId: projectId,
      operation: "redact-documents"
    }
  });
  throw error;
}
```

**2. trackEvent**
```typescript
getAppInsightsClient()?.trackEvent({
  name: "DocumentRedacted",
  properties: {
    documentId: doc.id,
    redactionCount: detections.length,
    aiUsed: detections.some(d => d.source === "ai"),
    duration: performance.now() - startTime
  }
});
```

**3. trackMetric**
```typescript
getAppInsightsClient()?.trackMetric({
  name: "RedactionAccuracy",
  value: (truePositives / totalDetections) * 100,
  properties: {
    projectId: projectId,
    reviewerId: reviewer.id
  }
});
```

**4. trackDependency**
```typescript
const startTime = Date.now();
const success = true;

try {
  const result = await azureOpenAI.chat.completions.create(...);
} catch (error) {
  success = false;
  throw error;
} finally {
  getAppInsightsClient()?.trackDependency({
    target: "Azure OpenAI",
    name: "chat.completions.create",
    data: "GPT-4o batch analysis",
    duration: Date.now() - startTime,
    resultCode: success ? 200 : 500,
    success: success,
    dependencyTypeName: "HTTP"
  });
}
```

### Client-Side Error Reporting

**API Route:** `/api/telemetry/error`
```typescript
// Client component:
try {
  // ... operation
} catch (error) {
  fetch('/api/telemetry/error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: error.message,
      stack: error.stack,
      url: window.location.href
    })
  }).catch(() => {}); // Fire-and-forget
}
```

**Server handler:**
```typescript
export async function POST(request: Request) {
  const { message, stack, url } = await request.json();

  getAppInsightsClient()?.trackException({
    exception: new Error(message),
    properties: { stack, url, source: "client" }
  });

  return new Response("OK", { status: 200 });
}
```

### No-Op Mode

When `APPLICATIONINSIGHTS_CONNECTION_STRING` is absent:
```typescript
export function getAppInsightsClient() {
  return appInsights.defaultClient || null;
}

// All track* calls are safe:
getAppInsightsClient()?.trackEvent(...);  // No-op if null
```

### Monitored Metrics
- Request duration (API routes, server actions)
- Dependency duration (Azure OpenAI, Document Intelligence, database queries)
- Exception rate (grouped by error type)
- Custom events (document uploaded, redaction applied, review submitted)
- Performance counters (memory, CPU, active requests)

---

## 12. Progressive Web App (Offline Support)

### Purpose
Enable offline access to previously viewed documents and cached UI assets for fieldwork scenarios.

### Service Worker Architecture

**sw.js (Static Service Worker):**
```javascript
const CACHE_VERSION = 'veil-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

// Install: cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return cache.addAll([
        '/',
        '/offline.html',
        '/_next/static/css/main.css',
        '/_next/static/js/main.js',
        '/icons/icon-192.png',
        '/icons/icon-512.png'
      ]);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key.startsWith('veil-') && key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: cache-first for static, network-first for API/pages
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: network-first (with cache fallback)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || fetch('/offline.html')))
    );
    return;
  }

  // Static assets: cache-first
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request))
    );
    return;
  }

  // Pages: network-first (with offline fallback)
  event.respondWith(
    fetch(request)
      .then(response => {
        const clone = response.clone();
        caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached || caches.match('/offline.html')))
  );
});
```

### Web App Manifest

**manifest.json:**
```json
{
  "name": "Veil - Document Redaction Platform",
  "short_name": "Veil",
  "description": "LGOIMA-compliant document redaction and disclosure workflow",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1a1a1a",
  "theme_color": "#3b82f6",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

### Service Worker Registration

**components/sw-register.tsx (Client Component):**
```typescript
'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(registration => {
          console.log('Service Worker registered:', registration.scope);

          // Check for updates every 60 seconds
          setInterval(() => {
            registration.update();
          }, 60000);
        })
        .catch(error => {
          console.error('Service Worker registration failed:', error);
        });
    }
  }, []);

  return null;
}
```

**app/layout.tsx:**
```typescript
import { ServiceWorkerRegister } from '@/components/sw-register';

export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#3b82f6" />
      </head>
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
```

### Offline Fallback Page

**public/offline.html:**
```html
<!DOCTYPE html>
<html>
<head>
  <title>Offline - Veil</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background: #1a1a1a;
      color: #fff;
    }
    .container {
      text-align: center;
      max-width: 400px;
      padding: 2rem;
    }
    h1 { margin: 0 0 1rem; }
    p { color: #999; }
    button {
      margin-top: 1rem;
      padding: 0.75rem 1.5rem;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 0.5rem;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>You're Offline</h1>
    <p>Veil requires an internet connection to access new content. Previously viewed documents may still be available.</p>
    <button onclick="window.location.reload()">Try Again</button>
  </div>
</body>
</html>
```

### Offline Capabilities
- **Cached UI:** Core app shell loads instantly
- **Cached API responses:** Previously fetched data available offline
- **Cached documents:** Recently viewed PDFs accessible without network
- **Graceful degradation:** Clear messaging when network required
- **Background sync:** Pending actions queued for when connection restored

### Limitations
- **Document upload:** Requires network (files too large for cache)
- **AI processing:** Requires network (Azure OpenAI)
- **Collaboration:** Requires network (real-time updates)

---

## 13. Integration Maturity Summary

| Integration | Status | Protocol | Auth Method | Graceful Degradation |
|-------------|--------|----------|-------------|---------------------|
| **Azure OpenAI** | LIVE | REST API | API Key | Yes (returns empty AI detections) |
| **Azure Document Intelligence** | LIVE | REST API | Azure Key Credential | Yes (throws OCRUnavailableError) |
| **PyMuPDF** | LIVE | Subprocess (JSON IPC) | N/A | Yes (fallback to pdf-lib for non-PDF) |
| **Azure Communication Services** | LIVE | REST API (LRO polling) | Connection String | Yes (console.log in dev mode) |
| **Azure AD / Entra ID** | LIVE | OAuth 2.0 / OIDC | OAuth | No (SSO required for auth) |
| **SCIM 2.0 Provisioning** | LIVE | REST API | Bearer Token | Yes (manual user creation) |
| **Application Insights** | LIVE | Auto-instrumentation | Connection String | Yes (no-op when not configured) |
| **Progressive Web App** | LIVE | Service Worker | N/A | Yes (app works without offline support) |
| **Microsoft 365** | FRAMEWORK | Microsoft Graph API | OAuth 2.0 client credentials | Yes (returns stub data) |
| **Records Management** | FRAMEWORK | REST API (provider-specific) | OAuth 2.0 client credentials | Yes (returns stub data) |
| **eDiscovery** | FRAMEWORK | REST API (provider-specific) | Bearer Token + API Key | Yes (returns stub data) |
| **Azure Speech-to-Text** | FRAMEWORK | REST API | Subscription Key | Yes (returns "[Audio unavailable]") |
| **Azure Video Indexer** | FRAMEWORK | REST API + ARM | Azure AD service principal | Yes (returns "[Video unavailable]") |
| **Azure Computer Vision** | FRAMEWORK | REST API | Subscription Key | Yes (returns "[Image unavailable]") |

### Maturity Definitions

**LIVE:**
- Fully implemented and tested
- Active use in production workflows
- Monitoring and alerting configured
- Comprehensive error handling

**FRAMEWORK:**
- API interfaces defined and implemented
- Graceful degradation when not configured
- Returns stub/mock data for UI development
- Ready for configuration once backend available

### Next Steps for Framework Integrations

1. **Microsoft 365:** Add "Import from SharePoint" button to ingest UI
2. **Records Management:** Obtain NPDC EDRMS credentials and configure provider
3. **eDiscovery:** Determine NPDC platform (Relativity/Nuix) and configure
4. **Multimedia:** Enable audio/video/image upload, test Azure Cognitive Services

---

## Appendix: Resilience Patterns

### Circuit Breaker Pattern (used by Azure OpenAI, Document Intelligence)

```typescript
class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime: number | null = null;

  constructor(
    private failureThreshold: number,
    private resetTimeout: number,
    private halfOpenTimeout: number
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime! > this.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failureCount = 0;
      }
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.failureCount >= this.failureThreshold) {
        this.state = 'OPEN';
      }
      throw error;
    }
  }
}
```

### Retry Pattern with Exponential Backoff

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000,
  maxDelay = 15000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries - 1) {
        const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}
```

---

**Document Control:**
- **Author:** Veil Technical Team
- **Reviewers:** Solution Architect, Security Team
- **Next Review:** 2026-04-15
