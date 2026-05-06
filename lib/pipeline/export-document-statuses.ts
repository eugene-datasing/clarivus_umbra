/**
 * Phase 12.6c — single source of truth for the document-status set
 * the export pipeline considers "ready to ship".
 *
 * Two consumers:
 *   - `lib/pipeline/export.ts` uses it as the allow-list when fetching
 *     documents to redact. Anything not in this set is silently skipped
 *     (e.g. "excluded" docs).
 *   - `lib/pipeline/export-runner.ts` uses it as the validation
 *     allow-list before kicking off the export. Any non-excluded doc
 *     whose status sits outside this set blocks the run with a
 *     BLOCKED_DOCS error.
 *
 * Phase 12.2 added "auto-redacted" to the runner's documented
 * allow-list but the export's own findMany filter (the actual
 * redaction loop) was missed — auto-redacted batches passed the gate,
 * then the redaction loop ran zero times and produced an empty ZIP.
 * The contract test in `__tests__/export-document-statuses.test.ts`
 * pins both files to this constant so the same drift can't recur.
 *
 * If you add a new terminal Document.status that should be exportable,
 * add it here. Tests will then automatically verify both consumers
 * pick it up.
 */
export const EXPORT_DOCUMENT_STATUSES = [
  "in-review",
  "reviewed",
  "signed-off",
  "auto-redacted",
] as const;

export type ExportDocumentStatus = (typeof EXPORT_DOCUMENT_STATUSES)[number];
