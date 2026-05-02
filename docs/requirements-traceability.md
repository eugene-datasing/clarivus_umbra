# Umbra — Requirements Traceability

This is a slim Umbra-keyed traceability matrix. The detailed Veil-era
NPDC P26-138 traceability sits at
[`docs/legacy-veil/requirements-traceability.md`](./legacy-veil/requirements-traceability.md);
this document only tracks Umbra v1 must-haves and the implementation
points that satisfy them.

The full Umbra requirements set lives in
`docs/umbra-requirements-v1.xlsx` (REQ-001 → REQ-018).

| REQ | Description | Phase | Status | Implementation |
|---|---|---|---|---|
| REQ-001 | Ingest .pdf / .docx / .xlsx / .eml / .msg / .txt | 2 (Veil) | Done | `lib/pipeline/extract.ts` + `lib/pipeline/format-converter.ts` |
| REQ-002 | OCR for scanned PDFs | 2 (Veil) | Done | Azure DI `prebuilt-read` via `lib/pipeline/extract.ts` |
| REQ-003 | Detect NZ-specific PII (IRD, NHI, phone, address, etc.) | 5 (Veil) | Done | `lib/pipeline/patterns.ts` + 22-type vocabulary in `lib/detection-type-grounds.ts` |
| REQ-004 | AI-driven contextual detection | 6 (Veil) | Done | `lib/pipeline/ai-detect.ts` (Azure OpenAI GPT-4o, 3-page batches with doc-level context) |
| REQ-005 | NZ Driver Licence detection | 5 (Phase 5 rename) | Done | `nz-driver-licence` type in patterns.ts + label-adjacent.ts; locked by `lib/__tests__/detection-type-parity.test.ts` |
| REQ-006 | Reviewer accept / reject workflow | 7 (Veil) | Done | `app/batches/[id]/review/[docId]/...`, `lib/actions/detection-actions.ts` |
| REQ-007 | Bulk review (by type / by similar text) | 8 (Veil) | Done | `bulkAcceptByType` / `bulkAcceptBySimilar` in `lib/actions/detection-actions.ts` |
| REQ-008 | Manual detection add / delete | 9 (Veil) | Done | `lib/actions/manual-detection-actions.ts` |
| REQ-009 | Custom rules (admin) | WP8 (Veil) | Done | `lib/actions/rule-actions.ts`, `app/admin/rules/...`, `note` field added in Phase 8 |
| REQ-010 | True PDF redaction (PyMuPDF) | 11 (Veil) | Done | 3-tier engine in `lib/pipeline/redact-pdf.ts` + `redact_pdf_pymupdf.py` |
| REQ-011 | Single export ZIP per batch | 7 (Umbra) | Done | `lib/pipeline/export.ts` (single packageType, simplified layout) |
| REQ-012 | Per-batch immutable audit chain | 13 (Veil) | Done | `lib/data/audit.ts` (per-batch SHA-256 chain + `verifyAuditIntegrity`) |
| REQ-013 | 2-role auth (admin / reviewer) | 3 (Umbra) | Done | `lib/auth/roles.ts`, `lib/auth/authorize.ts` |
| REQ-014 | First-run setup wizard | 8 (Umbra slim) | Done | `app/setup/setup-wizard-client.tsx` (5 steps post-Phase-8) |
| REQ-015 | Configurable retention window | 6a (Umbra) | Done | `RETENTION_CONFIG` setting + `getRetentionConfig()` + admin UI in `app/admin/retention/...` |
| REQ-016 | Soft-delete + Purge Now (admin) | 6b (Umbra) | Done | `softDeleteBatch / restoreBatch / purgeNowBatch` actions; Trash UI |
| REQ-017 | Audit-archive on purge (canonical JSONL) | 6c (Umbra) | Done | `lib/jobs/audit-archive.ts` + retention-sweep handler in `lib/jobs/runner.ts` |
| REQ-018 | Cross-batch audit archive download | 6c (Umbra) | Done | `app/api/admin/audit-archive/download/route.ts` (re-verifies on download) |

## Test coverage

| Concern | Test file |
|---|---|
| Detection-type vocabulary parity | `lib/__tests__/detection-type-parity.test.ts` |
| Audit chain integrity | `lib/data/__tests__/audit.test.ts` |
| Bbox calculation | `lib/pipeline/__tests__/bbox.test.ts` |
| Pattern detectors | `lib/pipeline/__tests__/patterns.test.ts`, `lib/pipeline/__tests__/label-adjacent.test.ts`, `lib/pipeline/__tests__/section-marker-detect.test.ts` |
| Coordinate dedup | `lib/pipeline/__tests__/redact-dedup.test.ts` |
| Manual-detection bbox path | `lib/actions/__tests__/manual-detection-bbox.test.ts` |
| Authorisation | `lib/auth/__tests__/authorize.test.ts` |
| Setup wizard / batches list | `e2e/setup/`, `e2e/batches/` |
| Review flow | `e2e/review/` |
| Export | `e2e/export/` |
| Admin (retention, settings) | `e2e/admin/` |

Phase 10 (test triage) will reconcile the e2e suite with the slim post-
Phase-9 surface; this matrix is the steady-state target.
