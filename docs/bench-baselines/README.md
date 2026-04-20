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

## CI regression guard (tranche 3)

Tranche 3 wires `npm run bench:detection -- --baseline <path>` into a GitHub Actions workflow that runs on every PR touching `lib/pipeline/**`. Default threshold is 0.05 F1 (overall) — a regression beyond that makes the bench step exit non-zero, failing CI.

The per-pathway F1 is not currently a gate but is reported for human inspection. Tranche 3 may promote per-pathway thresholds to gates for specific pathways where a silent drop is particularly bad (governance, for example).

## Not in tranche 1

- No live-Azure invocation. The runner scores pre-computed actual-detection JSON only. Tranche 2 adds a `--from-pipeline` (or equivalent) wrapper that runs `processDocument` against a bench fixture.
- No CI workflow. Tranche 3 adds `.github/workflows/bench-detection.yml`.
- No Azure credentials secrets, no per-fixture quick-mode, no multi-run averaging. Those arrive with tranches 2 and 3.
