# Canonical-capture variance stats

- **Samples:** 10
- **Runs per sample (unioned):** 3
- **Fixtures:** B1, B2, A, C1, B3

## Per-fixture F1 distribution

| fixture | min | median | max | range | stddev | samples (F1 sorted) |
|---|---|---|---|---|---|---|
| B1 | 0.436 | **0.485** | 0.524 | 0.088 | 0.031 | 0.436, 0.444, 0.447, 0.472, 0.482, 0.488, 0.500, 0.506, 0.513, 0.524 |
| B2 | 0.408 | **0.513** | 0.556 | 0.147 | 0.046 | 0.408, 0.436, 0.512, 0.512, 0.513, 0.513, 0.526, 0.537, 0.537, 0.556 |
| A | 0.389 | **0.431** | 0.486 | 0.098 | 0.029 | 0.389, 0.424, 0.424, 0.424, 0.424, 0.438, 0.444, 0.471, 0.471, 0.486 |
| C1 | 0.357 | **0.407** | 0.467 | 0.110 | 0.037 | 0.357, 0.357, 0.370, 0.400, 0.400, 0.414, 0.424, 0.438, 0.438, 0.467 |
| B3 | 0.729 | **0.779** | 0.805 | 0.075 | 0.025 | 0.729, 0.737, 0.754, 0.757, 0.776, 0.781, 0.784, 0.786, 0.795, 0.805 |

## Per-fixture TP/FP/FN distribution (median across samples)

| fixture | TP (med) | TP range | FP (med) | FP range | FN (med) | FN range |
|---|---|---|---|---|---|---|
| B1 | 20 | 17-22 | 21.5 | 17-27 | 21 | 19-24 |
| B2 | 10.5 | 10-12 | 10 | 6-23 | 9.5 | 8-10 |
| A | 7 | 7-9 | 7 | 6-10 | 12 | 10-12 |
| C1 | 6 | 5-7 | 4.5 | 3-7 | 13 | 12-14 |
| B3 | 66 | 62-67 | 32 | 26-41 | 6 | 5-10 |

## Threshold recommendation

- Max per-fixture F1 stddev across 10 samples: **0.046** (4.6pp).
- Max per-fixture F1 range across 10 samples: **0.147** (14.7pp).
- With the canonical anchored at the median rather than a single-run top-of-range, expect one-sided (canonical → fresh CI run) deviation of roughly ±7.4pp.
- Proposed per-fixture CI threshold: **0.12 (12pp)**. See PR discussion for the final call.