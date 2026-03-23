# Application Architecture

**Document:** Application Architecture Specification
**System:** Veil — AI-Powered Document Redaction Platform
**Version:** 1.0
**Last Updated:** 2026-03-23

---

## Overview

This document details the application architecture of Veil, including the module structure, processing pipelines, state machines, and content models that implement the LGOIMA disclosure workflow.

---

## 1. Application Structure

Veil is built on **Next.js 15** with the App Router architecture and TypeScript for type safety across the entire codebase.

### Core Architectural Patterns

**Server Components (Default)**
- Used for all data fetching operations
- Direct Prisma queries executed server-side
- Async/await pattern for database operations
- Zero client-side JavaScript shipped for static content
- Example: `app/documents/[id]/page.tsx` fetches document data server-side

**Client Components ("use client")**
- Required for interactive UI elements
- Event handlers (onClick, onChange, onSubmit)
- Browser APIs (localStorage, window, document)
- React hooks (useState, useEffect, useContext)
- Third-party libraries requiring browser environment
- Example: `components/detection-reviewer.tsx` for interactive redaction review

**Server Actions (lib/actions/)**
- Progressive enhancement for form submissions
- Direct database mutations with authorization checks
- Automatic revalidation of affected routes
- Type-safe with zod schema validation
- Example: `lib/actions/accept-detection.ts`, `lib/actions/upload-documents.ts`

**API Routes (app/api/)**
- REST endpoints for non-form interactions
- File uploads requiring streaming
- Webhook handlers
- Third-party integrations
- Example: `app/api/documents/[id]/download/route.ts`

**Rendering Strategy**
```typescript
export const dynamic = 'force-dynamic';
export const revalidate = 0;
```
- No static site generation (SSG)
- No incremental static regeneration (ISR)
- All pages force-dynamic to ensure LGOIMA data freshness
- Critical for audit compliance and multi-user review workflows

---

## 2. Module Architecture

Veil follows a strict layered architecture to enforce separation of concerns and maintainability.

```
┌─────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                         │
│  app/ (pages, layouts)                                      │
│  components/ (ui, domain components)                        │
│  - Server Components for data display                       │
│  - Client Components for interactivity                      │
│  - Tailwind CSS for styling                                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  API LAYER                                                  │
│  app/api/ (REST endpoints)                                  │
│  lib/actions/ (Server Actions)                              │
│  - Request validation (zod schemas)                         │
│  - Authentication/authorization checks                      │
│  - Response formatting                                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  BUSINESS LOGIC LAYER                                       │
│  lib/pipeline/ (document processing pipeline)               │
│  lib/rules/ (custom rule engine)                            │
│  lib/redaction/ (redaction application logic)               │
│  lib/export/ (package generation logic)                     │
│  - Core domain logic                                        │
│  - Business rules enforcement                               │
│  - Workflow orchestration                                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  DATA ACCESS LAYER                                          │
│  lib/data/ (data access patterns)                           │
│  lib/db/ (Prisma client, migrations)                        │
│  - Database queries (Prisma ORM)                            │
│  - Transaction management                                   │
│  - Query optimization                                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE LAYER                                       │
│  lib/storage/ (Azure Blob Storage)                          │
│  lib/queue/ (async job processing)                          │
│  lib/resilience/ (retry, circuit breaker, rate limiting)    │
│  lib/email/ (Azure Communication Email)                     │
│  lib/ai/ (Azure OpenAI integration)                         │
│  - External service integrations                            │
│  - Resilience patterns                                      │
│  - Infrastructure abstractions                              │
└─────────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

**Presentation Layer**
- Renders UI based on server-fetched data
- Handles user input and events
- No business logic
- No direct database access

**API Layer**
- Validates incoming requests
- Enforces authentication and authorization
- Delegates to business logic layer
- Formats responses

**Business Logic Layer**
- Implements core domain logic
- Coordinates between data and infrastructure layers
- Enforces business rules and constraints
- Manages complex workflows

**Data Access Layer**
- Abstracts database operations
- Provides type-safe data access
- Manages transactions and consistency
- Optimizes query performance

**Infrastructure Layer**
- Integrates with external services
- Implements resilience patterns (retry, circuit breaker)
- Handles asynchronous operations
- Manages service failures gracefully

---

## 3. Document Processing Pipeline

The document processing pipeline (`lib/pipeline/process.ts`) implements a **12-stage sequential pipeline** that transforms uploaded files into reviewable documents with AI-detected sensitive content.

### Pipeline Stages

```
┌──────────────────────────────────────────────────────────┐
│ Stage 1: File Download                                  │
│ - Retrieve file from Azure Blob Storage                 │
│ - Stream to memory/tmp for processing                   │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│ Stage 2: Size Guard                                     │
│ - Check file size ≤ 100 MB                              │
│ - Reject oversized files with clear error              │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│ Stage 3: File Integrity Validation                      │
│ - Verify magic bytes match claimed file type            │
│ - Structure checks (ZIP, PDF, DOCX headers)             │
│ - Detect corrupted/encrypted files                      │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│ Stage 4: Text Extraction                                │
│ - PDF/Images: Azure Document Intelligence               │
│ - DOCX: mammoth.js (HTML → text)                        │
│ - XLSX: xlsx library (sheet → text)                     │
│ - EML: mailparser (headers + body)                      │
│ - MSG: @kenjiuno/msgreader (Outlook messages)           │
│ - TXT/CSV: direct read with encoding detection          │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│ Stage 5: Email Attachment Extraction                    │
│ - Extract attachments from EML/MSG files                │
│ - Create child Document records for each attachment     │
│ - Link parent-child relationship                        │
│ - Queue child documents for processing                  │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│ Stage 6: Format Conversion                              │
│ - Normalize extracted content to ContentBlock[]         │
│ - Preserve document structure (headings, paragraphs)    │
│ - Extract metadata (author, created, modified)          │
│ - Handle whitespace normalization                       │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│ Stage 7: Page Storage                                   │
│ - Split content into logical pages                      │
│ - Store in DocumentPage table for retrieval             │
│ - Maintain page order and boundaries                    │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│ Stage 8: Duplicate Detection                            │
│ - Exact: SHA-256 content hash comparison                │
│ - Near: Trigram Jaccard similarity ≥ 0.85               │
│ - Mark duplicates, link to canonical document           │
│ - Skip further processing for exact duplicates          │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│ Stage 9: Pattern Detection                              │
│ - NZ IRD Number: \d{2,3}-\d{3}-\d{3}                    │
│ - NZ Phone: various formats (04, +64, 021, etc.)        │
│ - Email: RFC-compliant regex                            │
│ - NHI Number: ABC1234 format                            │
│ - NZ Address: street number + street type patterns      │
│ - Person Names: Title + Capitalized Word patterns       │
│ - Confidence: 95% for pattern-based detections          │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│ Stage 10: Custom Rules Matching                         │
│ - Execute user-defined rules from CustomRule table      │
│ - Match types: keyword, pattern (regex), phrase         │
│ - Ground assignment from rule configuration             │
│ - Confidence: 90% for custom rule matches               │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│ Stage 11: AI Detection                                  │
│ - Azure OpenAI GPT-4o with LGOIMA-aware system prompt   │
│ - Process in 3-page batches to optimize context window  │
│ - Detect: personal info, commercial sensitivity, legal  │
│ - Output: JSON with text, type, ground, reasoning, PI   │
│ - Confidence: AI-provided score 0-100                   │
│ - Resilience: retry with exponential backoff            │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│ Stage 12: Content Building                              │
│ - Transform to DocParagraph[] with inline highlighting  │
│ - Embed detectionId references in DocSegment objects    │
│ - Store as contentJson (JSONB) in Document table        │
│ - Mark document status as 'ready' for review            │
└──────────────────────────────────────────────────────────┘
```

### Timing Instrumentation

Each pipeline execution tracks:
- **extractionMs**: Time spent in Stage 4 (text extraction)
- **patternDetectionMs**: Time spent in Stage 9 (pattern matching)
- **aiDetectionMs**: Time spent in Stage 11 (GPT-4o calls)
- **totalProcessingMs**: End-to-end pipeline duration

Stored in `ProcessingMetrics` table for performance analysis and SLA monitoring.

### Error Handling

Pipeline failures are classified and stored with:
- Stage number where failure occurred
- Error classification (connection, timeout, corruption, unsupported)
- Retry eligibility
- User-facing error message

---

## 4. PDF Redaction Architecture

Veil implements **two distinct PDF redaction paths** depending on the original file format, both ensuring irreversible content removal.

### Path 1: PDF Original Documents (PyMuPDF)

```
PDF Original
     ↓
┌─────────────────────────────────────────┐
│ Python subprocess: redact-pdf.py        │
│ - Load PDF with PyMuPDF (fitz)          │
│ - For each detection:                   │
│   * page.add_redact_annot(rect)         │
│   * Add ground reference label          │
│ - page.apply_redactions()               │
│   * TRUE CONTENT STREAM REMOVAL         │
│   * Irreversible text deletion          │
│ - Strip all metadata (XMP, Info dict)   │
│ - Save to new PDF                       │
└─────────────────────────────────────────┘
     ↓
Redacted PDF (text genuinely removed)
```

**Technical Details:**
- `add_redact_annot()`: Creates redaction annotation with bounding box
- `apply_redactions()`: Physically removes text from content streams
- Ground labels: White text on black rectangles (e.g., "s7(2)(a)")
- Metadata stripping: Removes author, creator, producer, creation date, modification date
- No hidden layers or recoverable content

### Path 2: Non-PDF Original Documents (pdf-lib)

```
DOCX/XLSX/EML/TXT Original
     ↓
┌─────────────────────────────────────────┐
│ Generate new PDF with pdf-lib           │
│ - Convert content to PDF format         │
│ - Render text with detected spans       │
│ - Replace sensitive spans with:         │
│   * Black rectangle (drawRectangle)     │
│   * Ground reference label (white text) │
│ - Embed standard fonts (Helvetica)      │
│ - No metadata embedded                  │
└─────────────────────────────────────────┘
     ↓
Redacted PDF (generated clean)
```

**Technical Details:**
- pdf-lib used for PDF generation from scratch
- Sensitive text never written to PDF content streams
- Black boxes rendered at detection bounding box coordinates
- Ground labels rendered as text annotations
- Clean metadata (no identifying information)

### Post-Redaction Verification

```typescript
// Verification process (lib/redaction/verify.ts)
1. Extract all text from redacted PDF using PyMuPDF
2. Search for each original sensitive text string
3. Assert: sensitiveText NOT FOUND in extracted text
4. Store verification result:
   - verifiedAt: timestamp
   - verifiedBy: user ID
   - verificationPassed: boolean
   - residualText: any found matches (should be empty)
```

**Verification Metrics:**
- Run on every redacted PDF before export
- Failed verification blocks export pipeline
- Stores verification audit in DocumentExport table
- Alerts if sensitive text detected post-redaction

---

## 5. Export Pipeline

The export pipeline (`lib/export/build-package.ts`) generates three distinct package types based on recipient and compliance requirements.

### Package Types

#### Requester Package (Standard LGOIMA Response)
```
requester-package.zip
├── redacted/
│   ├── doc-001-redacted.pdf
│   ├── doc-002-redacted.pdf
│   └── ...
├── withholding-schedule.pdf
│   - Table: Document | Withheld Content | Ground | Reasoning
│   - LGOIMA s6/s7/s17 references
│   - Human-readable explanations
└── cover-letter.pdf
    - Formal LGOIMA response header
    - Summary of disclosed vs withheld information
    - Rights of requester (Ombudsman complaint process)
```

#### Internal Package (Council Records)
```
internal-package.zip
├── redacted/
│   └── (same as requester package)
├── withholding-schedule.pdf
├── cover-letter.pdf
├── audit-trail.pdf
│   - Complete reviewer actions timeline
│   - Detection acceptance/rejection log
│   - Signoff chain (SME → Legal → Final)
│   - User IDs, timestamps, IP addresses
└── chain-of-custody.pdf
    - Upload timestamp and user
    - Processing completion timestamp
    - Review start/completion timestamps
    - Export timestamp and user
    - SHA-256 hash of package
```

#### Ombudsman Package (Full Disclosure for Investigation)
```
ombudsman-package.zip
├── redacted/
│   └── (redacted PDFs)
├── originals/
│   ├── doc-001-original.pdf (metadata sanitised)
│   ├── doc-002-original.docx (metadata sanitised)
│   └── ...
├── withholding-schedule.pdf
├── audit-trail.pdf
├── chain-of-custody.pdf
└── ombudsman-briefing.pdf
    - Context for investigation
    - Summary of redaction approach
    - AI model governance information
    - Contact information for queries
```

### Batch Export Logic

For large document sets (>500 pages):
```typescript
// Batch splitting algorithm
const PAGES_PER_BATCH = 500;
let currentBatch = 1;
let currentBatchPages = 0;
let currentBatchDocs = [];

for (const doc of documents) {
  if (currentBatchPages + doc.pageCount > PAGES_PER_BATCH) {
    // Create batch ZIP
    createPackageZip(`batch-${currentBatch}.zip`, currentBatchDocs);
    currentBatch++;
    currentBatchPages = 0;
    currentBatchDocs = [];
  }
  currentBatchDocs.push(doc);
  currentBatchPages += doc.pageCount;
}

// Final batch
if (currentBatchDocs.length > 0) {
  createPackageZip(`batch-${currentBatch}.zip`, currentBatchDocs);
}
```

### Package Integrity

Each export package includes:
- **SHA-256 hash**: Computed over entire ZIP file, stored in DocumentExport table
- **Export manifest**: JSON file listing all included documents with hashes
- **Timestamp**: ISO 8601 timestamp embedded in package metadata
- **Immutability**: Once exported, package hash recorded in audit log (cannot be regenerated with same ID)

---

## 6. Review Workflow State Machine

Documents progress through a strict state machine enforcing the LGOIMA review workflow.

### State Diagram

```
┌──────────────┐
│  processing  │  Initial state: document being processed by pipeline
└──────┬───────┘
       │ Pipeline completion
       ↓
┌──────────────┐
│    ready     │  Available for review, no reviewer assigned
└──────┬───────┘
       │ Reviewer opens document
       ↓
┌──────────────┐
│  in-review   │  Assigned to reviewer, detections being evaluated
└──────┬───────┘
       │ All detections resolved OR reviewer submits
       ↓
┌──────────────┐
│   reviewed   │──────┐
└──────┬───────┘      │ Senior reviewer requests changes
       │              │
       │ Senior       └──────┐
       │ signoff             ↓
       ↓                ┌─────────────┐
┌──────────────┐       │  in-review  │ (regression)
│  signed-off  │       └─────────────┘
└──────────────┘            ↑
                            │ Reviewer reverts detection on reviewed doc
                            └─────────┘
```

### State Transition Rules

| From | To | Trigger | Conditions |
|------|-------|---------|------------|
| processing | ready | Pipeline completion | status = 'success', all stages complete |
| ready | in-review | Reviewer opens document | User has 'reviewer' or 'legal' role |
| in-review | reviewed | Review submission | All detections have status ≠ 'pending' |
| reviewed | signed-off | Senior signoff | User has 'legal' role, clicks "Sign Off" |
| reviewed | in-review | Request changes | User has 'legal' role, clicks "Request Changes" |
| in-review | in-review | Revert detection | Change detection status back to 'pending' |
| reviewed | in-review | Revert detection | Change detection status triggers regression |

### State-Specific Behaviors

**processing**
- Document locked for editing
- No user actions available
- Background job active

**ready**
- Document appears in "Ready for Review" queue
- Any reviewer can claim by opening
- No locking (race condition acceptable)

**in-review**
- Document shows current reviewer name
- Other users can view but not modify detections
- Auto-save on every detection action

**reviewed**
- Document appears in "Pending Signoff" queue for legal reviewers
- Original reviewer can still view
- Legal reviewer can accept (signoff) or reject (request changes)

**signed-off**
- Document locked for review changes (immutable snapshot created)
- Available for export package generation
- Appears in "Ready to Export" queue

### Audit Trail

Every state transition creates an AuditLog entry:
```typescript
{
  documentId: string;
  userId: string;
  action: 'state_transition';
  details: {
    from: DocumentStatus;
    to: DocumentStatus;
    reason?: string; // For 'request changes'
  };
  timestamp: Date;
  ipAddress: string;
}
```

---

## 7. Detection Architecture

Detections are the atomic units of redaction, representing individual sensitive content findings.

### Detection Sources

| Source | Description | Confidence | Generated By |
|--------|-------------|------------|--------------|
| `pattern` | NZ-specific regex patterns | 95% | Stage 9: Pattern Detection |
| `ai` | Azure OpenAI GPT-4o | 0-100 (AI-provided) | Stage 11: AI Detection |
| `custom-rule` | User-defined custom rules | 90% | Stage 10: Custom Rules |
| `manual` | Human reviewer entry | 100% | Reviewer UI |

### Detection Status State Machine

```
┌─────────┐
│ pending │  Initial state: awaiting reviewer decision
└────┬────┘
     │
     ├─────→ ┌──────────┐
     │       │ accepted │  Reviewer confirms: will be redacted
     │       └──────────┘
     │
     └─────→ ┌──────────┐
             │ rejected │  Reviewer dismisses: will not be redacted
             └──────────┘

Note: Both accepted and rejected can revert → pending
```

**Reversion Logic:**
```typescript
if (document.status === 'reviewed' && detection.status !== 'pending') {
  // Reverting a resolved detection regresses document to in-review
  await updateDocumentStatus(documentId, 'in-review');
}
await updateDetectionStatus(detectionId, 'pending');
```

### Detection Data Model

```typescript
interface Detection {
  // Identity
  id: string;
  documentId: string;

  // Content
  type: 'personal' | 'commercial' | 'legal-privilege' | 'other';
  text: string;              // The sensitive text detected
  confidence: number;        // 0-100

  // Location (bounding box for rendering)
  page: number;
  posX: number;              // X coordinate (0-1 normalized)
  posY: number;              // Y coordinate (0-1 normalized)
  posW: number;              // Width (0-1 normalized)
  posH: number;              // Height (0-1 normalized)

  // LGOIMA grounds
  suggestedGround: string | null;  // AI suggestion (e.g., "s7(2)(a)")
  appliedGround: string | null;    // Reviewer decision
  reasoning: string | null;        // AI reasoning
  piConsideration: string | null;  // Public interest consideration

  // AI-specific
  aiExplanation: string | null;    // Why AI flagged this
  source: DetectionSource;

  // Review
  status: 'pending' | 'accepted' | 'rejected';
  reviewedBy: string | null;       // User ID
  reviewedAt: Date | null;

  // Audit
  createdAt: Date;
  updatedAt: Date;
}
```

### Ground Reference System

LGOIMA statutory grounds available in system:

**Section 6 (Conclusive reasons for withholding)**
- s6(a): Prejudice to security or defence of NZ
- s6(b): Prejudice to entrusting of information to Government of NZ on a basis of confidence by other Governments
- s6(c): Prejudice to maintenance of the law, including prevention, investigation, and detection of offences
- s6(d): Endanger the safety of any person

**Section 7 (Other reasons for withholding)**
- s7(2)(a): Protect privacy of natural persons
- s7(2)(b)(i): Protect information subject to legal professional privilege
- s7(2)(b)(ii): Protect information subject to negotiation privilege
- s7(2)(c)(i): Protect information subject to trade secret
- s7(2)(f)(i): Maintain constitutional conventions for collective/individual ministerial responsibility
- s7(2)(g): Maintain effective conduct of public affairs through free and frank expression of opinions
- s7(2)(h): Maintain legal professional privilege
- s7(2)(i): Enable a local authority to carry out commercial activities without prejudice or disadvantage

**Section 17 (Administrative reasons)**
- s17(e): Information does not exist or cannot be found
- s17(f): Information requested is or will soon be publicly available
- s17(g): Request frivolous or vexatious, or request for a large quantity of information that would impair the efficient administration of the local authority
- s17(h): Substantial collation and research required

### Detection Aggregation

For analytics and dashboard:
```typescript
interface DetectionStats {
  total: number;
  byStatus: {
    pending: number;
    accepted: number;
    rejected: number;
  };
  bySource: {
    pattern: number;
    ai: number;
    'custom-rule': number;
    manual: number;
  };
  byType: {
    personal: number;
    commercial: number;
    'legal-privilege': number;
    other: number;
  };
  byGround: Record<string, number>;  // e.g., { "s7(2)(a)": 45, ... }
}
```

---

## 8. AI Feedback Loop

Veil implements a continuous learning system where human reviewer corrections train the AI to improve detection accuracy over time.

### Feedback Capture

When a reviewer creates a manual detection or rejects an AI detection:
```typescript
// lib/ai/feedback.ts
async function captureFeedback(action: ReviewerAction) {
  if (action.type === 'manual_detection') {
    // Human found something AI missed (false negative)
    await prisma.feedbackExample.create({
      data: {
        text: action.text,
        isPositive: true,        // Should have been detected
        detectionType: action.detectionType,
        ground: action.ground,
        context: action.surroundingText,
        documentType: action.documentType,
        reason: 'False negative: AI missed this',
        createdBy: action.userId,
      }
    });
  }

  if (action.type === 'reject_ai_detection') {
    // AI flagged something incorrectly (false positive)
    await prisma.feedbackExample.create({
      data: {
        text: action.detection.text,
        isPositive: false,       // Should NOT have been detected
        detectionType: action.detection.type,
        context: action.detection.surroundingText,
        documentType: action.documentType,
        reason: action.rejectionReason,
        createdBy: action.userId,
      }
    });
  }
}
```

### Feedback Prompt Integration

Recent feedback examples are appended to the AI system prompt:
```typescript
// lib/ai/build-feedback-prompt-section.ts
function buildFeedbackPromptSection(): string {
  const recentExamples = await prisma.feedbackExample.findMany({
    where: { createdAt: { gte: subDays(new Date(), 30) } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const positiveExamples = recentExamples
    .filter(ex => ex.isPositive)
    .map(ex => `Text: "${ex.text}"\nType: ${ex.detectionType}\nGround: ${ex.ground}\nContext: ${ex.context}`);

  const negativeExamples = recentExamples
    .filter(ex => !ex.isPositive)
    .map(ex => `Text: "${ex.text}"\nReason: ${ex.reason}\nContext: ${ex.context}`);

  return `
## Recent Reviewer Corrections (Learn from these)

### Examples of content that SHOULD be detected:
${positiveExamples.join('\n---\n')}

### Examples of content that should NOT be detected:
${negativeExamples.join('\n---\n')}

Apply these learnings to improve detection accuracy.
`;
}
```

This section is dynamically injected into every AI detection call, creating a rolling 30-day learning window.

### Accuracy Metrics

False negative rate computed from feedback data:
```typescript
// lib/ai/compute-false-negative-rate.ts
interface AccuracyMetrics {
  totalDocumentsProcessed: number;
  totalManualDetections: number;    // Human-added detections (AI missed)
  totalAiDetections: number;
  totalRejectedAiDetections: number; // AI false positives

  falseNegativeRate: number;        // manual / (manual + ai accepted)
  falsePositiveRate: number;        // rejected / total AI
  precision: number;                // ai accepted / total AI
  recall: number;                   // ai accepted / (ai accepted + manual)
}

// Tracked over time to measure improvement
await prisma.accuracySnapshot.create({
  data: {
    period: 'weekly',
    weekStarting: startOfWeek(new Date()),
    metrics: accuracyMetrics,
  }
});
```

### Learning Outcomes

Over time, the AI should:
1. **Reduce false negatives**: Fewer manual detections needed
2. **Reduce false positives**: Fewer AI detections rejected
3. **Improve ground assignment**: AI-suggested grounds accepted more often
4. **Contextualize better**: Understand NZ-specific terminology and LGOIMA context

Dashboard displays trend graphs of precision/recall over time.

---

## 9. Content Model

Documents are stored in a structured content model that enables inline detection highlighting and efficient rendering.

### Hierarchy

```
Document
  └── DocParagraph[]
        ├── heading?: string
        ├── page: number
        └── segments: DocSegment[]
              ├── text: string
              └── detectionId?: string  (if this segment is sensitive)
```

### Data Structure

```typescript
interface DocParagraph {
  heading?: string;           // Optional paragraph heading
  page: number;              // Page number this paragraph appears on
  segments: DocSegment[];    // Array of text segments
}

interface DocSegment {
  text: string;              // The text content
  detectionId?: string;      // If present, this segment is flagged as sensitive
}
```

### Example

Original text:
```
Subject: Meeting with John Smith

Hi team, please find attached the contract for Project X. John's email is john.smith@example.com.
```

Content model after AI detection:
```typescript
{
  heading: "Subject: Meeting with John Smith",
  page: 1,
  segments: [
    { text: "Hi team, please find attached the contract for Project X. " },
    { text: "John", detectionId: "det_001" },
    { text: "'s email is " },
    { text: "john.smith@example.com", detectionId: "det_002" },
    { text: "." }
  ]
}
```

### Storage

Content is stored as JSONB in PostgreSQL:
```sql
CREATE TABLE "Document" (
  ...
  "contentJson" JSONB,
  ...
);

-- Index for fast retrieval
CREATE INDEX idx_document_content ON "Document" USING gin("contentJson");
```

### Rendering

Frontend renders segments with conditional highlighting:
```tsx
function ParagraphRenderer({ paragraph }: { paragraph: DocParagraph }) {
  return (
    <div className="paragraph">
      {paragraph.heading && <h3>{paragraph.heading}</h3>}
      <p>
        {paragraph.segments.map((segment, i) => (
          segment.detectionId ? (
            <mark key={i} data-detection-id={segment.detectionId}>
              {segment.text}
            </mark>
          ) : (
            <span key={i}>{segment.text}</span>
          )
        ))}
      </p>
    </div>
  );
}
```

### Whitespace Normalization

Challenge: Different text extractors produce different whitespace:
- mammoth.js: Regular spaces
- Azure OpenAI: Non-breaking spaces (`\u00A0`)
- Azure Document Intelligence: Mixed

Solution: Normalize before comparison:
```typescript
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\u00A0/g, ' ')      // Non-breaking space → space
    .replace(/\s+/g, ' ')          // Multiple spaces → single space
    .trim();
}

// When matching AI detections to content:
const normalizedContent = normalizeWhitespace(originalText);
const normalizedDetection = normalizeWhitespace(aiDetection.text);

if (normalizedContent.includes(normalizedDetection)) {
  // Match found
}
```

---

## 10. Error Classification

Veil implements intelligent error classification to provide user-friendly error messages and guide retry behavior.

### Error Categories

| Category | Causes | User Message | Retry? |
|----------|--------|--------------|--------|
| `connection` | Network failures, DNS errors, connection timeouts | "Service temporarily unavailable. Please try again in a few moments." | Yes (auto) |
| `rate_limit` | Azure OpenAI 429 responses | "Too many requests. Please try again in a few minutes." | Yes (auto with backoff) |
| `timeout` | Processing exceeds threshold (>5 minutes for AI) | "Processing is taking longer than expected. Please check back shortly." | Yes (manual) |
| `corruption` | Invalid file structure, encryption, password protection | "File appears to be corrupted, encrypted, or password-protected. Please upload a valid file." | No |
| `unsupported` | File type not in supported list | "File type not supported. Supported formats: PDF, DOCX, XLSX, EML, MSG, TXT, CSV" | No |
| `authorization` | User lacks required permissions | "You don't have permission to perform this action." | No |
| `validation` | Invalid input data (e.g., missing required fields) | "Invalid input: [specific field error]" | No (fix required) |
| `quota_exceeded` | Storage or processing quota reached | "Processing quota exceeded. Please contact your administrator." | No |

### Classification Logic

```typescript
// lib/errors/classify.ts
function classifyError(error: Error): ErrorClassification {
  // Network/connection errors
  if (
    error.message.includes('ECONNREFUSED') ||
    error.message.includes('ENOTFOUND') ||
    error.message.includes('ETIMEDOUT') ||
    error.code === 'ECONNRESET'
  ) {
    return {
      category: 'connection',
      retryable: true,
      userMessage: 'Service temporarily unavailable. Please try again in a few moments.',
    };
  }

  // Azure OpenAI rate limiting
  if (error.message.includes('429') || error.message.includes('rate limit')) {
    return {
      category: 'rate_limit',
      retryable: true,
      userMessage: 'Too many requests. Please try again in a few minutes.',
      retryAfterSeconds: 60,
    };
  }

  // Timeout errors
  if (error.message.includes('timeout') || error.code === 'ETIMEDOUT') {
    return {
      category: 'timeout',
      retryable: true,
      userMessage: 'Processing is taking longer than expected. Please check back shortly.',
    };
  }

  // File corruption
  if (
    error.message.includes('corrupted') ||
    error.message.includes('encrypted') ||
    error.message.includes('password protected') ||
    error.message.includes('invalid magic bytes')
  ) {
    return {
      category: 'corruption',
      retryable: false,
      userMessage: 'File appears to be corrupted, encrypted, or password-protected. Please upload a valid file.',
    };
  }

  // Unsupported format
  if (error.message.includes('unsupported') || error.message.includes('file type')) {
    return {
      category: 'unsupported',
      retryable: false,
      userMessage: 'File type not supported. Supported formats: PDF, DOCX, XLSX, EML, MSG, TXT, CSV',
    };
  }

  // Authorization
  if (error.message.includes('unauthorized') || error.message.includes('forbidden')) {
    return {
      category: 'authorization',
      retryable: false,
      userMessage: "You don't have permission to perform this action.",
    };
  }

  // Default: unknown error
  return {
    category: 'unknown',
    retryable: false,
    userMessage: 'An unexpected error occurred. Please contact support if this persists.',
  };
}
```

### Error Storage

All errors stored in database for monitoring:
```typescript
await prisma.processingError.create({
  data: {
    documentId,
    stage: pipelineStage,        // Which pipeline stage failed
    category: classification.category,
    errorMessage: error.message,
    stackTrace: error.stack,
    retryable: classification.retryable,
    retryCount: currentRetryCount,
    timestamp: new Date(),
  }
});
```

### Retry Strategy

```typescript
// lib/resilience/retry.ts
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  classification: ErrorClassification,
  maxRetries: number = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!classification.retryable || attempt === maxRetries) {
        throw error;
      }

      const backoffMs = Math.min(
        1000 * Math.pow(2, attempt),  // Exponential: 2s, 4s, 8s
        30000                          // Max 30 seconds
      );

      await sleep(backoffMs);
    }
  }

  throw new Error('Max retries exceeded');
}
```

### User Feedback

Errors displayed in UI with:
- **User-friendly message**: From classification
- **Error ID**: For support reference
- **Retry button**: If retryable
- **Action guidance**: What user should do next

---

## Conclusion

This application architecture provides a robust, scalable, and maintainable foundation for Veil's LGOIMA disclosure workflow. The layered architecture enforces separation of concerns, the multi-stage pipeline ensures comprehensive processing, and the state machines guarantee workflow integrity.

Key architectural strengths:
- **Type safety**: TypeScript end-to-end
- **Immutability**: Audit trails and chain-of-custody
- **Resilience**: Retry logic, error classification, graceful degradation
- **Scalability**: Async processing, batch operations, efficient queries
- **Compliance**: LGOIMA workflow enforcement, ground tracking, verification

The architecture is designed to meet NPDC's requirement for a "defensible digital redaction and disclosure workflow platform" — not merely a redaction utility.