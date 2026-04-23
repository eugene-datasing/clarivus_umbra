# Canonical bench summary — median of N=10

- **Captured:** 2026-04-23T11:16:13.919Z
- **Runs per sample (unioned):** 3
- **Total pipeline invocations:** 150

## Per-fixture (median)

| fixture | precision | recall | F1 | TP/FP/FN |
|---|---|---|---|---|
| B1 | 51.2% | 52.4% | 0.515 | 21.5/20/19.5 |
| B2 | 52.3% | 60.0% | 0.555 | 12/11/8 |
| A | 51.7% | 42.1% | 0.457 | 8/7/11 |
| C1 | 60.4% | 36.8% | 0.459 | 7/5/12 |
| B3 | 67.5% | 95.8% | 0.793 | 69/33.5/3 |

## Per-pathway (median across fixtures + samples)

| pathway | precision | recall | F1 | TP/FP/FN |
|---|---|---|---|---|
| personal | 69.5% | 89.2% | 0.781 | 91/40/11 |
| commercial | 56.3% | 47.4% | 0.514 | 9/7/10 |
| governance | 40.0% | 34.0% | 0.368 | 16/24/31 |
| enforcement | 28.6% | 66.7% | 0.400 | 2/5/1 |

## Suite aggregate (from per-fixture medians)

- **Overall:** P=60.6% R=68.7% F1=0.644 (TP=117.5 FP=76.5 FN=53.5)

See `variance-stats.md` for distribution details.