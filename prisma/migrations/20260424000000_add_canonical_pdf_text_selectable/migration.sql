-- Phase 3 prerequisite: add canonical_pdf_text_selectable column.
-- Populated by isTextSelectable() probe in lib/pipeline/canonical-pdf.ts at
-- ingest time (process.ts) and during scripts/backfill-canonical-pdfs.ts.
-- Nullable: NULL = not yet probed; TRUE = pdf.js has a meaningful text
-- layer; FALSE = scanned / image-only / empty text layer (Phase 3 routes
-- to HTML fallback).
ALTER TABLE "documents"
  ADD COLUMN "canonical_pdf_text_selectable" BOOLEAN;
