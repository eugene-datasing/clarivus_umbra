# Canonical bench summary — median of N=10

- **Captured:** 2026-04-23T07:37:18.758Z
- **Runs per sample (unioned):** 3
- **Total pipeline invocations:** 150

## Per-fixture (median)

| fixture | precision | recall | F1 | TP/FP/FN |
|---|---|---|---|---|
| B1 | 48.2% | 48.8% | 0.485 | 20/21.5/21 |
| B2 | 52.4% | 52.5% | 0.513 | 10.5/10/9.5 |
| A | 50.0% | 36.8% | 0.431 | 7/7/12 |
| C1 | 55.1% | 31.6% | 0.407 | 6/4.5/13 |
| B3 | 67.5% | 91.7% | 0.779 | 66/32/6 |

## Per-pathway (median across fixtures + samples)

| pathway | precision | recall | F1 | TP/FP/FN |
|---|---|---|---|---|
| personal | 68.8% | 84.3% | 0.758 | 86/39/16 |
| commercial | 58.3% | 36.8% | 0.452 | 7/5/12 |
| governance | 37.2% | 30.9% | 0.337 | 14.5/24.5/32.5 |
| enforcement | 22.2% | 66.7% | 0.333 | 2/7/1 |

## Suite aggregate (from per-fixture medians)

- **Overall:** P=59.3% R=64.0% F1=0.616 (TP=109.5 FP=75 FN=61.5)

See `variance-stats.md` for distribution details.