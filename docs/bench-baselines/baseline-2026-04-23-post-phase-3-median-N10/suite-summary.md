# Canonical bench summary — median of N=10

- **Captured:** 2026-04-23T01:03:58.744Z
- **Runs per sample (unioned):** 3
- **Total pipeline invocations:** 150

## Per-fixture (median)

| fixture | precision | recall | F1 | TP/FP/FN |
|---|---|---|---|---|
| B1 | 40.6% | 37.1% | 0.391 | 13/19/22 |
| B2 | 66.7% | 50.0% | 0.571 | 10/5/10 |
| A | 59.9% | 36.8% | 0.467 | 7/5/12 |
| C1 | 58.3% | 34.2% | 0.433 | 6.5/5/12.5 |
| B3 | 52.7% | 81.0% | 0.636 | 34/31/8 |

## Per-pathway (median across fixtures + samples)

| pathway | precision | recall | F1 | TP/FP/FN |
|---|---|---|---|---|
| personal | 63.3% | 70.5% | 0.667 | 46.5/27/19.5 |
| commercial | 55.2% | 42.1% | 0.478 | 8/6.5/11 |
| governance | 37.5% | 31.9% | 0.345 | 15/25/32 |
| enforcement | 22.2% | 66.7% | 0.333 | 2/7/1 |

## Suite aggregate (from per-fixture medians)

- **Overall:** P=52.0% R=52.2% F1=0.521 (TP=70.5 FP=65 FN=64.5)

See `variance-stats.md` for distribution details.