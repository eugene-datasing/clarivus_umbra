# Canonical-capture variance stats

- **Samples:** 10
- **Runs per sample (unioned):** 3
- **Fixtures:** B1, B2, A, C1, B3

## Per-fixture F1 distribution

| fixture | min | median | max | range | stddev | samples (F1 sorted) |
|---|---|---|---|---|---|---|
| B1 | 0.538 | **0.581** | 0.602 | 0.065 | 0.019 | 0.538, 0.549, 0.565, 0.581, 0.581, 0.581, 0.581, 0.587, 0.587, 0.602 |
| B2 | 0.436 | **0.561** | 0.611 | 0.175 | 0.048 | 0.436, 0.545, 0.545, 0.545, 0.558, 0.564, 0.571, 0.588, 0.600, 0.611 |
| A | 0.364 | **0.405** | 0.432 | 0.069 | 0.020 | 0.364, 0.400, 0.400, 0.400, 0.400, 0.410, 0.421, 0.421, 0.432, 0.432 |
| C1 | 0.387 | **0.419** | 0.588 | 0.201 | 0.057 | 0.387, 0.400, 0.400, 0.414, 0.414, 0.424, 0.438, 0.438, 0.452, 0.588 |
| B3 | 0.707 | **0.716** | 0.732 | 0.025 | 0.009 | 0.707, 0.707, 0.711, 0.714, 0.714, 0.718, 0.725, 0.728, 0.729, 0.732 |

## Per-fixture TP/FP/FN distribution (median across samples)

| fixture | TP (med) | TP range | FP (med) | FP range | FN (med) | FN range |
|---|---|---|---|---|---|---|
| B1 | 27 | 25-28 | 25 | 24-27 | 14 | 13-16 |
| B2 | 12 | 11-15 | 11.5 | 5-23 | 8 | 5-9 |
| A | 8 | 8-9 | 12.5 | 10-17 | 11 | 10-11 |
| C1 | 6.5 | 6-10 | 5 | 4-7 | 12.5 | 9-13 |
| B3 | 70 | 69-71 | 53 | 50-56 | 2 | 1-3 |

## Threshold recommendation

- Max per-fixture F1 stddev across 10 samples: **0.057** (5.7pp).
- Max per-fixture F1 range across 10 samples: **0.201** (20.1pp).
- With the canonical anchored at the median rather than a single-run top-of-range, expect one-sided (canonical → fresh CI run) deviation of roughly ±10.1pp.
- Proposed per-fixture CI threshold: **keep 0.16 (16pp) pending a further data point**. See PR discussion for the final call.