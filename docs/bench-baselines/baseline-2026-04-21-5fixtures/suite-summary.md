# Bench suite summary

- **Started:** 2026-04-21T09:25:29.858Z
- **Commit:** `50cd6c6b1a4253c5242f6bc8fbd966340dec25fb`
- **Runs per fixture:** 3
- **Fixtures:** B1, B2, A, C1, B3

## Per-fixture overall

| fixture | precision | recall | F1 | TP/FP/FN | union count | run counts | wall (s) | status |
|---|---|---|---|---|---|---|---|---|
| B1 | 25.0% | 25.7% | 0.254 | 9/27/26 | 36 | 35/26/25 | 27.8/17.0/23.8 | ready |
| B2 | 81.3% | 65.0% | 0.722 | 13/3/7 | 16 | 15/15/17 | 14.2/14.7/15.5 | ready |
| A | 57.1% | 42.1% | 0.485 | 8/6/11 | 14 | 6/8/8 | 16.4/18.5/17.6 | ready |
| C1 | 62.5% | 26.3% | 0.370 | 5/3/14 | 8 | 8/8/8 | 16.3/17.6/18.9 | ready |
| B3 | 52.8% | 66.7% | 0.589 | 28/25/14 | 53 | 51/59/51 | 37.5/38.0/35.8 | ready |

## Per-pathway aggregates (all fixtures unioned)

| pathway | precision | recall | F1 | TP/FP/FN |
|---|---|---|---|---|
| personal | 57.9% | 65.7% | 0.615 | 44/32/23 |
| commercial | 63.6% | 36.8% | 0.467 | 7/4/12 |
| governance | 34.4% | 23.9% | 0.282 | 11/21/35 |
| enforcement | 12.5% | 33.3% | 0.182 | 1/7/2 |

## Suite totals

- **Overall:** P=49.6% R=46.7% F1=0.481 (TP=63 FP=64 FN=72)
- **Total wall time:** 329.6s

## Artefacts

Written to `docs/bench-baselines/baseline-2026-04-21-5fixtures`:
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
- `B3.baseline.json` — committable baseline.
- `B3.report.md` / `B3.report.json` — per-fixture report.
- `B3.union.detections.json` — unioned detections used for scoring.
- `B3.run1..run3.detections.json` — per-run raw detections.
