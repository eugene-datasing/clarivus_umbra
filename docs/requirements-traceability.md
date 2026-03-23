# Requirements Traceability Matrix

Maps RFP P26-138 functional requirements to prototype implementation status.

**Status key:** Done | Partial | Not Started

---

## Must Have (24 requirements)

| # | Requirement | Status | Key Files | Notes |
|---|-------------|--------|-----------|-------|
| 1 | Ingest large datasets (1,000–10,000+ docs) | **Done** | `app/api/documents/upload/route.ts`, `app/requests/[id]/ingest/ingest-client.tsx`, `lib/pipeline/process.ts` | Drag-drop bulk upload, processing queue handles batches |
| 2 | Detect and remove duplicates (exact + near-duplicate) | **Done** | `lib/pipeline/duplicate-detect.ts`, schema `Document.contentHash` | SHA-256 exact + trigram Jaccard similarity (0.85 threshold) |
| 3 | Retain key metadata for audit trails | **Done** | `lib/data/audit.ts`, schema `AuditEntry`, `Document` timing fields | Immutable entries with timestamp, user, action, detail |
| 4 | Preserve original source files (secure, restricted) | **Done** | `lib/storage/local.ts`, `lib/storage/azure-blob.ts`, schema `FileUpload` | SHA-256 hashed originals, abstract storage provider |
| 5 | Sanitise metadata and hidden content | **Done** | `lib/pipeline/sanitise-metadata.ts` | Strips docProps from DOCX/XLSX, PDF metadata removed during redaction |
| 6 | Pattern-based detection (email, phone, IDs) | **Done** | `lib/pipeline/patterns.ts` | NZ-specific regex: IRD, phone, email, NHI, street addresses |
| 7 | Detect personal information | **Done** | `lib/pipeline/ai-detect.ts`, `lib/pipeline/patterns.ts` | GPT-4o contextual + regex patterns combined |
| 8 | Detect commercially sensitive information | **Done** | `lib/pipeline/ai-detect.ts` | AI detection includes "commercial" type with LGOIMA grounds |
| 9 | Bulk-apply redactions across large document sets | **Done** | `app/requests/[id]/bulk-review/bulk-review-client.tsx`, `lib/actions/detection-actions.ts` | Entity grouping, confidence threshold, bulk accept/reject |
| 10 | Visual preview of proposed redactions | **Done** | `app/requests/[id]/review/[docId]/review-client.tsx`, `components/review/*` | Split-panel with highlighted detections and side panel |
| 11 | Make redactions permanent and unrecoverable | **Done** | `lib/pipeline/redact-pdf.ts`, `lib/pipeline/redact_pdf_pymupdf.py` | PyMuPDF removes text from content stream, not just visual overlay |
| 12 | Verify irreversible redaction (automated checks) | **Done** | `lib/pipeline/verify-redaction.ts`, `lib/pipeline/verify_redaction_pymupdf.py` | Post-redaction text extraction confirms sensitive text absent |
| 13 | Present AI recommendations for human QA | **Done** | `app/requests/[id]/review/[docId]/review-client.tsx`, schema `Detection` | Confidence scores, suggested grounds, reasoning, explanations |
| 14 | Collaborative review (tiered) with change tracking | **Done** | Schema `CaseMilestone`, `CaseAssignment`, `DetectionHistory` | Milestone workflow: collection → processing → review → senior → final → release |
| 15 | Maintain immutable audit trail | **Done** | `lib/data/audit.ts`, schema `AuditEntry.integrityHash` | Blockchain-style SHA-256 hash chaining, tamper detection |
| 16 | Export release-ready documents (LGOIMA compliant) | **Done** | `lib/pipeline/export.ts`, `app/requests/[id]/export/export-client.tsx` | ZIP packages: requester, internal, ombudsman variants |
| 17 | Generate withholding schedules | **Done** | `lib/pipeline/schedule.ts`, `lib/lgoima-grounds.ts` | PDF grouped by ground then document, includes reasoning |
| 18 | Export audit reports (immutable) | **Done** | `lib/pipeline/audit-pdf.ts` | PDF with chain-of-custody verification, integrity hash validation |
| 19 | OCR scans and handwriting | **Partial** | `lib/pipeline/extract.ts` (Azure Document Intelligence) | Azure DI prebuilt-read handles OCR; handwriting supported but not explicitly validated |
| 20 | Ingest email exports (PST, MSG, EML) | **Partial** | `lib/pipeline/email-extract.ts` | EML (mailparser) and MSG (@kenjiuno/msgreader) done. PST not implemented. |
| 21 | Link redactions to statutory grounds | **Done** | `lib/lgoima-grounds.ts`, schema `Detection.suggestedGround`, `appliedGround` | 15 LGOIMA grounds (s6, s7, s17) with descriptions and public interest flags |
| 22 | Compare versions (original, draft, final) | **Done** | `app/requests/[id]/review/[docId]/compare/compare-client.tsx`, `lib/pipeline/version-snapshot.ts` | Snapshot mechanism with diff view showing added/removed/modified detections |
| 23 | Meet performance benchmarks | **Partial** | `app/requests/[id]/pipeline/processing-performance.tsx` | Timing infrastructure in place, no load testing results. Targets: 5K pages/4hrs, 10K docs/1hr, 5 concurrent reviewers |
| 24 | AI accuracy metrics documentation | **Done** | `app/admin/ai-governance/ai-governance-client.tsx`, `lib/data/ai-metrics.ts` | Precision, recall, F1, false positive rate by type. Feedback loop for AI improvement |

---

## Should Have (11 requirements)

| # | Requirement | Status | Key Files | Notes |
|---|-------------|--------|-----------|-------|
| 25 | Convert to consistent review format | **Done** | `lib/pipeline/format-converter.ts`, `lib/pipeline/content-builder.ts` | DOCX, XLSX, EML/MSG, PDF/TXT all converted to ContentBlock[] |
| 26 | Contextual AI with confidence scoring | **Done** | `lib/pipeline/ai-detect.ts` | GPT-4o LGOIMA-aware prompt with 0-100 confidence, reasoning, public interest |
| 27 | Custom redaction rules | **Done** | `app/admin/rules/rules-client.tsx`, `lib/pipeline/custom-rules.ts` | Keyword/Pattern/Entity/Combination types, Exact/Fuzzy/Regex match, test interface |
| 28 | Pre-release QA simulation | **Done** | `app/requests/[id]/qa/qa-client.tsx`, `lib/data/qa-simulation.ts` | Automated checks: completeness, ground consistency, public interest, verification |
| 29 | Track processing time (automated vs. human) | **Done** | Schema `Document.extractionMs`, `patternDetectionMs`, `aiDetectionMs`, `totalProcessingMs` | Granular timing captured, performance dashboard |
| 30 | Chain-of-custody reports | **Done** | `lib/pipeline/chain-of-custody.ts` | PDF report with full document lifecycle from upload through export |
| 31 | M365 integration (SharePoint, OneDrive, Outlook) | **Partial** | `lib/integrations/m365-connector.ts` | Graph API connector framework built, not wired into ingest UI |
| 32 | Export as large PDF (1,000-page batches) | **Partial** | `lib/pipeline/export.ts` | Exports individual PDFs per document in ZIP. Batch PDF concatenation not implemented |
| 33 | Approved data residency (NZ/AU) | **Done** | `lib/storage/azure-blob.ts`, Azure infrastructure | All services in `australiaeast`, configurable to NZ region |
| 34 | Clear error messages | **Done** | `lib/pipeline/file-validator.ts`, error handling throughout | Corruption detection, encryption detection, user-friendly messages |
| 35 | Cost-recovery modelling support | **Done** | `lib/pipeline/cost-recovery-report.ts`, `app/api/reports/cost-recovery/route.ts` | PDF with automated/human time, per-document breakdown, configurable rates |

---

## Could Have (5 requirements)

| # | Requirement | Status | Key Files | Notes |
|---|-------------|--------|-----------|-------|
| 36 | Flag corrupted/unreadable files | **Done** | `lib/pipeline/file-validator.ts` | Magic byte verification, PDF structural integrity, encryption detection |
| 37 | Multimedia redaction (audio, video, images) | **Partial** | `lib/pipeline/multimedia-extract.ts` | Extraction framework for Azure Speech/Video/Vision. Redaction UI not built |
| 38 | Records system integration | **Partial** | `lib/integrations/records-connector.ts` | Connector for SharePoint Records, OpenText, HPRM, CMIS. Not wired to UI |
| 39 | eDiscovery integration | **Partial** | `lib/integrations/ediscovery-connector.ts` | Connector for Relativity, Nuix, Clearwell. Not wired to UI |
| 40 | Progress dashboards | **Done** | `app/queue/processing-dashboard.tsx`, `app/requests/[id]/pipeline/processing-performance.tsx` | Real-time queue status, per-document timing, throughput metrics |

---

## Summary

| Priority | Total | Done | Partial | Not Started |
|----------|-------|------|---------|-------------|
| Must Have | 24 | 21 | 3 | 0 |
| Should Have | 11 | 9 | 2 | 0 |
| Could Have | 5 | 2 | 3 | 0 |
| **Total** | **40** | **32 (80%)** | **8 (20%)** | **0 (0%)** |

---

## Partial Items Requiring Completion

| # | Requirement | Gap | Effort |
|---|-------------|-----|--------|
| 19 | OCR handwriting | Validate Azure DI handwriting accuracy with test samples | Low |
| 20 | PST email ingestion | Integrate libpst or third-party PST parser | Medium |
| 23 | Performance benchmarks | Run load tests against 5K page / 10K doc / 5 concurrent user targets | Medium |
| 31 | M365 integration UI | Add SharePoint document picker to ingest page | Medium |
| 32 | Large batch PDF export | Implement PDF concatenation for 1,000-page batches | Low |
| 37 | Multimedia redaction UI | Build redaction interface for audio/video content | High |
| 38 | Records system wiring | Add records system picker to ingest/export UI | Medium |
| 39 | eDiscovery wiring | Add eDiscovery matter picker to ingest/export UI | Medium |
