# Canonical-capture variance stats

- **Samples:** 10
- **Runs per sample (unioned):** 3
- **Fixtures:** B1, B2, A, C1, B3

## Per-fixture F1 distribution

| fixture | min | median | max | range | stddev | samples (F1 sorted) |
|---|---|---|---|---|---|---|
| B1 | 0.458 | **0.515** | 0.595 | 0.137 | 0.037 | 0.458, 0.482, 0.506, 0.512, 0.512, 0.518, 0.524, 0.530, 0.550, 0.595 |
| B2 | 0.444 | **0.555** | 0.600 | 0.156 | 0.053 | 0.444, 0.453, 0.512, 0.533, 0.545, 0.564, 0.564, 0.571, 0.585, 0.600 |
| A | 0.424 | **0.457** | 0.486 | 0.062 | 0.019 | 0.424, 0.438, 0.438, 0.452, 0.457, 0.457, 0.462, 0.471, 0.471, 0.486 |
| C1 | 0.424 | **0.459** | 0.571 | 0.147 | 0.058 | 0.424, 0.438, 0.452, 0.452, 0.452, 0.467, 0.533, 0.545, 0.571, 0.571 |
| B3 | 0.704 | **0.793** | 0.819 | 0.115 | 0.033 | 0.704, 0.754, 0.780, 0.787, 0.793, 0.793, 0.795, 0.800, 0.812, 0.819 |

## Per-fixture TP/FP/FN distribution (median across samples)

| fixture | TP (med) | TP range | FP (med) | FP range | FN (med) | FN range |
|---|---|---|---|---|---|---|
| B1 | 21.5 | 19-25 | 20 | 17-23 | 19.5 | 16-22 |
| B2 | 12 | 11-12 | 11 | 8-22 | 8 | 8-9 |
| A | 8 | 7-9 | 7 | 5-11 | 11 | 10-12 |
| C1 | 7 | 7-10 | 5 | 3-7 | 12 | 9-12 |
| B3 | 69 | 69-70 | 33.5 | 29-55 | 3 | 2-3 |

## Threshold recommendation

- Max per-fixture F1 stddev across 10 samples: **0.058** (5.8pp).
- Max per-fixture F1 range across 10 samples: **0.156** (15.6pp).
- With the canonical anchored at the median rather than a single-run top-of-range, expect one-sided (canonical → fresh CI run) deviation of roughly ±7.8pp.
- Proposed per-fixture CI threshold: **0.12 (12pp)**. See PR discussion for the final call.