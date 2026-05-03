# Umbra v2 — Phase 12 Investigation

Investigation pass, **no code changes**. Captures current-state facts and gap
analyses to inform a phased plan. Citations are `path:line` ranges.

---

## 1. Detection coverage diagnosis — why personal names aren't reliably caught

### Pipeline flow (so the failure modes have a frame)

`lib/pipeline/process.ts:556-735` runs detectors in this order, then merges:

1. `detectPatterns` (`lib/pipeline/patterns.ts`) — regex
2. `detectLabelAdjacent` (`lib/pipeline/label-adjacent.ts`) — labelled tables
3. `detectSectionMarkers` (`lib/pipeline/section-marker-detect.ts`) — free-frank sections
4. `executeCustomRules` (`lib/pipeline/custom-rules.ts`) — admin keyword rules
5. `detectWithAI` (`lib/pipeline/ai-detect.ts`) — GPT-4o, the only source for `personal-name`
6. `propagateNameDetections` (`lib/pipeline/entity-propagation.ts`) — variant expansion off AI seeds

After detection: bbox enrichment (`process.ts:783-835`), then dedup by
`(page, type, text, posY_rounded)` (`process.ts:851-870`), then
`prisma.detection.create` with `status: "pending"` (`process.ts:884-901`).

**`personal-name` never appears in `lib/pipeline/patterns.ts`** — there is no
regex pathway. AI is the only path that can anchor a name; entity-propagation
only fires off existing AI seeds. If the AI batch returns no name detections,
zero names land in the DB.

### Top-3 hypotheses ranked by likelihood

#### Hypothesis A — AI prompt is LGOIMA-curatorial, not PII-mass-redaction (HIGH likelihood)

`lib/pipeline/ai-detect.ts:207-209` opens with *"You are an expert LGOIMA
document reviewer for a New Zealand local council. Analyze the following
document pages and identify text that may need to be **withheld under
LGOIMA**."* Combined with `:373-381`'s "Important context" — public officials
have lower expectations, published contact info is generally public, focus on
**private individuals, submitters, complainants, junior staff** — the prompt
asks the model to make a judgement call on whether a name is *withholdable*
rather than *what is a name*. Council staff names get suppressed by design;
ambiguous cases (third-party professionals named without grievance context)
sit in the model's uncertainty band.

For mass redaction the question is "is this a person's name?" — the LGOIMA
suppression carve-outs at :378 and the "withheld under LGOIMA" framing
push the model away from listing every name.

**Verification approach:**

- Pick 2-3 deployed batches with known under-detection. From `extracted.totalText`
  (or the canonical PDF), extract a ground-truth list of personal-name
  spans.
- Run a stripped-down prompt against those pages: "List every personal name
  you see, exact text spans, JSON output." Compare recall against the
  current prompt.
- If recall rises sharply with the stripped prompt, hypothesis confirmed.
- Bonus: look at the existing bench harness (`scripts/bench/bench-detection.ts`,
  `lib/bench/`) — it likely already runs `personal-name` recall against
  fixtures; if Eugene has bench output from the deployed prompt vs an
  earlier prompt, we may not need a fresh run.

#### Hypothesis B — `harassment-risk` siphons names that should be `personal-name` (MEDIUM)

`lib/pipeline/ai-detect.ts:286-292` and worked example 7 (`:321-323`) instruct
the model: *"if a specific sentence instead identifies a complainant, a
witness, or a subject of a grievance alongside personal details → type
`harassment-risk`"*. The model is explicitly told **not** to use
`personal-name` in those cases.

Implication: in any document that looks like a complaint / grievance
(personnel correspondence, complaint letters, investigation reports), the
named individual gets typed `harassment-risk` instead of `personal-name`.
Phase 12 drops `harassment-risk` (locked decision 1), so those names will
be returned to `personal-name` automatically when the type is removed.
**But until the prompt is re-cut, the deployed instance drops these names
into a type that may or may not be enabled** (default-enabled per
`lib/data/settings.ts:87`, but a future toggle change could silence them).

`entity-propagation.ts:80` *does* seed off `harassment-risk`, which mitigates
the visibility issue *within* a document — propagation generates honorific
+ surname / bare-surname variants. But the seed type is preserved
(`entity-propagation.ts:21-22` design note: "carry the SEED's type, never
transmute"), so cross-doc consumers reading "personal-name" detections
won't see them.

**Verification approach:**

- Query deployed DB: for the affected batches, count detections grouped by
  `type`. If `harassment-risk` is non-trivial relative to `personal-name`,
  hypothesis confirmed.
- Spot-check: are the `harassment-risk` rows actually names that the user
  would call "names"?

#### Hypothesis C — The "council's own officials" carve-out over-suppresses (LOW-MEDIUM)

`lib/pipeline/ai-detect.ts:378` instructs the model: *"Names of THE
COUNCIL'S OWN elected officials, chief executives, and senior managers
acting in their official capacity on council-policy matters should NOT be
flagged."* In a PII-mass-redaction product (locked decision 1) this carve-
out is wrong: council staff names *are* PII. The model has no way to know
which document was authored by "this council" vs a different council, so
it likely defaults to suppressing many staff-shaped names.

This is downstream of A — fixing A's prompt ALSO fixes C in one pass. But
worth confirming as a distinct mechanism so the rewrite removes it
explicitly.

**Verification approach:**

- Same probe as A: a stripped prompt with no carve-out should pick up
  names the current prompt skipped.

#### Hypotheses ruled out (low likelihood)

- **Confidence threshold filtering names out of the pipeline.**
  `applyConfidenceThreshold` (`lib/actions/detection-actions.ts:445-493`)
  is admin-only and *batch-wide auto-accept above threshold*; it never
  drops detections. `DEFAULT_CONFIDENCE_THRESHOLDS = { high: 85, medium:
  50 }` (`lib/data/settings.ts:211`) drives UI grouping in bulk-review
  only. Pipeline storage at `process.ts:884-901` writes every dedupe-
  surviving detection to the DB regardless of confidence.

- **`enabledTypes` filter excludes `personal-name`.**
  `DEFAULT_DETECTION_TOGGLES` (`lib/data/settings.ts:70`) has "Personal
  Names" enabled by default. `getEnabledDetectionTypes` reads from DB,
  falling back to defaults. Unless an admin actively unchecked the toggle,
  the type is in the AI's allowed list.

- **Bbox dedup drops names.**
  Names are short (< 80 chars), so the long-narrative short-circuit
  (`process.ts:783-829`) doesn't apply. Dedup keys on `(page, type, text,
  posY_rounded)` — which would only collapse two name detections of the
  same text on the same line. That's correct behaviour.

- **`label-adjacent.ts` over-suppresses inline names.**
  Label-adjacent only fires on labelled rows ("Name: X", "GP: Dr Smith")
  and the GP entry is the only one that emits `personal-name`. This adds
  detections, never removes them.

### Recommendation for the verification phase

Run hypothesis A's stripped-prompt experiment first; the answer
dramatically narrows the rest. Then scan the DB for `harassment-risk` row
density against `personal-name`. If A explains most of the gap, the Phase
12 prompt rewrite (which is required anyway under locked decision 1)
solves the recall problem as a side-effect — no separate "fix names"
phase needed.

---

## 2. Detection-scope reduction blast radius (drop 11 governance/commercial types)

Types to drop: `commercial`, `council-commercial`, `negotiation`,
`legal-privilege`, `confidential`, `free-frank`, `harassment-risk`,
`cultural-sensitivity`, `safety-concern`, `law-enforcement`, `health-safety`.

Note that `confidential` was used as the **catch-all** type for
`label-adjacent.ts:138-153` (employee numbers, salary bands), so the rip
needs a new home for those — likely fold into `personal-name` or
introduce the new `sensitive-context` bucket per locked decision 1.

### File-by-file inventory

| File | What lives there | Effort |
|---|---|---|
| `lib/detection-type-grounds.ts:9-32` | `DEFAULT_GROUND_FOR_TYPE` map — entries for all 11 types | Trivial — delete keys |
| `lib/pipeline/ai-detect.ts:119-126` | `ALL_AI_TYPES` array — 9 of the 11 listed (no nz-driver-licence/nhi here, those are pattern-only) | Trivial — delete entries |
| `lib/pipeline/ai-detect.ts:133-160` | `GROUND_DETECTION_TYPE_MAP` — 13 ground IDs map to dropped types | Trivial — delete entries |
| `lib/pipeline/ai-detect.ts:217-236` | Type descriptions in prompt — 11 dropped + paragraph each | **MEDIUM** — wholesale prompt rewrite (see Q1) |
| `lib/pipeline/ai-detect.ts:251-279` | "DETECTION GUIDANCE BY GROUND" section | **MEDIUM** — wholesale rewrite |
| `lib/pipeline/ai-detect.ts:281-294` | "STRUCTURAL HEURISTICS" | **MEDIUM** — most heuristics target dropped types |
| `lib/pipeline/ai-detect.ts:295-371` | 19 worked examples — examples 1-7, 9-11, 16-18 reference dropped types | **MEDIUM** — keep PII-only examples |
| `lib/pipeline/ai-detect.ts:18, 168-205` | `lgoimaGrounds` import + `buildGroundsReference()` builds the prompt grounds table | **LARGE** — entire grounds-reference machinery becomes obsolete |
| `lib/pipeline/patterns.ts` | No regex pattern targets a dropped type — clean | Zero |
| `lib/pipeline/label-adjacent.ts:138-191` | Employee-number / salary / ICD-10 entries emit `confidential` | **SMALL** — re-target to `sensitive-context` (or whatever locked decision 1 calls it) |
| `lib/pipeline/section-marker-detect.ts` | Whole file is for free-frank / candid sections — produces `free-frank` and other sentence-level types | **DELETE FILE** — no pathway in v2 |
| `lib/pipeline/entity-propagation.ts:80` | `SEED_TYPES = new Set(["personal-name", "harassment-risk"])` — drop `harassment-risk` | Trivial |
| `lib/pipeline/process.ts:25, 587-591` | Imports + invokes section-marker-detect | Small — delete call site |
| `lib/data/settings.ts:70-89` | `DEFAULT_DETECTION_TOGGLES` — 10 of 19 toggles target dropped types | Trivial — delete entries |
| `lib/data/settings.ts:93-113` | `DETECTION_TYPE_MAP` — toggle-label → type-key for all 19 | Trivial — delete entries |
| `lib/lgoima-grounds.ts` (entire file) | The whole grounds vocabulary is obsolete in v2; only `s7_2a` (personal privacy) survives meaningfully | **MOVE to `legacy-veil/`** or delete entirely |
| `lib/validation/schemas.ts` (Zod) | Likely has detection-type enum or ground-id enum | Small — re-cut enum |
| `lib/db/mappers.ts` | Surfaced in grep — type-aware mapping for UI | Small — delete dropped types |
| `lib/pipeline/redact-pdf.ts` | Likely has type-aware redaction colour or behaviour | Small — verify, delete |
| `lib/pipeline/doc-classify.ts:25-32` | `containsLegalAdvice / Personnel / Commercial / Cultural / Enforcement` flags + their listing in prompt at `:72-78` | **DELETE FILE OR LARGELY REWRITE** — the entire classifier serves the AI prompt's governance-routing decisions; it goes when those decisions go |
| `app/batches/[id]/review/[docId]/review-client.tsx` | Type-aware UI labels, colours, ground dropdowns | **MEDIUM** — much of the per-detection UI is type-aware; expect ~50-100 lines of trim |
| `app/batches/[id]/bulk-review/bulk-review-client.tsx:26, 226-228, 250-252` | Imports `lgoimaGrounds`, has bulk-apply-ground UI | **MEDIUM** — bulk-apply-ground feature dies, drop the relevant UI panels |
| `app/batches/[id]/qa/qa-client.tsx` | Lighter type references (status counts) | Small |
| `app/landing-page.tsx` | Marketing copy possibly mentions LGOIMA grounds | Small — cosmetic |
| `lib/bench/pathways.ts`, `lib/bench/__tests__/*` | Bench scoring split by type-pathway | **MEDIUM** — bench needs a pathway re-cut for PII-only |
| `lib/__tests__/lgoima-grounds.test.ts` | Tests the dropped vocabulary | Delete |
| `lib/__tests__/detection-type-grounds.test.ts` | Asserts count = 22, will need to re-pin | Small |
| `lib/pipeline/__tests__/section-marker-detect.test.ts` | Tests deleted module | Delete |
| `lib/pipeline/__tests__/entity-propagation.test.ts` | Tests `harassment-risk` seeding | Trim |
| `prisma/seed.ts` | Ministry of Demo currently has no documents — clean | Zero |

### Effort estimate

| Stream | Effort |
|---|---|
| Code drops + renames | ~1.5 person-days |
| **AI prompt rewrite (the big one)** | **~2 person-days** including iteration against bench fixtures |
| Test triage + bench re-cut | ~1 person-day |
| UI trim (bulk-review, review-client, qa) | ~1.5 person-days |
| Migration: do existing prod detections of dropped types just live until purge? Or backfill-clear? | Decision required (see hidden side-effect 3 below) |
| **Total Phase 12 type-drop slice** | **~6 person-days** |

### Hidden side-effects

1. **`confidential` is the label-adjacent catch-all**, used for employee
   numbers (`label-adjacent.ts:138-148`), salary bands (`:150-153`), and
   ICD-10 codes (`:181-191`). Need a target type before drop or the
   detector dies silently on those rows. Locked decision 1's
   `sensitive-context` bucket is the right home.

2. **`buildSystemPrompt` always allows `confidential` regardless of
   toggles** (`ai-detect.ts:435`) and `label-adjacent.ts:340-348` mirrors
   that. This special-case logic disappears with the type, simplifying
   both files.

3. **Existing prod detections** of dropped types are already in DB rows.
   `prisma.detection.findMany({ where: { type: "free-frank" } })` would
   still return them post-rip. Decide: backfill-purge-on-deploy, or accept
   that legacy rows hang around until natural data turnover. Cheap to
   purge: `DELETE FROM detections WHERE type IN (…)`. Worth doing.

4. **`doc-classify.ts` is upstream of AI detection** and its output feeds
   the prompt context block. After the type drop, all five "contains*"
   booleans become inert; classification still helps surface document type
   ("complaint", "policy-document") which a future PII workflow may want.
   But the *detection-routing* purpose is gone. **Recommendation: delete
   `doc-classify.ts` entirely** as part of the prompt rewrite, and pass
   only document type / page count to the prompt if needed.

5. **`section-marker-detect.ts` (430 LoC) becomes orphan.** Its sole
   purpose is auto-flagging sentences inside `(free and frank)` /
   `(candid commentary)` headers. Delete with the prompt rewrite.

6. **Bench fixtures and pathway scoring** (`lib/bench/pathways.ts`)
   currently score across PII / commercial / governance pathways. The
   commercial + governance pathways disappear; the bench needs a re-cut
   to reflect PII + sensitive-context. If the bench is not updated
   in lockstep, regression metrics become misleading.

7. **`entity-propagation.ts` carries seed-type fidelity.** Drop
   `harassment-risk` from the seed set (`:80`) and the propagator becomes
   a personal-name-only specialist. Worth renaming for clarity.

### What survives cleanly

- `personal-name`, `phone`, `email-addr`, `address`, `ird`,
  `nz-driver-licence`, `nhi`, `nz-passport`, `bank-account`, `vehicle-reg`,
  `manual` — all still in the type list
- All regex patterns in `lib/pipeline/patterns.ts`
- `entity-propagation.ts` (with `harassment-risk` removed from seed set)
- Most of `label-adjacent.ts` (just retarget the `confidential` entries)
- All bbox / dedup / redact-pdf / export machinery (type-agnostic)

---

## 3. Mass-redaction UX gap analysis (current → target)

### Current workflow

1. **Batch creation** (`lib/actions/batch-actions.ts`).
   Batch status: `draft`. Reference auto-generated `BATCH-YYYY-NNN`
   (`lib/data/batches.ts:82-93`).
2. **Document upload** (`app/api/documents/upload/route.ts`).
   Each doc starts at status `pending` then `processing`. Batch goes to
   `processing` per `recomputeBatchStatus` (`batches.ts:182-184`).
3. **Per-document processing** (`lib/pipeline/process.ts:71`).
   Pattern + label-adjacent + section-marker + custom-rules + AI →
   merge → bbox → dedup → write. All detections written with
   `status: "pending"` (`process.ts:894`). Doc transitions
   `processing → ready` (`process.ts:978`). Batch recomputes:
   when all docs `ready`, batch goes `ready-for-review`
   (`batches.ts:187-188`).
4. **Bulk-review UI** (`app/batches/[id]/bulk-review/bulk-review-client.tsx`).
   Reviewer can:
   - **Confidence-threshold sweep** (`:287-300` calls
     `applyConfidenceThreshold`). Slider, default 85%, admin-only.
   - **Bulk accept by similar entity text** (`bulkAcceptBySimilar`,
     batch-scoped, case-insensitive exact match,
     `detection-actions.ts:503-555`).
   - **Bulk accept by type with ground assignment**
     (`bulkAcceptByType`).
5. **Per-document review**
   (`app/batches/[id]/review/[docId]/review-client.tsx`, 2493 LoC).
   Reviewer opens a doc → status moves `ready → in-review`
   (`detection-actions.ts:98-141`'s `markDocumentInReview`). Per-detection
   accept/reject. When all detections actioned: doc → `reviewed`
   (`recomputeDocumentStatus`, `:47-69`).
6. **Sign-off** per document (`signOffDocument`, `:169`). Doc →
   `signed-off`. When all docs in batch are `signed-off`, batch →
   `reviewed` (`batches.ts:185-186`).
7. **Export**, manual trigger via
   `app/batches/[id]/export/export-client.tsx:213` POSTing to
   `/api/export/[batchId]/generate`. Builds the single ZIP. Batch →
   `exported` (`batches.ts:152-164`).

**Where review happens:** steps 4 + 5. Bulk-review is already a
power-user shortcut, but it sits *alongside* per-document review rather
than replacing it. The 2493-line review-client is the dominant code path.

### Target workflow (per locked decision 2)

```
upload → process → auto-accept high-conf → tray (medium-conf only) → export
```

- **Auto-accept high-confidence + regex matches** without reviewer
  involvement.
- **Medium-confidence land in a tray** — cluster view, not per-doc.
- **Low-confidence ignored** (or surfaced as a separate "uncertain" bucket
  for spot-check).
- **Export auto-fires** when the tray is empty (or when reviewer clicks
  "export anyway, accepting tray as rejected").

### Gap — where auto-accept policy would live

Today, every detection lands at `process.ts:894` with `status: "pending"`.
The clean intervention point is right there: replace the static `pending`
with a confidence-tier decision *at write time*.

```ts
// pseudo
const tier = bucketConfidence(det.confidence, det.source);
const status =
  tier === "high"   ? "accepted" :   // skip review entirely
  tier === "medium" ? "pending"  :   // tray
                      "rejected";    // ignore (or "skipped")
```

`bucketConfidence` reads `RETENTION_CONFIG`-style settings (new
`AUTO_REDACT_CONFIG` key). Pattern + label-adjacent matches default to
the high tier (confidence 95, deterministic). AI detections route by
their model-emitted confidence. That single change makes the tray
inherently medium-conf only.

### Gap — confidence tiers

`DEFAULT_CONFIDENCE_THRESHOLDS = { high: 85, medium: 50 }`
(`settings.ts:211`) already exists as a *user-facing slider config*.
Repurpose for auto-accept policy: tier defaults of high≥85, medium 50-85,
low<50 are sensible. UI surface: setup wizard step + admin Settings tab
(both already exist). Make the medium band reviewer-configurable per-batch
if precision varies by document type.

### Gap — document state machine

Current state machine **was designed for the manual-review flow**:
`pending → processing → ready → in-review → reviewed → signed-off`.

For mass-redact:
- `ready` → `auto-redacted` shortcut when zero pending detections remain
  after auto-accept tier-routing (i.e. the doc had only high-conf
  detections, all auto-accepted at write time).
- `ready` → `in-review` only when the doc has medium-conf detections in
  the tray.
- `signed-off` becomes optional (or default to auto-sign-off when batch
  is auto-redacted with no tray pending).

This is a **schema-friendly, code-deep change** — `recomputeBatchStatus`
(`batches.ts:143-200`) needs new branches, `recomputeDocumentStatus`
(`detection-actions.ts:47-69`) needs to recognise the auto-redacted state,
and the review UI needs a third "auto-redacted (nothing to do)" branch.

### Gap — batch state machine

Same pattern: add `auto-redacting` and `auto-redacted` states. Or fold
into the existing `processing` and `reviewed` to minimise schema churn —
the *meaning* changes more than the *names*.

### Gap — export auto-trigger

Today export is manual via the export-client UI. For mass-redact,
auto-fire export when a batch transitions to `auto-redacted` (no tray)
or after the reviewer clears the tray. The export action
(`/api/export/[batchId]/generate`) is already orchestrated server-side;
just needs a triggering call site beyond the manual button.

### Files / components survival map

**Survive:**

- All detection pipeline (`lib/pipeline/*` minus `section-marker-detect.ts`,
  `doc-classify.ts`)
- Bbox / dedup / redact-pdf machinery
- Storage abstraction
- Audit trail
- Export pipeline (`lib/pipeline/export.ts`, the redaction-schedule /
  audit-timeline / audit-log generators)
- Retention / purge worker
- Server actions: `softDeleteBatch`, `purgeNowBatch`, `getBatch[es]`,
  `markDocumentInReview` (still useful for tray docs), `signOffDocument`
  (becomes optional)

**Reshape, not rewrite:**

- `lib/pipeline/process.ts` — add tier-routing block at write time
  (~30 LoC change + new helper)
- `lib/data/batches.ts:recomputeBatchStatus` — new branches
- `lib/data/settings.ts` — new `AUTO_REDACT_CONFIG` key alongside
  existing thresholds
- `lib/actions/detection-actions.ts:applyConfidenceThreshold` — already
  does the right thing for one-time bulk-accept; still useful as a
  reviewer escape hatch

**Rewrite or replace:**

- `app/batches/[id]/review/[docId]/review-client.tsx` (2493 LoC,
  per-document review) — most of it survives but with simplified
  defaults; the per-detection accept/reject UI is overkill when the tray
  already filtered to ambiguous-only. **Estimated 30-40% trim.**
- `app/batches/[id]/bulk-review/bulk-review-client.tsx` (982 LoC) —
  reframe as **the** review entry point ("Tray"), drop the threshold
  slider (now a setting), drop the bulk-apply-ground panels. Keep the
  cluster-by-entity view as the main UI. **Estimated 50% rewrite.**
- `app/batches/[id]/export/export-client.tsx` — trim, since auto-export
  becomes the default. Keep manual trigger as fallback.

**New code:**

- `bucketConfidence(detection)` helper (~30 LoC).
- Tray cluster aggregator: query detections grouped by
  `(type, normalisedText)` per batch, count occurrences, surface to UI.
  Already prototyped in `bulkAcceptBySimilar` logic
  (`detection-actions.ts:519-520`).
- Batch-level "Redact" entry-point action (`startBatchRedaction(batchId)`)
  that orchestrates the auto-accept + tray-population + auto-export
  pipeline.

### Effort estimate (mass-redaction UX slice)

| Stream | Effort |
|---|---|
| Tier-routing in pipeline + settings + state machine | ~2 person-days |
| Tray UI (rewrite of bulk-review) | ~3 person-days |
| Per-document review trim | ~1.5 person-days |
| Auto-export + state machine wiring | ~1 person-day |
| E2E test rewrites | ~2 person-days |
| **Total** | **~9.5 person-days** |

---

## 4. Cross-document approval feasibility (locked decision 3)

### Existing data shape

`prisma/schema.prisma` Detection model:
- `id, documentId, type, text, confidence, page, posX/Y/W/H, status,
  reasoning, aiExplanation, source, note, reviewedBy, reviewedAt`
- `@@index([documentId])`, `@@index([status])`. **No index on `(text)`,
  `(type, text)`, or any cross-doc grouping field.**
- No batch reference on Detection — must traverse via `Document`
  (`@relation(fields: [documentId], references: [id], onDelete: Cascade)`).

Already-built cross-doc query: `bulkAcceptBySimilar`
(`lib/actions/detection-actions.ts:503-555`) does an
in-memory case-insensitive exact-text match across a single batch's
detections. **No surrounding context is captured per-detection** beyond
the text itself, the page, and the bbox — so disambiguation between
"Sarah Mitchell from Finance" and "Sarah Mitchell the complainant" is
not currently possible without re-reading the page text.

### Disambiguation context — where to source it

Three options, increasing fidelity:

1. **Page-level context** — store `pageText` snippet (e.g. ±100 chars
   around the detection's bbox or text occurrence) on the Detection row.
   Adds ~200 bytes per detection × N detections → modest storage cost.
   Lets the tray cluster show "Sarah Mitchell appears in Doc-1 page 3
   with surrounding text 'Subject: Final report from Sarah Mitchell to
   the chair…' vs Doc-7 page 2 'Complaint received from Sarah Mitchell
   regarding…'".
2. **Document-classification context** — `Document.classification` JSON
   already exists (populated by `doc-classify.ts`). Surface document type
   ("complaint" vs "policy-document") in the cluster view. Already there;
   no schema change.
3. **AI clustering** — second AI call: "are these N occurrences of the
   text X likely the same person?". Slower, more accurate, costs $.
   Worth holding for v3.

### Three approval scopes

#### (a) Within-document only (status quo)

**Schema:** zero changes. **UI:** existing per-doc review.
**Risk:** none beyond today.
**Reviewer effort:** O(detections-per-doc × docs) — what users complain
about now.

#### (b) Within-batch propagation (RECOMMENDED for Phase 12)

**Schema:** optional `pageContext: String?` column on Detection (~200
bytes), `@@index([type, text])` for fast clustering queries. Migration is
small, idempotent, additive.

**UI:** the tray groups by `(type, normalisedText)`; reviewer sees
"Sarah Mitchell — 8 occurrences in 3 docs" with snippet preview.
Approve once → all 8 transition `pending → accepted`.
The mechanism is already built in `bulkAcceptBySimilar`; it just needs
a tray-shaped UI.

**Risk:** **low-to-medium**. Two "Sarah Mitchell"s in the same batch is
plausible (e.g. employee + complainant). The disambiguation context
mitigates but does not eliminate. Reviewer flow: click cluster → preview
snippets → approve all OR pick subset → remaining stay pending for
individual review.

**Effort:** ~3 person-days (schema migration + tray cluster query +
disambiguation UI).

#### (c) Cross-batch propagation

**Schema:** as (b) plus a denormalised `batchId` on Detection (or rely
on JOIN through Document — slower at scale). Worse, cross-batch context
breaks the **tenant boundary** of "batch as a unit of work" — a name
approved in BATCH-2026-001 auto-applies to BATCH-2026-007 even though
the latter might be a different requester / different sensitivity
context.

**UI:** "Sarah Mitchell — appears in 12 batches, 47 docs. Approve
across all?". Sounds powerful; in practice usually wrong.

**Risk:** **HIGH**. Two genuinely different Sarah Mitchells across
unrelated batches will collide invisibly. Auto-redacting one batch's
Sarah Mitchell as another batch's redaction set is a real-world false-
positive class that's hard to detect after the fact (export ZIPs are
final).

**Recommendation:** defer to v3. The 80/20 win is (b), and (c) only
adds value when batch volumes scale beyond ~50/year per org.

### Approval-memory persistence (locked decision 3, "system suggests matches in subsequent occurrences")

(b) handles this implicitly: clustering is on demand at tray-render time,
no need for a persistent "Approved entities" table. But for *future*
occurrences in *future* batches, a stored "approved-entity allow-list"
is the natural mechanism — write-only, scoped per-batch, rolls in
slowly. Skeleton:

```prisma
model ApprovedEntity {
  id        String   @id @default(cuid())
  type      String   // detection type
  text      String   // canonical form
  scope     String   // "batch" | "global"
  scopeId   String?  // batchId when scope = "batch"
  approvedBy String
  approvedAt DateTime @default(now())
  @@index([type, text])
  @@index([scopeId])
}
```

Future processing pipeline runs check this table during the auto-accept
tier decision and skip the review tray for matched (type, text). This
is the ground truth for "smart matching with disambiguation" once we
want the system to remember.

**Recommendation:** ship (b) without `ApprovedEntity` first; add the
table in a fast-follow when the feedback says reviewers are repeatedly
approving the same names across batches.

---

## 5. Bottom line

### Top 3 easy wins

1. **The names-recall problem is most likely the prompt itself**, and the
   prompt has to be rewritten anyway to drop the 11 governance/commercial
   types. That rewrite is the single highest-leverage change in Phase
   12 — it solves both the locked-scope reduction and the recall gap in
   one pass.
2. **Tier-routing at write time is a 30-line surgical change in
   `process.ts`** that delivers the auto-accept + tray default behaviour
   without touching the dedup, bbox, storage, or export machinery.
   Settings already has `DEFAULT_CONFIDENCE_THRESHOLDS`; reuse it.
3. **Cross-doc approval scope (b)** is mostly already built —
   `bulkAcceptBySimilar` is the worker; the missing piece is a tray
   cluster-list UI on top of it. ~3 person-days for a real Phase 12
   feature.

### Top 3 watch-outs

1. **`harassment-risk` removal is one-way.** Once the type is gone, the
   AI won't produce it; deployed batches with `harassment-risk` rows
   will become orphan-typed. Decide on backfill (`UPDATE detections
   SET type='personal-name' WHERE type='harassment-risk'`) before the
   release lands.
2. **`label-adjacent.ts:138-191`'s employee-number / salary / ICD-10
   entries quietly emit `confidential`.** If you drop `confidential`
   without retargeting these, those detections vanish. Re-target to the
   new `sensitive-context` bucket as part of the same commit.
3. **The bench harness scoring assumes the existing pathway split**
   (`lib/bench/pathways.ts`). Without a parallel bench update, the
   regression metrics post-rip will be misleading or unreadable. Plan
   the bench re-cut into the same phase as the prompt rewrite.

### Phase 12 effort estimate (person-days)

| Slice | Estimate |
|---|---|
| Detection-scope drop + prompt rewrite + bench re-cut | ~9 |
| Mass-redaction UX (tier-routing + tray + state machine + auto-export) | ~9.5 |
| Cross-batch approval scope (b) — schema + tray UI | ~3 |
| Test rewrites + E2E updates | ~3 |
| Production migration (legacy detection rows, settings rebase) | ~1 |
| Documentation refresh | ~1 |
| **Total** | **~26-27 person-days** |

Comparable to the original Veil → Umbra fork (~22-25 days). Phase 12 is
*not* a small refactor — it's the second major repositioning of the
codebase since the fork, and the prompt rewrite alone is a multi-day
iteration loop.

### Suggested phasing (informational — for the actual plan)

1. **12.0** — Investigation pass (this doc) + locked decisions confirmed.
2. **12.1** — Detection-scope drop + prompt rewrite + bench re-cut.
   Largest single phase; enables everything else by stabilising the type
   set and the AI signal.
3. **12.2** — Tier-routing in pipeline + settings + state machine.
   Behavioural change; reviewer flow shifts to tray-by-default.
4. **12.3** — Tray UI (bulk-review rewrite) + per-document review trim
   + auto-export wiring.
5. **12.4** — Cross-batch approval scope (b) with `pageContext` capture.
6. **12.5** — Production migration, telemetry refresh, retrain reviewers.
