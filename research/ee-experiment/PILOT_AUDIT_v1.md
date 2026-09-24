# EE Random-State Pilot Audit v1

Status: **PASS — CLEARED FOR PRIMARY DATA GENERATION**

Pilot workflow run: `36066910432`  
Pilot study seed: `EE-2026-RANDOM-STATE-PILOT-01`  
Sampling mode: `random_state_uniform_coordinate_v1`  
Generator: `random-state-sha256-coordinate-v1`

## Gate results

- Sampled states: 20
- Solver rows: 40 / 40 expected
- Successful rows: 40
- Failed rows: 0
- Paired states: 20 / 20
- Unique sampled states: 20
- Duplicate states: 0
- Methods per state: exactly 2
- Random-state invariant tests: PASS
- Cubie-coordinate ↔ URFDLB facelet round-trip tests: PASS
- Scoped TypeScript type-check: PASS
- Solution replay verification: PASS
- Pilot manifest check: PASS

## Predictor variation

Across the 20 unique sampled states:

| Variable | Mean | SD | Min | Max |
| --- | ---: | ---: | ---: | ---: |
| Flipped-edge count | 5.50 | 1.70 | 2 | 8 |
| Twisted-corner count | 5.60 | 1.23 | 2 | 7 |
| Corner cycle deficit | 4.65 | 0.99 | 3 | 7 |
| Edge cycle deficit | 8.45 | 1.28 | 6 | 10 |
| Permutation-cycle deficit | 13.10 | 1.89 | 10 | 16 |

The three primary predictors are not degenerate in the pilot. Pairwise pilot correlations among the primary predictors were modest: approximately 0.05, 0.31, and 0.34. These are diagnostic only and are not inferential results.

## Response variation

### Human-style CFOP

- Mean HTM: 71.15
- SD: 7.90
- Range: 56–87

### cubejs two-phase

- Mean HTM: 21.60
- SD: 0.50
- Range: 21–22

The narrow two-phase HTM range is a model-diagnostic issue to retain for the primary analysis. It does **not** invalidate the sampling or collection pipeline. The raw primary dataset will retain solution entropy and axis-change rate as secondary responses so the analysis is not limited to solution length.

## Paired diagnostic

CFOP minus two-phase HTM difference:

- Mean: 49.55
- SD: 7.94
- Range: 34–66

All 20 pilot states had longer CFOP sequences than two-phase sequences. This is a pilot diagnostic, not a preregistered inferential conclusion.

## Decision

The technical pilot gate is closed as PASS. Proceed to the frozen 300-state primary sample using study seed:

`EE-2026-RANDOM-STATE-MAIN-01`

Do not modify the sampling algorithm, primary predictors, solver identities, or primary seed after primary generation unless a blocking defect is discovered and the dataset is explicitly versioned and regenerated from scratch.
