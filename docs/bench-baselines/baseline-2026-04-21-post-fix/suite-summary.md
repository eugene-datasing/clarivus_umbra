# Bench suite summary

- **Started:** 2026-04-20T09:28:34.189Z
- **Commit:** `e51dc686927b3409f1d91c8dc7ff0588f9c4e39a`
- **Runs per fixture:** 3
- **Fixtures:** B1, B2, A, C1

## Per-fixture overall

| fixture | precision | recall | F1 | TP/FP/FN | union count | run counts | wall (s) | status |
|---|---|---|---|---|---|---|---|---|
| B1 | 35.7% | 28.6% | 0.317 | 10/18/25 | 28 | 26/24/25 | 19.9/20.4/16.1 | ready |
| B2 | 70.6% | 60.0% | 0.649 | 12/5/8 | 17 | 16/16/15 | 14.1/13.4/14.1 | ready |
| A | 53.3% | 42.1% | 0.471 | 8/7/11 | 15 | 8/10/8 | 17.5/19.9/16.6 | ready |
| C1 | 58.3% | 36.8% | 0.452 | 7/5/12 | 12 | 9/9/9 | 18.0/20.4/18.1 | ready |

## Per-pathway aggregates (all fixtures unioned)

| pathway | precision | recall | F1 | TP/FP/FN |
|---|---|---|---|---|
| personal | 50.0% | 55.9% | 0.528 | 19/19/15 |
| commercial | 77.8% | 41.2% | 0.538 | 7/2/10 |
| governance | 45.5% | 24.4% | 0.317 | 10/12/31 |
| enforcement | 33.3% | 100.0% | 0.500 | 1/2/0 |

## Suite totals

- **Overall:** P=51.4% R=39.8% F1=0.448 (TP=37 FP=35 FN=56)
- **Total wall time:** 208.5s

## Artefacts

Written to `docs/bench-baselines/baseline-2026-04-21-post-fix`:
- `B1.baseline.json` — committable baseline.
- `B1.report.md` / `B1.report.json` — per-fixture report.
- `B1.union.detections.json` — unioned detections used for scoring.
- `B1.run1..run3.detections.json` — per-run raw detections.
- `B2.baseline.json` — committable baseline.
- `B2.report.md` / `B2.report.json` — per-fixture report.
- `B2.union.detections.json` — unioned detections used for scoring.
- `B2.run1..run3.detections.json` — per-run raw detections.
- `A.baseline.json` — committable baseline.
- `A.report.md` / `A.report.json` — per-fixture report.
- `A.union.detections.json` — unioned detections used for scoring.
- `A.run1..run3.detections.json` — per-run raw detections.
- `C1.baseline.json` — committable baseline.
- `C1.report.md` / `C1.report.json` — per-fixture report.
- `C1.union.detections.json` — unioned detections used for scoring.
- `C1.run1..run3.detections.json` — per-run raw detections.
