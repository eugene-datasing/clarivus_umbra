# Model-choice spike — B1 comparison

**Date:** 2026-04-20
**Fixture:** `test-fixtures/dummy-lgoima-pack/B1_HR_Investigation_Report_Kellogg_Ferguson.docx`
**Runs per condition:** 3

## Per-run summary

| Condition | Run | Deployment | Wall (s) | Batches | Detections | Errors |
|---|---|---|---|---|---|---|
| gpt-4o-baseline | 1 | `gpt-4o` | 14.6 | 1 | 22 | 0 |
| gpt-4o-baseline | 2 | `gpt-4o` | 10.8 | 1 | 15 | 0 |
| gpt-4o-baseline | 3 | `gpt-4o` | 8.5 | 1 | 16 | 0 |
| o4-mini | 1 | `o4-mini-detection-spike` | 70.1 | 1 | 20 | 0 |
| o4-mini | 2 | `o4-mini-detection-spike` | 52.1 | 1 | 18 | 0 |
| o4-mini | 3 | `o4-mini-detection-spike` | 61.6 | 1 | 21 | 0 |

## Detection counts by type

| Condition / Run | address | bank-account | email-addr | free-frank | health-safety | ird | legal-privilege | nz-passport | personal-name | phone |
|---|---|---|---|---|---|---|---|---|---|---|
| gpt-4o-baseline #1 | 2 | 1 | 4 | 1 | 1 | 2 | 1 | 1 | 4 | 5 |
| gpt-4o-baseline #2 | 2 | 1 | 1 | 1 | 0 | 2 | 1 | 1 | 4 | 2 |
| gpt-4o-baseline #3 | 2 | 1 | 1 | 1 | 0 | 2 | 1 | 1 | 5 | 2 |
| o4-mini #1 | 2 | 1 | 2 | 1 | 0 | 2 | 1 | 1 | 5 | 5 |
| o4-mini #2 | 2 | 1 | 2 | 0 | 0 | 2 | 1 | 1 | 4 | 5 |
| o4-mini #3 | 2 | 1 | 2 | 1 | 0 | 2 | 1 | 1 | 6 | 5 |

## Detection counts by page

| Condition / Run | Page 1 | Page 2 | Page 3 | Page 4 |
|---|---|---|---|---|
| gpt-4o-baseline #1 | 22 | 0 | 0 | 0 |
| gpt-4o-baseline #2 | 15 | 0 | 0 | 0 |
| gpt-4o-baseline #3 | 16 | 0 | 0 | 0 |
| o4-mini #1 | 20 | 0 | 0 | 0 |
| o4-mini #2 | 18 | 0 | 0 | 0 |
| o4-mini #3 | 21 | 0 | 0 | 0 |

## Target-detection checklist

For each condition, open the raw JSON and tick off whether the following B1 targets were caught (by any run). High-signal targets are listed first.

### Governance pathway (highest signal)
- [ ] Free-and-frank section sentences (page 3) — any of: 'exhausting', 'abrasive', 'credibility issues', 'my honest read', 'not a clear-cut case'
- [ ] Legal-privileged settlement range `$55,000 — $110,000`
- [ ] Ben Mahuika (external counsel named)
- [ ] Sarah Mitchell (investigator — flag of the candid author)

### Entity propagation across pages
- [ ] In-prose 'Ms Ferguson' and/or 'Ferguson' on page 2 or 3 (should appear many times)
- [ ] In-prose 'Mr Kellogg' and/or 'Kellogg' on page 2 or 3
- [ ] Witness names: Angela Torres, Jonathan Briggs, Priya Sharma, Mere Rauhihi

### Labelled-field PII
- [ ] Labelled DOB `14 June 1983`
- [ ] Labelled DOB `3 November 1978`
- [ ] Passport `LA429183`
- [ ] Driver licence `EA123456`
- [ ] Employee numbers `ADC-2284`, `ADC-0917`

### Third-party PII in prose
- [ ] Dr Sarah Liang (GP name)
- [ ] Phone `(06) 759 2217` (likely regex-missed; AI catch would be a bonus)
- [ ] ICD-10 code `F43.23`
- [ ] Benestar session reference `BEN-48291`

## Errors

No errors across any run.

## Raw detection files

- `b1-extracted-pages.json` — cached DI extraction (reusable for follow-up spikes)
- `gpt-4o-baseline-run1.json` — 22 detections, 14.6s wall time
- `gpt-4o-baseline-run2.json` — 15 detections, 10.8s wall time
- `gpt-4o-baseline-run3.json` — 16 detections, 8.5s wall time
- `o4-mini-run1.json` — 20 detections, 70.1s wall time
- `o4-mini-run2.json` — 18 detections, 52.1s wall time
- `o4-mini-run3.json` — 21 detections, 61.6s wall time

## Next steps

1. Eyeball the target-detection checklist above across the 3 o4-mini runs vs the 3 gpt-4o runs. Tick boxes per condition.
2. If o4-mini catches the governance-pathway targets that gpt-4o misses, Phase 3's prompt-rework scope in `docs/detection-coverage-plan-2026-04.md` shrinks and Phase 4 entity-propagation may become unnecessary.
3. If both models miss the same targets, prompt + architecture is the dominant factor; plan stands as drafted.
4. If o4-mini is materially slower per batch (compare wall times above), factor that into the final model-choice decision — reasoning models trade latency for accuracy.