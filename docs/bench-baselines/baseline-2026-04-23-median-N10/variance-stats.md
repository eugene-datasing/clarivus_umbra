# Canonical-capture variance stats

- **Samples:** 10
- **Runs per sample (unioned):** 3
- **Fixtures:** B1, B2, A, C1, B3

## Per-fixture F1 distribution

| fixture | min | median | max | range | stddev | samples (F1 sorted) |
|---|---|---|---|---|---|---|
| B1 | 0.313 | **0.325** | 0.355 | 0.042 | 0.012 | 0.313, 0.317, 0.317, 0.317, 0.323, 0.328, 0.328, 0.333, 0.333, 0.355 |
| B2 | 0.514 | **0.584** | 0.722 | 0.208 | 0.061 | 0.514, 0.529, 0.571, 0.571, 0.579, 0.588, 0.632, 0.632, 0.647, 0.722 |
| A | 0.400 | **0.454** | 0.514 | 0.114 | 0.043 | 0.400, 0.412, 0.424, 0.432, 0.438, 0.471, 0.486, 0.500, 0.514, 0.514 |
| C1 | 0.345 | **0.379** | 0.500 | 0.155 | 0.055 | 0.345, 0.345, 0.345, 0.345, 0.357, 0.400, 0.414, 0.424, 0.452, 0.500 |
| B3 | 0.611 | **0.654** | 0.713 | 0.102 | 0.029 | 0.611, 0.642, 0.648, 0.648, 0.649, 0.660, 0.667, 0.673, 0.699, 0.713 |

## Per-fixture TP/FP/FN distribution (median across samples)

| fixture | TP (med) | TP range | FP (med) | FP range | FN (med) | FN range |
|---|---|---|---|---|---|---|
| B1 | 10 | 10-11 | 16.5 | 15-19 | 25 | 24-25 |
| B2 | 10.5 | 9-13 | 5 | 3-7 | 9.5 | 7-11 |
| A | 8 | 7-9 | 7.5 | 6-10 | 11 | 10-12 |
| C1 | 5.5 | 5-8 | 5 | 4-7 | 13.5 | 11-14 |
| B3 | 34 | 26-36 | 26.5 | 13-33 | 8 | 6-16 |

## Threshold recommendation

- Max per-fixture F1 stddev across 10 samples: **0.061** (6.1pp).
- Max per-fixture F1 range across 10 samples: **0.208** (20.8pp).
- With the canonical anchored at the median rather than a single-run top-of-range, expect one-sided (canonical → fresh CI run) deviation of roughly ±10.4pp.
- Proposed per-fixture CI threshold: **keep 0.16 (16pp) pending a further data point**. See PR discussion for the final call.