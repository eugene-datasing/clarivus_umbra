# Scanned and Handwritten Document Handling — Architectural Gap

**Status:** Deferred. Gap logged for a dedicated future workstream.
**Drafted:** 2026-04-24
**Related:** `docs/viewer-rework-plan-2026-04.md` — Phase 3 ships a stopgap (Option C); this doc describes the proper solution for when the stopgap's limits start to bite.

---

## The gap

Veil's canonical-PDF surface assumes text-layer presence. For native PDFs, DOCX-derived canonicals via LibreOffice, and EML transcripts, pdf.js has real embedded text to work with — selection, Ctrl-F, screen-reader body reading, and the Phase 3 manual-detection workflow all land cleanly. For scanned PDFs, photographed pages, and handwritten notes, the text layer is empty. None of those capabilities work.

Overlay boxes still click-target correctly — they're positioned against the canvas in percentage space, independent of the text layer — so automatic detection is fully preserved. Only workflows that rely on text selection are affected: manual redaction by drag-select, rule authoring from selected text, in-page Ctrl-F, and screen-reader body reading on affected documents.

Scanned PDFs estimated at under 10% of a typical council LGOIMA disclosure pack (Eugene, 2026-04-24). Handwritten content is rarer still. Non-zero, non-load-bearing.

---

## The stopgap — Option C in Phase 3

Phase 3 of the viewer rework adds an ingest-time probe that calls pdf.js `getTextContent()` against each canonical PDF and stores the result on the Document row as `canonicalPdfTextSelectable: boolean`. Documents where the probe returns effectively empty text (threshold <50 characters total across all pages) are routed to the HTML reconstruction view with an unobtrusive banner explaining the fallback. HTML's DI-extracted paragraphs are selectable DOM text, so reviewers of scanned documents keep the capability they have today, just on a different surface.

Honest but imperfect. Two wrinkles remain:

- Documents in the fallback lose visual faithfulness to the original. They render as a reconstruction of OCR'd paragraphs, not the source page as photographed. A reviewer who wants to see the scan itself — to eyeball alignment against OCR output, or to check a handwritten signature — has no surface for it inside the review UI.
- The evidentiary story softens slightly. Two viewer surfaces coexist, and the audit trail must record which one was used for each document. Defensible ("routed to HTML because canonical PDF has no selectable text layer, per automatic classification at ingest") but less clean than single-surface.

---

## The proper architectural answer

Embed Azure Document Intelligence's `prebuilt-read` OCR output back into the canonical PDF as an invisible text layer at processing time. DI already extracts word-level bounding boxes and recognised text for every document as part of the existing pipeline — no new Azure call needed. PyMuPDF can insert invisible text via `insert_textbox` with `render_mode=3` at those exact word-polygon coordinates, producing a PDF that renders identically to the scanned original but with a selectable text layer synthesised from OCR.

With text-layer injection shipped:

- pdf.js text layer is populated for every canonical PDF regardless of source.
- Manual selection, Ctrl-F, screen readers all work on scanned content (bounded by OCR quality).
- Option C's routing fallback becomes deletable; the HTML reconstruction view can genuinely be sunsetted (Phase 5 of the viewer rework unblocked).
- Single-surface evidentiary story across every document class.

Rough scope estimate for a dedicated workstream if prioritised: 9–15 engineer-days covering pipeline injection, reviewer-facing cues for OCR-sourced text, an evaluation harness benchmarking recognition quality against a held-out scanned corpus, and regression coverage against the existing redaction pipeline. Custom DI model training for recurring document templates is optional follow-on work, open-ended depending on template volume.

---

## Handwritten — accept imperfection

Azure DI's `prebuilt-read` recognises handwriting as part of the same model. Accuracy varies wildly with legibility, ink contrast, tilt, and page condition. The text-layer injection approach applies the same way, but injected text will sometimes read wrong under the cursor even when the visible glyph is correct — a fundamental OCR artefact, not a bug, and any handwritten-document workflow accepts it upfront.

Three postures for the UI, product call rather than pure engineering:

- Inject the recognised text and trust it. Simplest. Reviewer verifies by eye on any high-stakes detection.
- Inject with a visual cue marking handwritten regions so reviewers know to double-check detections there. More honest, more plumbing.
- Skip injection for handwriting and require pure-manual redaction on affected pages. Zero automation; every word reviewed by hand.

No decision yet. The right answer likely depends on what classes of handwritten content actually show up in council disclosure packs — signatures on printed letters are easy; scanned multi-page handwritten memoranda are harder.

---

## Alternative Azure services worth evaluating when the workstream lands

- **Azure AI Vision `Read` API.** Standalone OCR, similar underlying technology to DI's `prebuilt-read` but priced and scoped differently. Worth benchmarking against the current DI implementation specifically for handwriting accuracy.
- **DI `prebuilt-layout`.** Adds structural metadata (tables, headings, reading order) on top of `prebuilt-read`'s word extraction. More expensive per page, but useful if handwritten content sits inside structured forms (a signed intake form with handwritten fields, for example) and we want the form structure preserved in the injected text layer.
- **DI custom model training.** For high-volume recurring document templates — a specific council's standard intake form, a common Ombudsman correspondence template — a custom-trained model can dramatically outperform the generic `prebuilt-read`. Template-by-template investment rather than a single build.

---

## Trigger conditions for prioritisation

This gap moves from "noted" to "planned workstream" when any of:

- A tenant reports Option C's banner hitting often enough to generate a workflow complaint — reviewers are being routed to HTML more than occasionally and feeling the loss.
- Scanned-document share of a live tenant's corpus exceeds ~20% (current estimate is <10%).
- A compliance or audit driver requires single-surface evidentiary guarantees across all document classes, forcing the HTML view's sunset.
- A customer asks specifically for text selection, Ctrl-F, or screen-reader support on scanned content.

None currently hit. This document exists to capture the gap and the rough shape of its solution so that when a trigger does hit, the workstream starts from "read this doc" rather than "rediscover the problem".
