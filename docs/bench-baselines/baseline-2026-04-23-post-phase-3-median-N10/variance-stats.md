# Canonical-capture variance stats

- **Samples:** 10
- **Runs per sample (unioned):** 3
- **Fixtures:** B1, B2, A, C1, B3

## Per-fixture F1 distribution

| fixture | min | median | max | range | stddev | samples (F1 sorted) |
|---|---|---|---|---|---|---|
| B1 | 0.333 | **0.391** | 0.429 | 0.095 | 0.029 | 0.333, 0.369, 0.369, 0.377, 0.382, 0.400, 0.406, 0.418, 0.418, 0.429 |
| B2 | 0.541 | **0.571** | 0.611 | 0.071 | 0.020 | 0.541, 0.556, 0.571, 0.571, 0.571, 0.571, 0.579, 0.588, 0.595, 0.611 |
| A | 0.424 | **0.467** | 0.500 | 0.076 | 0.019 | 0.424, 0.452, 0.452, 0.467, 0.467, 0.467, 0.467, 0.471, 0.474, 0.500 |
| C1 | 0.345 | **0.433** | 0.588 | 0.243 | 0.091 | 0.345, 0.357, 0.400, 0.400, 0.414, 0.452, 0.452, 0.556, 0.588, 0.588 |
| B3 | 0.596 | **0.636** | 0.667 | 0.070 | 0.022 | 0.596, 0.602, 0.611, 0.635, 0.636, 0.637, 0.641, 0.648, 0.648, 0.667 |

## Per-fixture TP/FP/FN distribution (median across samples)

| fixture | TP (med) | TP range | FP (med) | FP range | FN (med) | FN range |
|---|---|---|---|---|---|---|
| B1 | 13 | 11-15 | 19 | 17-21 | 22 | 20-24 |
| B2 | 10 | 10-11 | 5 | 4-7 | 10 | 9-10 |
| A | 7 | 7-9 | 5 | 4-10 | 12 | 10-12 |
| C1 | 6.5 | 5-10 | 5 | 4-7 | 12.5 | 9-14 |
| B3 | 34 | 33-36 | 31 | 28-38 | 8 | 6-9 |

## Threshold recommendation

- Max per-fixture F1 stddev across 10 samples: **0.091** (9.1pp).
- Max per-fixture F1 range across 10 samples: **0.243** (24.3pp).
- With the canonical anchored at the median rather than a single-run top-of-range, expect one-sided (canonical → fresh CI run) deviation of roughly ±12.2pp.
- Proposed per-fixture CI threshold: **keep 0.16 (16pp) pending a further data point**. See PR discussion for the final call.