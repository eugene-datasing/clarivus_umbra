# Detection-coverage benchmark baselines

This directory is the standing source of truth for the detection-coverage benchmark harness. It holds the hand-authored ground truth (`<fixture>.expected.json`), the committed baselines (`<fixture>.baseline.json`), and the bench-run reports (`<fixture>.report.md` + `<fixture>.report.json`) for each bench fixture.

**Phase 2 tranche 1** (this landing) ships the scoring library, the reusable runner, and the CLI entry point. Fixtures and live-pipeline invocation arrive in tranche 2; CI wiring in tranche 3.

## Files

| Path | Purpose | Committed? |
|---|---|---|
| `README.md` | This file. | yes |
| `.gitkeep` | Placeholder so the directory exists even when no fixtures are committed. | yes |
| `<fixture>.expected.json` | Hand-authored ground truth for a specific fixture. Added in tranche 2. | yes |
| `<fixture>.baseline.json` | A frozen `FixtureScore` snapshot from a good `main` run, used as the regression floor. | yes |
| `<fixture>.report.md` | Human-readable output of `npm run bench:detection`. | generated; not committed in tranche 1 |
| `<fixture>.report.json` | Machine-readable twin of the markdown report. | generated; not committed in tranche 1 |

## `.expected.json` shape

One fixture per file. The scorer enforces type agreement plus optional page-number agreement plus exact-or-substring text matching (see `lib/bench/scoring.ts` for semantics).

```jsonc
{
  "fixtureSha256": "45f91de4df301f1328ea47eedcd566ca29109ba75ad7cc7da5ef5865d5661087",
  "documentType": "HR investigation",
  "expectedDetections": [
    {
      "text": "Melissa Ferguson",
      "type": "personal-name",
      "mustMatch": "exact",
      "page": 1,
      "pathway": "personal",
      "rationale": "Complainant name, captured in the page-1 summary table."
    },
    {
      "text": "HM847219",
      "type": "driver-licence",
      "mustMatch": "exact",
      "page": 1,
      "pathway": "personal"
    },
    {
      "text": "$55,000",
      "type": "legal-privilege",
      "mustMatch": "substring",
      "page": 3,
      "pathway": "governance",
      "rationale": "Settlement range inside Ben Mahuika's privileged advice sentence — substring because the AI will phrase the wrapper sentence slightly differently each run."
    }
  ]
}
```

Field reference:

| Field | Required | Notes |
|---|---|---|
| `fixtureSha256` | optional | SHA-256 of the source fixture. Mismatch between fixture-on-disk and expected's sha256 should cause the bench runner (tranche 2) to refuse to run. |
| `documentType` | required | Free-text label (e.g. "HR investigation", "council memo"). Shown in the report header. |
| `expectedDetections[]` | required | One entry per redactable span. |
| `expectedDetections[].text` | required | The text the reviewer must see flagged. |
| `expectedDetections[].type` | required | One of the detection-type vocabulary (see `lib/detection-type-grounds.ts`). |
| `expectedDetections[].mustMatch` | required | `"exact"` or `"substring"`. Choose `exact` for identifiers (DL, passport, DOB) and deterministic spans. Choose `substring` for AI-produced spans where the wrapper wording will drift. |
| `expectedDetections[].page` | optional | If set, the scorer requires the actual detection's page to match. If absent, page is ignored. |
| `expectedDetections[].pathway` | optional | Override the type→pathway mapping in `lib/bench/pathways.ts`. Usually unnecessary. |
| `expectedDetections[].rationale` | optional | Free-text for the human reviewer. Does not affect scoring. |

## `FixtureScore` JSON output shape

```jsonc
{
  "fixture": "B1_HR_Investigation_Report_Kellogg_Ferguson",
  "overall": {
    "precision": 0.85,
    "recall": 0.71,
    "f1": 0.772,
    "tp": 17,
    "fp": 3,
    "fn": 7
  },
  "byPathway": {
    "personal":    { "precision": 0.91, "recall": 0.83, "f1": 0.867, "tp": 10, "fp": 1, "fn": 2 },
    "commercial":  { "precision": 1.00, "recall": 1.00, "f1": 1.000, "tp": 0,  "fp": 0, "fn": 0 },
    "governance":  { "precision": 0.71, "recall": 0.57, "f1": 0.635, "tp": 5,  "fp": 2, "fn": 4 },
    "enforcement": { "precision": 1.00, "recall": 1.00, "f1": 1.000, "tp": 2,  "fp": 0, "fn": 1 }
  },
  "missing": [
    { "text": "Sarah Mitchell",    "type": "harassment-risk", "mustMatch": "exact", "page": 2 }
  ],
  "unexpected": [
    { "text": "Mr Kellogg",        "type": "personal-name",   "page": 4, "confidence": 0.85 }
  ]
}
```

Pathways are always reported for all four coverage classes even if a fixture has zero expected detections in a given pathway — empty pathways report `precision=1, recall=1, f1=1, tp=0, fp=0, fn=0` (vacuously perfect). Overall metrics are computed from the raw totals, not averaged over pathways.

## How to create a baseline

1. Author a `.expected.json` file following the shape above.
2. Run the benchmark to produce an initial report, pointing `--actual` at a trusted detection-output JSON (in tranche 2 this is produced by the live-pipeline runner; in tranche 1 this is any saved detection JSON — e.g. the committed spike-model-comparison JSONs).
3. Inspect the report's precision, recall, and missing/unexpected lists. If the numbers are right for your fixture's current state, copy the `<fixture>.report.json`'s `score` field into `<fixture>.baseline.json` and commit it.

```bash
npm run bench:detection -- \
  --expected docs/bench-baselines/B1.expected.json \
  --actual docs/spike-model-comparison-2026-04-20/gpt-4o-baseline-run1.json \
  --output docs/bench-baselines/
# review docs/bench-baselines/B1.report.md
# if numbers look right:
jq '.score' docs/bench-baselines/B1.report.json > docs/bench-baselines/B1.baseline.json
```

## How to update a baseline

When a prompt or pattern change intentionally moves the numbers (e.g. Phase 3 prompt rework lifts governance-pathway recall by +15pp), update the baseline:

1. Run the bench against the new build.
2. Confirm the delta direction matches intent (lift on target pathways, no regression elsewhere).
3. Commit the new `.baseline.json` in the same PR as the code change that caused the lift, so reviewers can see the intended regression-floor shift alongside the change itself.

Do NOT update a baseline silently after observing a regression — the whole point of committing baselines is to surface regressions. If a regression is genuinely a new intended floor (a deliberate trade-off), document it in the PR body.

## Running the live suite (tranche 2b)

`npm run bench:suite` invokes the real `processDocument` against each named fixture N times, unions detections across the N runs to absorb AI non-determinism, scores against the committed `.expected.json`, and writes a set of artefacts under `--output-dir`.

```bash
# Default: all four current fixtures × 3 runs, output folder named for today's date.
npm run bench:suite

# Explicit:
npm run bench:suite -- \
  --fixtures B1,B2,A,C1 \
  --runs 3 \
  --output-dir docs/bench-baselines/baseline-2026-04-20

# One-fixture smoke (shake out wiring before a full suite run):
npm run bench:suite -- --fixtures B2 --runs 3 \
  --output-dir docs/bench-baselines/smoke-$(date +%F)

# Validate arguments without calling Azure:
npm run bench:suite -- --dry-run
```

Per fixture, the runner writes:

| Artefact | Purpose |
|---|---|
| `<name>.baseline.json` | Committable `FixtureScore` from the unioned detections — the regression floor consumed by tranche 3's CI gate. |
| `<name>.report.md` | Human-readable overall + per-pathway metrics + missing / unexpected lists. |
| `<name>.report.json` | Machine-readable twin of the report. |
| `<name>.union.detections.json` | The unioned detection set actually scored. |
| `<name>.run1.detections.json` … `<name>.runN.detections.json` | Per-run raw detections, wall time, canonical-PDF source, error (if any). |

Plus a top-level `suite-summary.md` with a per-fixture table, per-pathway aggregates across all fixtures, and suite totals (overall P/R/F1, total wall time, commit SHA, start timestamp).

### Requirements for a live run

- Local Postgres (`docker compose up -d`) and migrations applied (`npx prisma migrate dev`).
- `DATABASE_URL` pointing at the dev DB (defaults to `postgresql://veil:veil_dev@localhost:5434/veil` in the invoker).
- `AZURE_OPENAI_*` and `AZURE_DI_*` env vars set — the run makes real Azure calls.
- LibreOffice on PATH (headless DOCX → PDF), and the Python3 / PyMuPDF toolchain for redaction are NOT required at bench time because redaction is a downstream pipeline concern; the bench exercises detection only.

Each invocation seeds a dedicated `Case` (reference `BENCH-<runLabel>`) so the bench never pollutes prod seed data. Cleanup runs in a finally block: `Detection`, `DocumentPage`, `Document`, `Case`, and both storage blobs (original + canonical) are removed after scoring. Per-step errors are swallowed so a partial failure never orphans rows.

### Expected cost / timing

At the time of first run (2026-04-20) each fixture-run costs approximately:
- ~1 page (A, C1, B2) × 3 runs × 1 batch → ~$0.02–0.04 per fixture.
- B1 is the HR pack (~5 pages canonical) × 3 runs × 2 batches → ~$0.15–0.25.
- Full suite (all 4 × 3 runs) → roughly $0.30–0.60 and 6–12 minutes wall time, dominated by Azure latency.

The runner prints per-run detection counts and wall times as it goes, so you can tell whether a fixture is stuck on a slow call vs making steady progress.

## CI operation (tranche 3)

`.github/workflows/bench-detection.yml` runs the 5-fixture bench suite against live Azure OpenAI + Document Intelligence on every PR that touches:

- `lib/pipeline/**`
- `test-fixtures/bench/**`
- `docs/bench-baselines/**`
- `scripts/bench/**`
- `lib/bench/**`
- `.github/workflows/bench-detection.yml`

It can also be triggered manually via the Actions tab (workflow_dispatch).

### What it does

1. Spins up a Postgres 16 service container, installs LibreOffice + Noto fonts, runs Prisma migrations against the ephemeral DB.
2. Reads `docs/bench-baselines/CANONICAL` to resolve the canonical baseline directory.
3. Runs `npm run bench:suite -- --fixtures B1,B2,A,C1,B3 --runs 3 --output-dir docs/bench-baselines/ci-run-<run-id>`.
4. Calls `npm run bench:compare` to diff the fresh run against the canonical baseline.
5. Upserts a PR comment (marker `<!-- bench-detection-comment -->`) with a per-fixture and per-pathway delta table.
6. Uploads the full CI run folder as an artefact (`bench-run-<run-id>`, 14-day retention).
7. Fails CI if the comparator flagged a regression.

### Thresholds

| scope | default | behaviour |
|---|---|---|
| per-fixture F1 regression | 0.120 (12pp) | fails CI |
| suite aggregate F1 regression | 0.050 (5pp) | fails CI |
| per-pathway F1 | — | reported only, not a gate |

Thresholds are flag-configurable on `compare-baseline.ts` (`--threshold-fixture`, `--threshold-suite`). If you want to tighten or loosen, edit the workflow's `Compare against canonical baseline` step.

Rationale for 12pp per-fixture: observed AI non-determinism on **identical pipeline code** across day-over-day re-runs has reached 9.7pp (B2 on 2026-04-21, 0.722 → 0.625) and 8.2pp (C1 on 2026-04-20, 0.000 → 0.082 via AI-variance wobble) on single-fixture F1. An initial 8pp threshold left only ~0.3pp headroom and fired a false-positive on the first CI run. 12pp gives ~2pp absorption margin over the observed maximum without meaningfully loosening the gate for real regressions — a 12pp F1 drop on a 20-entry fixture means losing ≥3 TPs, which is a large real signal rather than noise.

Suite aggregate stays tight at 5pp because per-fixture noise averages out across the 5 fixtures — same code tends to produce similar total-TP / total-FP / total-FN across runs even when individual fixtures swing.

### Interpreting the PR comment

- :white_check_mark: / :x: at the top tells you whether CI passed the gate.
- The "Per fixture" table marks regressing fixtures with :x: (beyond threshold) or :warning: (negative but within threshold).
- The "Suite aggregate" row is the total-TP / total-FP / total-FN recomputed across all fixtures; it's the headline number CI gates on alongside per-fixture.
- The "Per pathway" block is report-only — use it to spot pathway-specific drift (e.g. governance crashing while personal stays flat).
- If regressions are listed, the footer explains how to fix OR re-baseline.

### Updating the canonical baseline

When a prompt / pattern / pipeline change intentionally moves the numbers (e.g. Phase 3's prompt rework lifting governance-pathway F1), re-baselining is a deliberate two-step act:

1. Run the bench suite locally to capture the new numbers:
   ```bash
   npm run bench:suite -- --output-dir docs/bench-baselines/baseline-<YYYY-MM-DD>-<short-description>
   ```
2. Edit `docs/bench-baselines/CANONICAL` to contain the new directory name (the file is one line of text, no trailing commentary).
3. Commit both the new baseline folder and the `CANONICAL` update in the same PR as the code change that produced the lift. Reviewers see the intended floor-shift alongside the change itself.

Do NOT update `CANONICAL` silently in an unrelated PR to mask a regression. The whole point of committing baselines is to surface them.

### Required GitHub repo secrets

Add these via Settings -> Secrets and variables -> Actions -> New repository secret:

| secret name | used for |
|---|---|
| `AZURE_OPENAI_ENDPOINT` | OpenAI API root URL |
| `AZURE_OPENAI_KEY` | OpenAI API key |
| `AZURE_OPENAI_DEPLOYMENT` | Shared deployment name (detection + classification fall back to this if the more specific secrets are absent) |
| `AZURE_OPENAI_DEPLOYMENT_DETECTION` | Optional — deployment used by `detectWithAI` only |
| `AZURE_OPENAI_DEPLOYMENT_CLASSIFICATION` | Optional — deployment used by `classifyDocument` only |
| `AZURE_DI_ENDPOINT` | Document Intelligence root URL |
| `AZURE_DI_KEY` | Document Intelligence key |

The workflow's first step fails fast with a clear message if any of the five required secrets is unset.

### Cost / timing

- Wall time per run: ~7–8 min (bench itself ~5–6 min, plus ~1–2 min for apt install + migrations + npm ci).
- Cost per run: ~$0.50 NZD (Azure OpenAI + DI, dominated by B3's 10-page × 3-run × 4-batch load).
- At ~20 pipeline-touching PRs/month, budget ~$10 NZD/month.

### Artefacts

Every run uploads its `ci-run-<run-id>` folder as a 14-day artefact. When diagnosing a regression post-hoc, download the artefact and open `suite-summary.md` for the quick read, or any of the per-fixture `report.md` files for missing/unexpected detail.

## Not in tranche 3

- No per-pathway gate. Only per-fixture and suite F1 are CI-gated.
- No slack / email notification. Regressions surface via the PR comment + check status.
- No incremental bench (running only fixtures affected by a diff). The suite runs all 5 every time.
