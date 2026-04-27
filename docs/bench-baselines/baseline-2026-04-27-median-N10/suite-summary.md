# Canonical bench summary — median of N=10

- **Captured:** 2026-04-27T11:01:13.332Z
- **Runs per sample (unioned):** 3
- **Total pipeline invocations:** 150

## Per-fixture (median)

| fixture | precision | recall | F1 | TP/FP/FN |
|---|---|---|---|---|
| B1 | 51.9% | 65.9% | 0.581 | 27/25/14 |
| B2 | 51.1% | 60.0% | 0.561 | 12/11.5/8 |
| A | 39.0% | 42.1% | 0.405 | 8/12.5/11 |
| C1 | 54.5% | 34.2% | 0.419 | 6.5/5/12.5 |
| B3 | 56.7% | 97.2% | 0.716 | 70/53/2 |

## Per-pathway (median across fixtures + samples)

| pathway | precision | recall | F1 | TP/FP/FN |
|---|---|---|---|---|
| personal | 70.2% | 91.2% | 0.793 | 93/39.5/9 |
| commercial | 58.6% | 44.7% | 0.507 | 8.5/6/10.5 |
| governance | 28.0% | 44.7% | 0.344 | 21/54/26 |
| enforcement | 25.0% | 66.7% | 0.364 | 2/6/1 |

## Suite aggregate (from per-fixture medians)

- **Overall:** P=53.6% R=72.2% F1=0.615 (TP=123.5 FP=107 FN=47.5)

See `variance-stats.md` for distribution details.