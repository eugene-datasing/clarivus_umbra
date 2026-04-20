# Bench suite summary

- **Started:** 2026-04-20T08:57:32.532Z
- **Commit:** `83db547cd325ee433c605a24c23a5b73c7770532`
- **Runs per fixture:** 3
- **Fixtures:** B1, B2, A, C1

## Per-fixture overall

| fixture | precision | recall | F1 | TP/FP/FN | union count | run counts | wall (s) | status |
|---|---|---|---|---|---|---|---|---|
| B1 | 30.4% | 20.0% | 0.241 | 7/16/28 | 23 | 23/22/23 | 22.2/17.8/19.3 | ready |
| B2 | 71.4% | 50.0% | 0.588 | 10/4/10 | 14 | 13/17/14 | 12.4/13.5/12.7 | ready |
| A | 50.0% | 5.3% | 0.095 | 1/1/18 | 2 | 2/2/2 | 14.3/17.3/14.0 | ready |
| C1 | 100.0% | 0.0% | 0.000 | 0/0/19 | 0 | 0/0/0 | 17.9/17.9/14.9 | ready |

## Per-pathway aggregates (all fixtures unioned)

| pathway | precision | recall | F1 | TP/FP/FN |
|---|---|---|---|---|
| personal | 47.1% | 47.1% | 0.471 | 16/18/18 |
| commercial | 100.0% | 0.0% | 0.000 | 0/0/17 |
| governance | 25.0% | 2.4% | 0.044 | 1/3/40 |
| enforcement | 100.0% | 100.0% | 1.000 | 1/0/0 |

## Suite totals

- **Overall:** P=46.2% R=19.4% F1=0.273 (TP=18 FP=21 FN=75)
- **Total wall time:** 194.3s

## Artefacts

Written to `docs/bench-baselines/baseline-2026-04-20`:
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
