# Data Architecture

## 1. Database Overview

Veil uses **PostgreSQL 16** as its relational database, accessed via **Prisma ORM v7** with the `@prisma/adapter-pg` driver.

**Key characteristics:**

- **18 database models** defined in `prisma/schema.prisma`
- **17+ migrations** applied via `prisma migrate`
- **Prisma client singleton** cached via `globalThis` to survive Next.js Hot Module Replacement (HMR)
- **Connection pooling** via PrismaPg adapter for optimal performance
- **Type-safe queries** generated at build time from schema

**Connection initialization:**

```typescript
// lib/db.ts
import { Pool } from '@neondatabase/serverless';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
```

**Environment configuration:**

- `DATABASE_URL`: PostgreSQL connection string
- Local development: `postgresql://postgres:postgres@localhost:5432/veil`
- Production: Azure Database for PostgreSQL Flexible Server

---

## 2. Entity Relationship Diagram (ASCII)

```
┌──────────────┐
│  Department  │
└──────┬───────┘
       │
       │ 1:N
       ▼
┌──────────────┐          ┌──────────────┐
│     User     │──────────│  AuditEntry  │
└──────┬───────┘   1:N    └──────┬───────┘
       │                          │
       │                          │ N:1
       │                          ▼
       │                   ┌──────────────┐
       │                   │     Case     │──────┐
       │                   └──────┬───────┘      │
       │                          │              │ 1:N
       │                          │ 1:N          ▼
       │                          ▼         ┌────────────────┐
       │                   ┌──────────────┐ │ CaseMilestone  │
       │                   │   Document   │ └────────┬───────┘
       │                   └──────┬───────┘          │
       │                          │                  │ 1:N
       │                          │                  ▼
       │                          │          ┌────────────────┐
       │                          │          │ CaseAssignment │
       │                          │          └────────────────┘
       │                          │
       ├──────────────────────────┼──────────────────────────┐
       │                          │                          │
       │ 1:N                      │ 1:N                      │ 1:N
       ▼                          ▼                          ▼
┌──────────────┐          ┌──────────────┐          ┌────────────────────┐
│ DocumentPage │          │  Detection   │          │ DetectionSnapshot  │
└──────────────┘          └──────┬───────┘          └────────────────────┘
                                 │
                                 ├────────────┬─────────────┐
                                 │            │             │
                                 │ 1:N        │ 1:1         │
                                 ▼            ▼             │
                          ┌──────────────┐  ┌────────────────┐
                          │DetectionHist.│  │FeedbackExample │
                          └──────────────┘  └────────────────┘

STANDALONE ENTITIES (no foreign keys):
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  FileUpload  │  │SystemSetting │  │  CustomRule  │  │ActivationCode│
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘

┌──────────────┐  ┌──────────────┐
│UserInvitation│  │ProcessingJob │
└──────────────┘  └──────────────┘
```

**Relationship summary:**

| Parent Model | Child Model | Type | Cascade Delete |
|--------------|-------------|------|----------------|
| Department | User | 1:N | No |
| User | AuditEntry | 1:N | No |
| Case | AuditEntry | 1:N | No |
| Case | Document | 1:N | Yes |
| Case | CaseMilestone | 1:N | Yes |
| CaseMilestone | CaseAssignment | 1:N | Yes |
| Document | DocumentPage | 1:N | Yes |
| Document | Detection | 1:N | Yes |
| Document | DetectionSnapshot | 1:N | Yes |
| Detection | DetectionHistory | 1:N | Yes |
| Detection | FeedbackExample | 1:1 | Yes |

---

## 3. Model Reference

### 3.1 User

**Purpose:** Represents a user of the Veil system with authentication, authorization, and profile information.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | cuid() | Primary key |
| email | String | - | Unique email address |
| name | String? | null | Display name |
| passwordHash | String | - | Hashed password (bcrypt) |
| role | UserRole | SME | SME, LEGAL, ADMIN, SUPERADMIN |
| departmentId | String? | null | Foreign key to Department |
| department | Department? | - | Relation to Department |
| createdAt | DateTime | now() | Record creation timestamp |
| updatedAt | DateTime | @updatedAt | Last update timestamp |

**Indexes:**
- Unique: `email`

---

### 3.2 Department

**Purpose:** Organizational unit for grouping users.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | cuid() | Primary key |
| name | String | - | Department name (unique) |
| createdAt | DateTime | now() | Record creation timestamp |
| users | User[] | - | Related users |

**Indexes:**
- Unique: `name`

---

### 3.3 Case

**Purpose:** A LGOIMA request case containing documents to be reviewed and redacted.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | cuid() | Primary key |
| caseNumber | String | - | Human-readable case identifier (unique) |
| title | String | - | Case title/description |
| requester | String | - | Name of LGOIMA requester |
| dateReceived | DateTime | - | Date request was received |
| dueDate | DateTime | - | Statutory response deadline |
| status | CaseStatus | INTAKE | INTAKE, PROCESSING, REVIEW, EXPORT, RELEASED |
| currentStage | String | "intake" | Workflow stage identifier |
| documentCount | Int | 0 | Denormalized: total documents |
| reviewedCount | Int | 0 | Denormalized: reviewed documents |
| redactionCount | Int | 0 | Denormalized: total redactions |
| createdAt | DateTime | now() | Record creation timestamp |
| updatedAt | DateTime | @updatedAt | Last update timestamp |
| documents | Document[] | - | Related documents |
| milestones | CaseMilestone[] | - | Workflow milestones |
| auditEntries | AuditEntry[] | - | Audit trail |

**Indexes:**
- Unique: `caseNumber`

---

### 3.4 Document

**Purpose:** A single document file within a case, with processing status and metadata.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | cuid() | Primary key |
| caseId | String | - | Foreign key to Case |
| case | Case | - | Parent case |
| filename | String | - | Original filename |
| storageKey | String | - | Blob storage key |
| contentHash | String | - | SHA-256 hash for deduplication |
| mimeType | String | - | MIME type (e.g., application/pdf) |
| sizeBytes | BigInt | - | File size |
| pageCount | Int | 0 | Number of pages |
| status | DocumentStatus | PENDING | PENDING, PROCESSING, REVIEW, APPROVED, REJECTED |
| processingStatus | String? | null | Pipeline stage (e.g., "ocr", "detection") |
| errorMessage | String? | null | Processing error details |
| contentJson | Json? | null | Parsed content (DocParagraph[]) |
| detectionCount | Int | 0 | Denormalized: total detections |
| avgConfidence | Float? | null | Denormalized: average detection confidence |
| assignedTo | String? | null | User ID of assigned reviewer |
| assignee | User? | - | Relation to assigned user |
| uploadedAt | DateTime | now() | Upload timestamp |
| processedAt | DateTime? | null | Processing completion timestamp |
| pages | DocumentPage[] | - | Related pages |
| detections | Detection[] | - | Related detections |
| snapshots | DetectionSnapshot[] | - | Detection snapshots |

**Indexes:**
- `caseId`
- `status`
- `contentHash`

---

### 3.5 DocumentPage

**Purpose:** Individual page within a document with OCR text and layout.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | cuid() | Primary key |
| documentId | String | - | Foreign key to Document |
| document | Document | - | Parent document |
| pageNumber | Int | - | Page number (1-indexed) |
| width | Float | - | Page width (points) |
| height | Float | - | Page height (points) |
| textContent | String | "" | Extracted text (full page) |
| textJson | Json? | null | Structured text (layout blocks) |
| thumbnailUrl | String? | null | Optional thumbnail image URL |
| createdAt | DateTime | now() | Record creation timestamp |

**Indexes:**
- Unique: `(documentId, pageNumber)`

---

### 3.6 Detection

**Purpose:** A detected sensitive item requiring redaction, with AI metadata and human review status.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | cuid() | Primary key |
| documentId | String | - | Foreign key to Document |
| document | Document | - | Parent document |
| page | Int | - | Page number (1-indexed) |
| type | DetectionType | - | PERSON, EMAIL, PHONE, ADDRESS, etc. |
| text | String | - | Detected text content |
| confidence | Float | - | AI confidence score (0-1) |
| status | DetectionStatus | PENDING | PENDING, ACCEPTED, REJECTED |
| withholdingGround | String? | null | LGOIMA section (e.g., "s7(2)(a)") |
| reasoning | String? | null | AI or human reasoning |
| posX | Float | - | Bounding box X (normalized 0-1) |
| posY | Float | - | Bounding box Y (normalized 0-1) |
| width | Float | - | Bounding box width (normalized 0-1) |
| height | Float | - | Bounding box height (normalized 0-1) |
| reviewedBy | String? | null | User ID of reviewer |
| reviewedAt | DateTime? | null | Review timestamp |
| createdAt | DateTime | now() | Detection creation timestamp |
| history | DetectionHistory[] | - | Audit history for this detection |
| feedbackExample | FeedbackExample? | - | Optional feedback for model tuning |

**Indexes:**
- `documentId`
- `status`

---

### 3.7 AuditEntry

**Purpose:** Immutable audit trail with hash chaining for tamper detection.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | cuid() | Primary key |
| timestamp | DateTime | now() | Action timestamp |
| userId | String | - | Foreign key to User |
| user | User | - | User who performed action |
| caseId | String? | null | Foreign key to Case (if applicable) |
| case | Case? | - | Related case |
| action | String | - | Action type (e.g., "ACCEPT_DETECTION") |
| entityType | String | - | Entity type (e.g., "Detection") |
| entityId | String | - | Entity ID |
| details | Json? | null | Additional action details (JSON) |
| ipAddress | String? | null | IP address of user |
| userAgent | String? | null | Browser user agent |
| previousHash | String? | null | Hash of previous audit entry |
| currentHash | String | - | SHA-256 hash of this entry |

**Indexes:**
- `caseId`
- `timestamp`
- `userId`

**Hash chain computation:**
```typescript
const dataToHash = [
  entry.timestamp.toISOString(),
  entry.userId,
  entry.action,
  entry.entityType,
  entry.entityId,
  JSON.stringify(entry.details || {}),
  entry.previousHash || ''
].join('|');

const currentHash = crypto.createHash('sha256').update(dataToHash).digest('hex');
```

---

### 3.8 FileUpload

**Purpose:** Metadata for uploaded files (originals and exports).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | cuid() | Primary key |
| filename | String | - | Original filename |
| storageKey | String | - | Blob storage key |
| mimeType | String | - | MIME type |
| sizeBytes | BigInt | - | File size |
| hash | String | - | SHA-256 content hash |
| uploadedBy | String | - | User ID of uploader |
| uploadedAt | DateTime | now() | Upload timestamp |

**No indexes** (standalone table, infrequently queried).

---

### 3.9 SystemSetting

**Purpose:** Application-wide configuration stored as key-value JSON.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | cuid() | Primary key |
| key | String | - | Setting key (unique) |
| value | Json | - | Setting value (JSON) |
| updatedBy | String | - | User ID of last updater |
| updatedAt | DateTime | @updatedAt | Last update timestamp |

**Indexes:**
- Unique: `key`

**Example keys:**
- `activation_status`
- `instance_config`
- `org_identity`
- `org_branding`
- `confidence_thresholds`

---

### 3.10 DetectionHistory

**Purpose:** Audit trail for changes to a detection (status, ground, reasoning).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | cuid() | Primary key |
| detectionId | String | - | Foreign key to Detection |
| detection | Detection | - | Parent detection |
| action | String | - | Action type (e.g., "ACCEPTED", "REJECTED") |
| userId | String | - | User ID of actor |
| timestamp | DateTime | now() | Action timestamp |
| previousStatus | DetectionStatus? | null | Status before change |
| newStatus | DetectionStatus | - | Status after change |
| previousGround | String? | null | Withholding ground before change |
| newGround | String? | null | Withholding ground after change |
| notes | String? | null | User-provided notes |

**Indexes:**
- `detectionId`

---

### 3.11 CustomRule

**Purpose:** User-defined pattern-based redaction rules.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | cuid() | Primary key |
| name | String | - | Rule name |
| description | String? | null | Rule description |
| pattern | String | - | Regex pattern |
| enabled | Boolean | true | Whether rule is active |
| createdBy | String | - | User ID of creator |
| createdAt | DateTime | now() | Creation timestamp |
| updatedAt | DateTime | @updatedAt | Last update timestamp |

**No indexes** (small table, full scans acceptable).

---

### 3.12 CaseMilestone

**Purpose:** Workflow stage definition for a case (SME Review, Legal Review, Final Signoff).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | cuid() | Primary key |
| caseId | String | - | Foreign key to Case |
| case | Case | - | Parent case |
| stage | String | - | Stage identifier (e.g., "sme_review") |
| requiredRole | UserRole | - | Role required to complete this stage |
| status | MilestoneStatus | PENDING | PENDING, IN_PROGRESS, COMPLETED, SKIPPED |
| completedAt | DateTime? | null | Completion timestamp |
| completedBy | String? | null | User ID of completer |
| createdAt | DateTime | now() | Creation timestamp |
| assignments | CaseAssignment[] | - | User assignments for this milestone |

**Indexes:**
- `caseId`
- Unique: `(caseId, stage)`

---

### 3.13 CaseAssignment

**Purpose:** Assigns specific users to a workflow milestone.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | cuid() | Primary key |
| caseId | String | - | Foreign key to Case |
| milestoneId | String | - | Foreign key to CaseMilestone |
| milestone | CaseMilestone | - | Parent milestone |
| userId | String | - | Assigned user ID |
| assignedAt | DateTime | now() | Assignment timestamp |

**Indexes:**
- `caseId`
- `milestoneId`

---

### 3.14 DetectionSnapshot

**Purpose:** Point-in-time snapshot of all detections for a document (before export).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | cuid() | Primary key |
| documentId | String | - | Foreign key to Document |
| document | Document | - | Parent document |
| snapshotType | String | - | Snapshot type (e.g., "PRE_EXPORT") |
| detectionsJson | Json | - | Full array of detections (JSON) |
| createdBy | String | - | User ID of creator |
| createdAt | DateTime | now() | Snapshot timestamp |

**No indexes** (snapshot queries are by documentId, covered by foreign key).

---

### 3.15 FeedbackExample

**Purpose:** Store detection as training example for model fine-tuning.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | cuid() | Primary key |
| detectionId | String | - | Foreign key to Detection (unique, 1:1) |
| detection | Detection | - | Source detection |
| feedbackType | String | - | Type (e.g., "FALSE_POSITIVE", "MISSED") |
| contextBefore | String? | null | Text context before detection |
| contextAfter | String? | null | Text context after detection |
| correctLabel | String? | null | Correct detection type |
| notes | String? | null | Human annotator notes |
| createdBy | String | - | User ID of annotator |
| createdAt | DateTime | now() | Creation timestamp |

**Indexes:**
- Unique: `detectionId`

---

### 3.16 ActivationCode

**Purpose:** Pre-deployment activation codes for initial setup.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | cuid() | Primary key |
| code | String | - | Activation code (unique) |
| status | String | PENDING | PENDING, REDEEMED, EXPIRED |
| redeemedAt | DateTime? | null | Redemption timestamp |
| redeemedBy | String? | null | Email of redeemer |
| createdAt | DateTime | now() | Generation timestamp |

**Indexes:**
- `status`

---

### 3.17 UserInvitation

**Purpose:** Email-based user invitations with expiry and role assignment.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | cuid() | Primary key |
| email | String | - | Invitee email address |
| role | UserRole | SME | Role to assign |
| departmentId | String? | null | Department to assign |
| token | String | - | Unique invitation token |
| status | String | PENDING | PENDING, ACCEPTED, EXPIRED, CANCELLED |
| invitedBy | String | - | User ID of inviter |
| invitedAt | DateTime | now() | Invitation timestamp |
| expiresAt | DateTime | - | Expiry timestamp (7 days) |
| acceptedAt | DateTime? | null | Acceptance timestamp |

**Indexes:**
- `email`
- `status`

---

### 3.18 ProcessingJob

**Purpose:** Background job queue for long-running operations (OCR, detection, export).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | String | cuid() | Primary key |
| docId | String | - | Related document ID |
| jobType | String | - | Job type (e.g., "OCR", "DETECTION") |
| status | String | PENDING | PENDING, RUNNING, COMPLETED, FAILED |
| progress | Int | 0 | Progress percentage (0-100) |
| errorMessage | String? | null | Error details (if failed) |
| startedAt | DateTime? | null | Job start timestamp |
| completedAt | DateTime? | null | Job completion timestamp |
| createdAt | DateTime | now() | Job creation timestamp |

**Indexes:**
- `docId`
- `status`

---

## 4. Indexing Strategy

**Indexes improve query performance for common access patterns.**

| Table | Index | Type | Purpose |
|-------|-------|------|---------|
| User | email | Unique | Login and lookup |
| Department | name | Unique | Department uniqueness |
| Case | caseNumber | Unique | Case lookup |
| Document | caseId | Foreign key | Fetch documents for case |
| Document | status | Filter | Filter by processing status |
| Document | contentHash | Lookup | Deduplication queries |
| DocumentPage | (documentId, pageNumber) | Unique | Page uniqueness, ordered fetch |
| Detection | documentId | Foreign key | Fetch detections for document |
| Detection | status | Filter | Filter by review status |
| AuditEntry | caseId | Foreign key | Fetch audit trail for case |
| AuditEntry | timestamp | Sort | Ordered audit log retrieval |
| AuditEntry | userId | Foreign key | User activity reports |
| DetectionHistory | detectionId | Foreign key | Fetch history for detection |
| CaseMilestone | caseId | Foreign key | Fetch milestones for case |
| CaseMilestone | (caseId, stage) | Unique | Stage uniqueness per case |
| CaseAssignment | caseId | Foreign key | Fetch assignments for case |
| CaseAssignment | milestoneId | Foreign key | Fetch assignments for milestone |
| UserInvitation | email | Lookup | Find invitations by email |
| UserInvitation | status | Filter | Active invitation queries |
| ActivationCode | status | Filter | Available code queries |
| ProcessingJob | docId | Foreign key | Job status for document |
| ProcessingJob | status | Filter | Job queue queries |
| SystemSetting | key | Unique | Fast config lookup |
| FeedbackExample | detectionId | Unique | 1:1 relationship enforcement |

**Index maintenance:**
- Indexes are automatically created via Prisma migrations
- B-tree indexes used for all lookups (PostgreSQL default)
- Unique indexes enforce data integrity constraints
- Foreign key indexes improve join performance

---

## 5. Data Access Patterns

### 5.1 Case Operations

**getCases()**
```typescript
// Fetch all cases ordered by dateReceived desc
await db.case.findMany({
  orderBy: { dateReceived: 'desc' },
  include: {
    documents: { select: { id: true, status: true } }
  }
});
```

**getDashboardStats()**
```typescript
// Aggregate statistics for dashboard
const stats = {
  totalCases: await db.case.count(),
  activeCases: await db.case.count({ where: { status: { not: 'RELEASED' } } }),
  documentsInReview: await db.document.count({ where: { status: 'REVIEW' } }),
  pendingDetections: await db.detection.count({ where: { status: 'PENDING' } })
};
```

### 5.2 Document Operations

**getDocumentsForCase(caseId)**
```typescript
// Fetch all documents for a case with assignee
await db.document.findMany({
  where: { caseId },
  include: {
    assignee: { select: { id: true, name: true, email: true } }
  },
  orderBy: { filename: 'asc' }
});
```

**getQueueDocuments(userId, role)**
```typescript
// Fetch documents assigned to user or available for their role
await db.document.findMany({
  where: {
    OR: [
      { assignedTo: userId },
      { assignedTo: null, status: 'REVIEW' }
    ]
  },
  include: {
    case: { select: { caseNumber: true, title: true } }
  },
  orderBy: { uploadedAt: 'asc' }
});
```

### 5.3 Detection Operations

**getDetectionsForDocument(documentId)**
```typescript
// Fetch all detections for a document in reading order
await db.detection.findMany({
  where: { documentId },
  orderBy: [
    { page: 'asc' },
    { posY: 'asc' }
  ]
});
```

**getGroupedDetectionsForCase(caseId)**
```typescript
// Fetch detections grouped by document
const documents = await db.document.findMany({
  where: { caseId },
  include: {
    detections: {
      orderBy: [{ page: 'asc' }, { posY: 'asc' }]
    }
  }
});
```

### 5.4 Audit Operations

**createAuditEntry(data)**
```typescript
// Create audit entry with hash chain
const previous = await db.auditEntry.findFirst({
  orderBy: { timestamp: 'desc' },
  select: { currentHash: true }
});

const dataToHash = [
  new Date().toISOString(),
  data.userId,
  data.action,
  data.entityType,
  data.entityId,
  JSON.stringify(data.details || {}),
  previous?.currentHash || ''
].join('|');

const currentHash = crypto.createHash('sha256').update(dataToHash).digest('hex');

await db.auditEntry.create({
  data: {
    ...data,
    previousHash: previous?.currentHash,
    currentHash
  }
});
```

**verifyAuditIntegrity()**
```typescript
// Walk audit trail and verify hash chain
const entries = await db.auditEntry.findMany({
  orderBy: { timestamp: 'asc' }
});

for (let i = 0; i < entries.length; i++) {
  const entry = entries[i];
  const expectedPreviousHash = i > 0 ? entries[i - 1].currentHash : null;

  if (entry.previousHash !== expectedPreviousHash) {
    throw new Error(`Audit integrity violation at entry ${entry.id}`);
  }

  // Recompute hash and verify
  const recomputedHash = computeHash(entry);
  if (entry.currentHash !== recomputedHash) {
    throw new Error(`Hash mismatch at entry ${entry.id}`);
  }
}
```

### 5.5 Settings Operations

**getSetting<T>(key, defaultValue)**
```typescript
// Type-safe configuration retrieval
async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const setting = await db.systemSetting.findUnique({
    where: { key }
  });

  return setting ? (setting.value as T) : defaultValue;
}

// Usage
const thresholds = await getSetting('confidence_thresholds', {
  high: 0.85,
  medium: 0.65,
  low: 0.45
});
```

**setSetting(key, value, updatedBy)**
```typescript
// Upsert configuration value
await db.systemSetting.upsert({
  where: { key },
  update: { value, updatedBy },
  create: { key, value, updatedBy }
});
```

---

## 6. Denormalization Strategy

**Denormalization trades storage for query performance by storing computed values.**

### 6.1 Case Aggregates

**Problem:** Counting documents and detections requires expensive JOINs and COUNTs on large datasets.

**Solution:** Store computed counts directly on Case model.

| Field | Computation | Update Trigger |
|-------|-------------|----------------|
| documentCount | COUNT(documents) | Document created/deleted |
| reviewedCount | COUNT(documents WHERE status = 'APPROVED') | Document status updated |
| redactionCount | SUM(document.detectionCount WHERE status = 'ACCEPTED') | Detection status updated |

**Update pattern:**
```typescript
// After creating document
await db.case.update({
  where: { id: caseId },
  data: { documentCount: { increment: 1 } }
});

// After approving document
await db.case.update({
  where: { id: caseId },
  data: { reviewedCount: { increment: 1 } }
});
```

### 6.2 Document Aggregates

**Problem:** Computing average confidence and detection count for every document list query is expensive.

**Solution:** Store aggregates on Document model.

| Field | Computation | Update Trigger |
|-------|-------------|----------------|
| detectionCount | COUNT(detections) | Detection created/deleted |
| avgConfidence | AVG(detections.confidence) | Detection created/updated |

**Update pattern:**
```typescript
// After creating detections
const stats = await db.detection.aggregate({
  where: { documentId },
  _avg: { confidence: true },
  _count: true
});

await db.document.update({
  where: { id: documentId },
  data: {
    detectionCount: stats._count,
    avgConfidence: stats._avg.confidence
  }
});
```

### 6.3 Document Content JSON

**Problem:** Displaying document content in review UI requires fetching pages, paragraphs, and detections separately.

**Solution:** Store parsed content as JSONB on Document model.

**Schema:**
```typescript
type DocParagraph = {
  id: string;
  page: number;
  text: string;
  bbox: { x: number; y: number; width: number; height: number };
  role?: 'title' | 'heading' | 'paragraph' | 'list';
};

// Stored in document.contentJson
const content: DocParagraph[] = [ /* ... */ ];
```

**Advantages:**
- Single query retrieves full document for review
- JSONB supports indexing and querying (future: full-text search)
- Avoids N+1 query problem

### 6.4 Detection Snapshot JSON

**Problem:** Export needs exact detection state at export time, but detections may be modified later.

**Solution:** Store full detection array as JSONB snapshot.

**Schema:**
```typescript
type DetectionSnapshotData = {
  id: string;
  page: number;
  type: string;
  text: string;
  status: string;
  withholdingGround: string | null;
  bbox: { x: number; y: number; width: number; height: number };
}[];

// Stored in detectionSnapshot.detectionsJson
```

**Creation pattern:**
```typescript
// Before export, capture current state
const detections = await db.detection.findMany({
  where: { documentId }
});

await db.detectionSnapshot.create({
  data: {
    documentId,
    snapshotType: 'PRE_EXPORT',
    detectionsJson: detections.map(d => ({
      id: d.id,
      page: d.page,
      type: d.type,
      text: d.text,
      status: d.status,
      withholdingGround: d.withholdingGround,
      bbox: { x: d.posX, y: d.posY, width: d.width, height: d.height }
    })),
    createdBy: userId
  }
});
```

---

## 7. Data Lifecycle

### 7.1 Activation Flow

**State transitions for ActivationCode:**

```
1. Code Generation (deployment)
   └─> status: PENDING

2. First User Access
   └─> Checks for PENDING code
   └─> If found, shows activation form

3. Code Redemption
   └─> Validates code
   └─> Updates: status = REDEEMED, redeemedAt, redeemedBy
   └─> Creates SystemSetting: activation_status = { activated: true }

4. Organization Setup
   └─> Creates first SUPERADMIN user
   └─> Creates SystemSetting: org_identity, instance_config
   └─> Runs setup wizard (departments, users, configuration)
```

**Data created during activation:**
- ActivationCode (REDEEMED)
- SystemSetting: activation_status, org_identity, instance_config
- User (first SUPERADMIN)
- Department (at least one)

### 7.2 Case Processing Lifecycle

**State transitions for Case and Document:**

```
1. Case Created
   Case.status = INTAKE
   └─> Creates CaseMilestones: sme_review, legal_review, final_signoff

2. Documents Uploaded
   Document.status = PENDING
   └─> Updates Case.documentCount
   └─> Creates ProcessingJob (OCR)

3. Document Processing
   Document.processingStatus = "ocr" → "parsing" → "detection"
   Document.status = PROCESSING
   └─> Creates DocumentPages
   └─> Populates Document.contentJson
   └─> Creates Detections
   └─> Updates Document.detectionCount, avgConfidence

4. Processing Complete
   Document.status = REVIEW
   Document.processedAt = now()
   Case.status = PROCESSING
   └─> Document becomes available in review queue

5. SME Review
   User accepts/rejects Detections
   └─> Creates DetectionHistory entries
   └─> Creates AuditEntry for each action

   All detections reviewed:
   Document.status = APPROVED
   └─> Updates Case.reviewedCount

6. Legal Review
   Milestone.stage = "legal_review"
   Milestone.status = IN_PROGRESS
   └─> Legal reviewer re-reviews detections
   └─> May override SME decisions (tracked in DetectionHistory)

7. Final Signoff
   Milestone.stage = "final_signoff"
   └─> Final approver confirms release
   └─> All milestones completed:
       Case.status = EXPORT

8. Export
   Creates DetectionSnapshot for each document
   Generates redacted PDFs
   Creates FileUpload records for exports
   └─> Updates Case.status = RELEASED
```

### 7.3 Detection Lifecycle

**State transitions for Detection:**

```
1. Detection Created (by AI pipeline)
   status: PENDING
   confidence: 0.0-1.0
   withholdingGround: AI-suggested (may be null)
   reasoning: AI explanation

2. Human Review (SME)
   status: ACCEPTED or REJECTED
   reviewedBy: userId
   reviewedAt: now()
   withholdingGround: confirmed or updated
   reasoning: may be updated with human notes
   └─> Creates DetectionHistory entry
   └─> Creates AuditEntry

3. Legal Review (optional)
   May update withholdingGround or reasoning
   └─> Creates new DetectionHistory entry

4. Export Snapshot
   Detection state captured in DetectionSnapshot.detectionsJson
   └─> Original Detection record unchanged (audit trail)

5. Redaction Applied
   Detection used to generate black boxes in PDF export
   └─> AuditEntry created for export action
```

### 7.4 Audit Entry Lifecycle

**Immutable, append-only log:**

```
1. Created
   timestamp: now()
   action: "ACCEPT_DETECTION" (example)
   entityType: "Detection"
   entityId: detectionId
   details: { previousStatus: "PENDING", newStatus: "ACCEPTED", ... }
   previousHash: previous entry's currentHash
   currentHash: SHA-256 of this entry + previousHash

2. Chained
   Next entry uses this.currentHash as its previousHash
   └─> Creates tamper-evident chain

3. Never Updated or Deleted
   Audit entries are immutable
   └─> Integrity verification can detect tampering
```

**Integrity verification:**
- Walks entire chain from oldest to newest
- Recomputes hash for each entry
- Verifies hash matches stored currentHash
- Verifies previousHash links to actual previous entry
- Any mismatch = integrity violation

---

## 8. File Storage Strategy

### 8.1 Storage Provider Interface

**Abstraction for multiple storage backends:**

```typescript
// lib/storage.ts
export interface StorageProvider {
  upload(key: string, buffer: Buffer, mimeType: string): Promise<string>;
  download(key: string): Promise<Buffer>;
  getUrl(key: string): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
```

### 8.2 Azure Blob Storage (Production)

**Configuration:**
- Storage account: `stveilprototype`
- Container: `documents`
- Authentication: Connection string from environment variable

**Implementation:**
```typescript
import { BlobServiceClient } from '@azure/storage-blob';

export class AzureBlobStorageProvider implements StorageProvider {
  private containerClient: ContainerClient;

  constructor() {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING!;
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    this.containerClient = blobServiceClient.getContainerClient('documents');
  }

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    const blockBlobClient = this.containerClient.getBlockBlobClient(key);
    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: { blobContentType: mimeType }
    });
    return blockBlobClient.url;
  }

  async download(key: string): Promise<Buffer> {
    const blockBlobClient = this.containerClient.getBlockBlobClient(key);
    const downloadResponse = await blockBlobClient.download();
    return await streamToBuffer(downloadResponse.readableStreamBody!);
  }

  // ... other methods
}
```

### 8.3 Local Filesystem (Development)

**Configuration:**
- Base directory: `./uploads/`
- Subdirectories: `{caseId}/{docId}/`

**Implementation:**
```typescript
import fs from 'fs/promises';
import path from 'path';

export class LocalStorageProvider implements StorageProvider {
  private baseDir = './uploads';

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    const filePath = path.join(this.baseDir, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    return `file://${filePath}`;
  }

  async download(key: string): Promise<Buffer> {
    const filePath = path.join(this.baseDir, key);
    return await fs.readFile(filePath);
  }

  // ... other methods
}
```

### 8.4 File Key Format

**Structure:** `{caseId}/{docId}/{filename}`

**Examples:**
- Original file: `clx123abc/cly456def/contract.pdf`
- Export: `clx123abc/exports/redacted_2026-03-23.pdf`

**Benefits:**
- Hierarchical organization (easy to browse in Azure Storage Explorer)
- Automatic namespacing by case (avoid collisions)
- Easy to list all files for a case
- Clear separation of originals vs. exports

### 8.5 File Retention Policy

| File Type | Retention | Purpose |
|-----------|-----------|---------|
| Original documents | Permanent | Legal requirement, audit trail |
| Exported redacted files | 7 years | LGOIMA retention standard |
| Processing artifacts | 30 days | OCR results, thumbnails (can be regenerated) |
| Temporary uploads | 24 hours | Failed uploads, staging |

**Implementation:**
- Azure Blob Storage lifecycle policies (automated deletion)
- FileUpload table tracks uploadedAt for retention queries
- Soft delete enabled (30-day recovery window)

### 8.6 Hash-Based Deduplication

**Problem:** Multiple LGOIMA requests may include same document.

**Solution:** Compute SHA-256 hash on upload, check for duplicates.

```typescript
// During document upload
const hash = crypto.createHash('sha256').update(buffer).digest('hex');

const existing = await db.document.findFirst({
  where: { contentHash: hash }
});

if (existing) {
  // Link to existing file, avoid re-upload and re-processing
  await db.document.create({
    data: {
      caseId: newCaseId,
      filename: newFilename,
      storageKey: existing.storageKey, // reuse!
      contentHash: hash,
      // ... copy processing results from existing
    }
  });
} else {
  // Upload new file
  await storageProvider.upload(key, buffer, mimeType);
  await db.document.create({ /* ... */ });
}
```

**Benefits:**
- Saves storage costs
- Avoids redundant OCR/detection processing
- Maintains separate metadata per case (different reviewers, decisions)

---

## 9. Configuration Storage

**SystemSetting table stores application-wide configuration as key-value JSON.**

### 9.1 Configuration Keys

| Key | Type | Purpose | Default |
|-----|------|---------|---------|
| activation_status | { activated: boolean; activatedAt?: string; activatedBy?: string } | Tracks whether instance is activated | `{ activated: false }` |
| instance_config | { name: string; region: string; environment: string } | Instance metadata | - |
| org_identity | { name: string; legalName: string; address: string; phone: string } | Organization details | - |
| org_branding | { logo?: string; primaryColor?: string; secondaryColor?: string } | UI branding | - |
| org_signatory | { name: string; title: string; email: string } | Authorized signatory for exports | - |
| org_ombudsman | { office: string; email: string; phone: string; website: string } | Ombudsman contact info | NZ defaults |
| lgoima_config | { defaultDueDate: number; extensionDays: number; withholdingGrounds: string[] } | LGOIMA workflow settings | Statutory defaults |
| confidence_thresholds | { high: number; medium: number; low: number } | AI confidence tiers | `{ high: 0.85, medium: 0.65, low: 0.45 }` |
| detection_toggles | { enablePatterns: boolean; enableAI: boolean; enableContextual: boolean } | Feature flags | All true |
| workflow_config | { stages: string[]; requireLegal: boolean; requireFinal: boolean } | Review workflow | `{ stages: ['sme', 'legal', 'final'], requireLegal: true, requireFinal: true }` |
| notification_prefs | { emailEnabled: boolean; inAppEnabled: boolean; smtpConfig?: object } | Notification settings | In-app only |
| setup_wizard_state | { completed: boolean; currentStep: string } | Setup wizard progress | `{ completed: false, currentStep: 'welcome' }` |

### 9.2 Type-Safe Access

**Helper functions:**

```typescript
// lib/settings.ts
export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const setting = await db.systemSetting.findUnique({ where: { key } });
  return setting ? (setting.value as T) : defaultValue;
}

export async function setSetting<T>(
  key: string,
  value: T,
  updatedBy: string
): Promise<void> {
  await db.systemSetting.upsert({
    where: { key },
    update: { value, updatedBy },
    create: { key, value, updatedBy }
  });
}

// Usage with type safety
type ConfidenceThresholds = {
  high: number;
  medium: number;
  low: number;
};

const thresholds = await getSetting<ConfidenceThresholds>(
  'confidence_thresholds',
  { high: 0.85, medium: 0.65, low: 0.45 }
);
```

### 9.3 Migration Strategy

**Configuration changes during upgrades:**

```typescript
// prisma/migrations/add_new_config.ts
export async function up() {
  // Add new configuration with default value
  await db.systemSetting.upsert({
    where: { key: 'new_feature_config' },
    update: {},
    create: {
      key: 'new_feature_config',
      value: { enabled: false, threshold: 0.5 },
      updatedBy: 'system'
    }
  });
}
```

### 9.4 Configuration UI

**Admin settings page allows SUPERADMIN to edit configuration:**

- Form validation with Zod schemas
- Nested JSON editing with type safety
- Audit trail for configuration changes (via AuditEntry)
- Export/import configuration for disaster recovery

---

## 10. Backup and Recovery

### 10.1 Azure PostgreSQL Automated Backups

**Configuration:**
- Backup frequency: Daily
- Retention: 7 days
- Backup window: 02:00-03:00 NZST (low-traffic period)
- Storage: Geo-redundant (GRS) in production

**Features:**
- Point-in-time restore (any moment in last 7 days)
- Automated backup verification
- Cross-region replication (disaster recovery)

**Recovery procedure:**
```bash
# Azure CLI: Restore to specific timestamp
az postgres flexible-server restore \
  --resource-group veil-production \
  --name veil-db-restored \
  --source-server veil-db \
  --restore-time "2026-03-23T14:30:00Z"
```

### 10.2 Azure Blob Storage Redundancy

**Configuration:**
- Development: LRS (Locally Redundant Storage)
- Production: GRS (Geo-Redundant Storage)

**LRS:**
- 3 copies within single datacenter
- Protects against drive failure
- Cost-effective for development

**GRS:**
- 6 copies total (3 local + 3 in paired region)
- Protects against datacenter failure
- Automatic failover capability

**Soft delete:**
- Enabled with 30-day retention
- Allows recovery of accidentally deleted files
- Blob versioning enabled (all modifications tracked)

### 10.3 Application-Level Backup

**Backup script:** `lib/backup-restore.ts`

**Full backup includes:**
1. Database dump (PostgreSQL pg_dump)
2. SystemSetting export (JSON)
3. File manifest (list of all blob storage keys)
4. Audit trail export (AuditEntry chain)

**Backup procedure:**
```typescript
// lib/backup-restore.ts
export async function createBackup(): Promise<BackupManifest> {
  const timestamp = new Date().toISOString();

  // 1. Export database schema + data
  const dbDump = await execAsync('pg_dump $DATABASE_URL');

  // 2. Export all SystemSettings
  const settings = await db.systemSetting.findMany();

  // 3. Generate file manifest
  const files = await db.fileUpload.findMany({
    select: { storageKey: true, hash: true, sizeBytes: true }
  });

  // 4. Export audit trail
  const auditEntries = await db.auditEntry.findMany({
    orderBy: { timestamp: 'asc' }
  });

  // 5. Verify audit integrity
  await verifyAuditIntegrity();

  // 6. Package and upload to backup storage
  const manifest = {
    timestamp,
    version: '1.0',
    database: dbDump,
    settings,
    files,
    auditEntries
  };

  await uploadBackup(manifest, `backups/veil-backup-${timestamp}.json`);

  return manifest;
}
```

**Restore procedure:**
```typescript
export async function restoreBackup(manifestKey: string): Promise<void> {
  // 1. Download and validate manifest
  const manifest = await downloadBackup(manifestKey);

  // 2. Restore database
  await execAsync(`psql $DATABASE_URL < ${manifest.database}`);

  // 3. Restore SystemSettings
  for (const setting of manifest.settings) {
    await db.systemSetting.upsert({
      where: { key: setting.key },
      update: setting,
      create: setting
    });
  }

  // 4. Verify file integrity
  for (const file of manifest.files) {
    const exists = await storageProvider.exists(file.storageKey);
    if (!exists) {
      console.warn(`Missing file: ${file.storageKey}`);
    }
  }

  // 5. Verify audit integrity
  await verifyAuditIntegrity();
}
```

### 10.4 Audit Trail Integrity

**Hash chain provides tamper detection:**

```typescript
export async function verifyAuditIntegrity(): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const entries = await db.auditEntry.findMany({
    orderBy: { timestamp: 'asc' }
  });

  const errors: string[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const expectedPreviousHash = i > 0 ? entries[i - 1].currentHash : null;

    // Check hash chain link
    if (entry.previousHash !== expectedPreviousHash) {
      errors.push(
        `Entry ${entry.id}: previousHash mismatch (expected ${expectedPreviousHash}, got ${entry.previousHash})`
      );
    }

    // Recompute hash
    const recomputedHash = computeAuditHash(entry);
    if (entry.currentHash !== recomputedHash) {
      errors.push(
        `Entry ${entry.id}: currentHash mismatch (expected ${recomputedHash}, got ${entry.currentHash})`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
```

**Recovery from integrity violation:**
- If tampering detected, restore from last known-good backup
- Audit entries are immutable - no in-place repair possible
- Investigation required to determine cause (malicious vs. corruption)

### 10.5 Backup Schedule

| Backup Type | Frequency | Retention | Storage Location |
|-------------|-----------|-----------|------------------|
| Azure PostgreSQL automated | Daily | 7 days | Azure backup vault |
| Application full backup | Weekly | 4 weeks | Azure Blob Storage (backup container) |
| Configuration snapshot | On change | 12 versions | Azure Blob Storage |
| Audit trail export | Monthly | 7 years | Azure Blob Storage (archive tier) |

### 10.6 Disaster Recovery Plan

**RTO (Recovery Time Objective):** 4 hours
**RPO (Recovery Point Objective):** 24 hours

**Recovery steps:**

1. **Database failure:**
   - Restore from Azure automated backup (15 minutes)
   - Verify audit integrity
   - Resume operations

2. **Blob storage failure:**
   - Failover to GRS secondary region (automatic)
   - Update connection strings
   - Verify file access

3. **Complete region failure:**
   - Deploy new infrastructure in paired region
   - Restore database from geo-redundant backup
   - Restore files from GRS secondary
   - Update DNS to point to new region
   - Verify audit integrity

4. **Data corruption:**
   - Identify corruption scope via audit trail
   - Restore from application backup to timestamp before corruption
   - Re-process any work done since backup (if possible)
   - Document incident and update procedures

---

## Summary

The Veil data architecture provides:

1. **Robust relational model** with 18 entities supporting LGOIMA workflow
2. **Performance optimization** via strategic indexing and denormalization
3. **Audit integrity** with hash-chained, immutable audit trail
4. **Flexible storage** with abstracted interface (Azure Blob + local dev)
5. **Type-safe configuration** via JSON key-value settings
6. **Comprehensive backup** with automated daily backups and application-level export/import
7. **Disaster recovery** with geo-redundant storage and documented recovery procedures

This architecture supports the prototype requirements and provides a clear path to production-grade deployment for New Plymouth District Council.
