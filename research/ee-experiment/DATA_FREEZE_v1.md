# EE Primary Dataset Freeze v1

Status: **FROZEN / CANONICAL PRIMARY DATASET**

## Dataset identity

- Study version: `2.0.0`
- Sampling mode: `random_state_uniform_coordinate_v1`
- Primary study seed: `EE-2026-RANDOM-STATE-MAIN-01`
- Sampled states: 300
- Solver rows: 600
- Methods:
  - `cfop-human-v1`
  - `two-phase-cubejs-v1`
- Generator version: `random-state-sha256-coordinate-v1`
- Feature extractor version: `features-v1`
- Generated at UTC: `2026-09-24T22:24:05.559Z`

## Execution provenance

- GitHub Actions workflow: `EE main data generation`
- Workflow run ID: `36067169506`
- Artifact ID: `10836626929`
- Artifact name: `ee-random-state-main-v1`
- PR head SHA: `74f085d6dedd1eae356c864337eb3a029a42c456`
- Base SHA: `db3f1772f65fe9aebc6554f113dc47dc510ce002`
- Checkout / solver commit SHA recorded in manifest:
  `0c0961c91306d65a6173c60563bf310dab5d8f43`
- The checkout SHA is the GitHub pull-request test merge commit:
  `Merge 74f085d6dedd1eae356c864337eb3a029a42c456 into db3f1772f65fe9aebc6554f113dc47dc510ce002`

## Integrity

Artifact ZIP digest reported by GitHub:

`sha256:2328fa526e820d37a29af900a7974d6d70183b3a126ca71308003208ddec710b`

File checksums:

- `main-v1.csv`
  - `debbe90beec27866e5c9bde15dd0de4d681770cd4cea6010e1a950cf9e43a24b`
- `main-v1.manifest.json`
  - `bed298ef80effc8fce9795d4c47954fc4b94c6d78691fe37c60dda9dae5f540e`

The downloaded artifact was independently re-hashed after generation and matched both recorded checksums.

## Structural audit

- Expected rows: 600
- Actual rows: 600
- Successful rows: 600
- Failed rows: 0
- Paired states: 300 / 300
- Unique state signatures: 300
- Duplicate states: 0
- Rows per state: exactly 2 for all 300 states
- Distinct methods per state: exactly 2 for all 300 states
- State coordinates and all state-derived feature values are identical across the paired method rows for every state.

## Predictor diagnostics

Across the 300 unique states:

| Predictor / state metric | Mean | SD | Min | Max |
| --- | ---: | ---: | ---: | ---: |
| Flipped-edge count | 6.03 | 1.65 | 2 | 10 |
| Twisted-corner count | 5.44 | 1.37 | 0 | 8 |
| Corner cycle deficit | 5.29 | 1.13 | 1 | 7 |
| Edge cycle deficit | 8.82 | 1.30 | 4 | 11 |
| Permutation-cycle deficit | 14.11 | 1.67 | 8 | 18 |

The primary predictors are non-degenerate and span multiple values in the frozen sample.

## Response diagnostics

### Human-style CFOP

- Mean HTM: 69.01
- SD: 7.14
- Range: 50–87
- Mean normalized move-transition entropy: 0.7070
- Mean axis-change rate: 0.9490

### cubejs two-phase

- Mean HTM: 21.70
- SD: 0.60
- Range: 19–22
- Mean normalized move-transition entropy: 0.7316
- Mean axis-change rate: 0.9302

The narrow two-phase HTM distribution must be handled explicitly in model diagnostics. It is not a collection failure.

## Interpretation boundaries

- `scramble_moves` is a replay/display representation created by inverting the two-phase solution. It is not the sampled object.
- `scramble_length_htm` is metadata and must not be used as a primary explanatory variable.
- `runtime_ms` is diagnostic implementation timing and is not a primary mathematical efficiency outcome.
- The inferential population is the declared random-state population under the fixed reference orientation and sampling contract.
- State-feature associations are observational and must not be described as causal effects.

## Freeze rule

This dataset is the canonical primary dataset for the current EE experiment.

Do not regenerate, filter, replace, or modify the dataset after inspecting inferential results. If a blocking implementation or semantic defect is discovered, create a new explicitly versioned dataset and document why v1 was invalidated.
