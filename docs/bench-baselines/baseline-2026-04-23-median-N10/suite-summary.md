# Canonical bench summary — median of N=10

- **Captured:** 2026-04-22T21:39:45.761Z
- **Runs per sample (unioned):** 3
- **Total pipeline invocations:** 150

## Per-fixture (median)

| fixture | precision | recall | F1 | TP/FP/FN |
|---|---|---|---|---|
| B1 | 37.7% | 28.6% | 0.325 | 10/16.5/25 |
| B2 | 66.7% | 52.5% | 0.584 | 10.5/5/9.5 |
| A | 51.5% | 42.1% | 0.454 | 8/7.5/11 |
| C1 | 52.3% | 28.9% | 0.379 | 5.5/5/13.5 |
| B3 | 56.2% | 81.0% | 0.654 | 34/26.5/8 |

## Per-pathway (median across fixtures + samples)

| pathway | precision | recall | F1 | TP/FP/FN |
|---|---|---|---|---|
| personal | 62.9% | 67.2% | 0.650 | 45/26.5/22 |
| commercial | 52.0% | 34.2% | 0.413 | 6.5/6/12.5 |
| governance | 37.8% | 30.4% | 0.337 | 14/23/32 |
| enforcement | 33.3% | 66.7% | 0.444 | 2/4/1 |

## Suite aggregate (from per-fixture medians)

- **Overall:** P=52.9% R=50.4% F1=0.516 (TP=68 FP=60.5 FN=67)

See `variance-stats.md` for distribution details.