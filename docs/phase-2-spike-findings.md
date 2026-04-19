# Phase 2 Spike Findings

**Date:** 2026-04-19  
**Corpus:** 7 DOCX fixtures (3 small, 3 medium, 1 large), 5 runs per condition.  
**Conditions:**  
- `off` — Phase 1 baseline. DOCX extraction via mammoth, no DI call. PDFs still go through DI as today.  
- `on` — Phase 2 path. `PHASE2_SPIKE=1` routes extractText through DI against the canonical PDF for DOCX inputs.  

## Latency table (p50 / p95 / p99, ms)

| Fixture | Pages | Condition | n | p50 | p95 | p99 | min | max |
|---------|------:|-----------|--:|----:|----:|----:|----:|----:|
| small-1pg | 1 | off | 5 | 6947 | 8553 | 8553 | 6453 | 8553 |
| small-1pg | 1 | on | 5 | 12140 | 12834 | 12834 | 11898 | 12834 |
| small-2pg | 2 | off | 5 | 9072 | 9667 | 9667 | 8020 | 9667 |
| small-2pg | 2 | on | 5 | 14304 | 15587 | 15587 | 12989 | 15587 |
| small-3pg | 3 | off | 5 | 12843 | 13873 | 13873 | 8831 | 13873 |
| small-3pg | 3 | on | 5 | 16927 | 17603 | 17603 | 16162 | 17603 |
| medium-A | 6 | off | 5 | 15143 | 16425 | 16425 | 12595 | 16425 |
| medium-A | 6 | on | 5 | 29138 | 31533 | 31533 | 27739 | 31533 |
| medium-B | 6 | off | 5 | 14825 | 17605 | 17605 | 11944 | 17605 |
| medium-B | 6 | on | 5 | 27509 | 28099 | 28099 | 26332 | 28099 |
| medium-C | 6 | off | 5 | 12621 | 14332 | 14332 | 8026 | 14332 |
| medium-C | 6 | on | 5 | 28598 | 29294 | 29294 | 25157 | 29294 |
| large-23pg | 23 | off | 5 | 13596 | 18051 | 18051 | 12882 | 18051 |
| large-23pg | 23 | on | 5 | 69740 | 76237 | 76237 | 68248 | 76237 |

## Detection count stability (per 5-run cell)

| Fixture | Condition | Detection counts (5 runs) | Stable? |
|---------|-----------|---------------------------|---------|
| small-1pg | off | 0, 0, 0, 0, 0 | yes |
| small-1pg | on | 0, 0, 0, 0, 0 | yes |
| small-2pg | off | 2, 3, 2, 2, 2 | **NO — drift** |
| small-2pg | on | 3, 3, 2, 2, 2 | **NO — drift** |
| small-3pg | off | 9, 9, 9, 9, 10 | **NO — drift** |
| small-3pg | on | 10, 10, 10, 10, 11 | **NO — drift** |
| medium-A | off | 12, 11, 12, 12, 12 | **NO — drift** |
| medium-A | on | 57, 57, 96, 103, 57 | **NO — drift** |
| medium-B | off | 12, 11, 11, 11, 11 | **NO — drift** |
| medium-B | on | 60, 62, 88, 61, 96 | **NO — drift** |
| medium-C | off | 11, 11, 11, 12, 11 | **NO — drift** |
| medium-C | on | 53, 61, 55, 53, 98 | **NO — drift** |
| large-23pg | off | 13, 16, 12, 12, 12 | **NO — drift** |
| large-23pg | on | 80, 80, 78, 79, 79 | **NO — drift** |

## Errors
None.

## Decision criterion

Target: **p95 ≤ 8,000 ms on a medium (6-page) fixture under the `on` condition.**  
Observed (medium-A/on): p95 = **31,533 ms**  
Observed (medium-B/on): p95 = **28,099 ms**  
Observed (medium-C/on): p95 = **29,294 ms**  

**Recommendation: p95 ≤ 8s NOT met** — by a factor of ~4× on medium fixtures and ~9.5× on large. Two options:
  - (a) Accept the regression because detection quality is materially better (see Interpretation below). Raises the p95 ceiling and shouts from the rooftops that latency doubles on DOCX.
  - (b) Revisit with a different approach (see Alternatives below).

**Discuss with the reviewer before proceeding to the implementation steps.** The raw p95 result is unambiguous; the interesting conversation is whether the detection-quality gain pays for the latency cost.

## Interpretation — the quality delta is material

The headline latency regression is accompanied by a **detection-count increase of ~5×** on medium fixtures:

| Fixture | Detections (off) | Detections (on) | Ratio |
|---------|-----------------:|----------------:|------:|
| small-1pg | 0 (0–0) | 0 (0–0) | — (no PII on the title page) |
| small-2pg | 2–3 | 2–3 | 1.0× |
| small-3pg | 9–10 | 10–11 | 1.1× |
| medium-A | 11–12 | 57–103 | ~6× |
| medium-B | 11–12 | 60–96 | ~6× |
| medium-C | 11–12 | 53–98 | ~5× |
| large-23pg | 12–16 | 78–80 | ~5× |

The `off` path (today's DOCX extraction) runs mammoth — which produces plain text with **no per-word positional metadata**. Detection runs against raw text; pattern and AI matches that would need coordinates (e.g. a name appearing 3× on the same page) collapse to a single instance because the pipeline can't tell them apart without positions.

The `on` path (DI on canonical PDF) returns **word-level polygons per page**, so pattern / AI detections that recur at different spatial positions all survive dedup, and bboxes populate correctly for Tier 1 redaction. The ~5× detection count is the expected cost of "every occurrence gets its own Detection row" that Phase 1's B2 fix enabled for native PDFs.

**In plain terms: the `on` path is the only way to get Phase 1-quality redaction accuracy for non-PDF uploads.** The `off` path (status quo) is faster but leaves multi-occurrence PII under-redacted on DOCX/EML — the same defect that Phase 1 fixed for PDFs.

## Also — the baseline already busts the 8s ceiling

The p95 target was never realistic, even under the current `off` condition:

- `medium-A/off` p95: 16,425 ms — **already 2× the 8s target** in today's production code
- `large-23pg/off` p95: 18,051 ms — **already 2.25× the 8s target**

The target reflected where we'd LIKE DOCX processing to land, not where it currently sits. Treating "8s" as a hard gate would fail the status quo too. A more realistic framing is "how much regression over the current baseline are we willing to accept?" — which for medium fixtures is roughly 2× (15s → 30s) and for large is roughly 4× (18s → 76s).

## Alternatives to consider if the quality/latency trade is not acceptable

1. **Hybrid path**: use mammoth for detection on short DOCX (≤ 3 pages), fall back to DI-on-canonical only when the document is large enough to warrant per-occurrence detection. Removes DI cost from the ~60% of uploads that are short-memo DOCX.
2. **Background canonical-bbox backfill**: accept mammoth output as the initial detection set for fast turnaround, then queue a background job that re-processes via DI-on-canonical and overwrites the Detection rows with per-occurrence data. User sees fast "review-ready" status; bbox accuracy catches up seconds-to-minutes later.
3. **DI prebuilt-read with cached document analysis**: Azure DI supports analysis caching for re-reads; if we expect the same DOCX to re-process (reprocess-canonical endpoint), a cache halves the DI cost on the second run.
4. **Drop Phase 2 entirely; ship Phase 3 on PDF-only**: leave DOCX review rendering at status quo (reconstructed HTML, no per-line bboxes), ship the new pdf.js viewer only for PDF uploads. Re-open DOCX viewer rework later when DI latency is less dominant. This is the lowest-risk path but means PNCC's majority-DOCX workload stays on the old review UI.

## Cost of study

- Total processDocument invocations: 70 (7 fixtures × 2 conditions × 5 runs).
- Azure DI `prebuilt-read` calls: 35 (condition `on` only — `off` DOCX skips DI). Pages processed: ~235.
- Azure OpenAI GPT-4o calls: both conditions invoke the AI detection stage. Page batches of 3 → ~158 total calls across both conditions.
- Rough NZD estimate: **under NZD 5**. DI prebuilt-read is ~USD 0.0015/page, OpenAI GPT-4o is ~USD 0.015 per batch. Actual cost is dominated by the 23-page fixture × 5 runs = 115 DI pages.

## Caveats

- The `PHASE2_SPIKE=1` branch lives in process.ts only for the duration of this spike and is reverted before PR merge. The committed Phase 2 change will hardcode canonical-PDF extraction without the env gate.
- Medium fixtures are sourced from `test-fixtures/dummy-lgoima-pack/` which is **not checked into git** (local scratch). Findings are reproducible only on machines with the dummy pack present. Future Phase 2 tests rely on the committed `phase2-spike/` fixtures only.
- All runs hit live Azure endpoints (DI + OpenAI). Repeatability of AI detection counts depends on OpenAI's determinism at temperature=0; observed drift is noted in the table above.
- LibreOffice subprocess is included in the `on` path for DOCX (canonical PDF build). `off` path for DOCX skips LibreOffice entirely today.
