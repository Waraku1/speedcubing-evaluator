# IB Math AA EE — EO Hamming-Weight Experiment Requirements v3.0

Status: DESIGN FROZEN CANDIDATE — MAIN DATA NOT YET GENERATED
Branch: `ee/experiment-pipeline-v1`

This document supersedes the multi-predictor v2.x experiment design for the main EE analysis.

## 1. Research question

To what extent does edge-orientation (EO) Hamming weight explain variation in HTM solution length for 3×3×3 Rubik's Cube states solved by:

1. the repository's human-style CFOP solver; and
2. the `cubejs` two-phase solver?

The study is deliberately restricted to EO Hamming weight as the sole explanatory variable.

## 2. Mathematical definition of EO Hamming weight

In the fixed cubie reference frame, write the edge-orientation coordinate as

`e = (e_1, ..., e_12)`, with `e_r in {0,1}`.

A physically reachable cube satisfies

`sum(e_r) = 0 (mod 2)`.

The EO Hamming weight is

`H_EO(e) = sum(e_r)`.

Therefore

`H_EO in {0,2,4,6,8,10,12}`.

Because the twelfth EO coordinate is determined by the first eleven, the legal EO subspace contains exactly

`2^11 = 2048`

distinct EO vectors.

Under the uniform random-state population, these 2048 legal EO vectors are equiprobable. Therefore the exact population marginal counts by Hamming weight are proportional to

- weight 0: `C(12,0) = 1`
- weight 2: `C(12,2) = 66`
- weight 4: `C(12,4) = 495`
- weight 6: `C(12,6) = 924`
- weight 8: `C(12,8) = 495`
- weight 10: `C(12,10) = 66`
- weight 12: `C(12,12) = 1`

which sum to 2048.

## 3. Experimental design

### 3.1 Complete EO enumeration

The main dataset uses two complete EO-enumeration blocks.

Within each block, every one of the 2048 legal EO vectors appears exactly once.

Thus:

`N_state = 2 × 2048 = 4096 states`

and, because every state is solved by both methods,

`N_solver_row = 4096 × 2 = 8192 rows`.

### 3.2 Why 4096 states

The sample size is determined from the mathematical structure of the predictor space rather than from an arbitrary percentage of the full cube state space or a post-hoc pilot effect size.

One complete block of 2048 states exhaustively covers the entire legal EO coordinate space while preserving the exact EO-Hamming-weight marginal distribution of the uniform random-state population.

A second complete block repeats that entire EO space while independently re-randomizing every nuisance coordinate. The second block therefore provides an internal replication against accidental dependence on one particular draw of the non-EO state coordinates.

This produces two independently randomized realizations of the same complete EO design.

The 20-state pilot is not part of the main dataset and is not used to estimate the EO effect.

## 4. Nuisance-coordinate randomization

For each pair `(block_index, eo_index)`:

1. set EO deterministically to the legal EO vector represented by `eo_index`;
2. sample corner permutation uniformly from the 8! possibilities;
3. sample the first seven corner orientations uniformly from `{0,1,2}` and constrain the eighth by the twist-sum rule;
4. sample edge permutation uniformly from the 12! possibilities and enforce parity agreement with the corner permutation.

The random stream is deterministically keyed by:

`study_seed + block_index + eo_index`.

Hence each main state is exactly reproducible while the non-EO coordinates are randomized independently across EO vectors and across the two blocks.

Corner orientation, corner permutation, edge permutation, cycle structure, and any other derived state property are nuisance variables. They are recorded for reproducibility but are not admissible explanatory variables in the primary EE analysis.

## 5. Solver pairing

Every generated state is passed directly, in the same canonical URFDLB state representation, to both solver adapters.

### CFOP
Use the repository's state-based human-style CFOP pipeline:

Cross -> F2L -> OLL -> PLL.

### Two-phase
Use `cubejs` two-phase solving on the exact same canonical state.

Every solver output must replay to the solved state before the row is accepted as valid.

## 6. Primary response variable

The sole primary response is

`L = y_solution_length_htm`,

the number of HTM face-turn tokens in the verified solution.

Runtime and any sequence-entropy metrics are not part of the primary EE analysis.

## 7. Primary measure of explanatory power

EO Hamming weight has seven admissible values and the relationship with solution length need not be linear.

Therefore the primary measure is the one-factor explained-variance ratio, calculated separately for each solving method:

`eta^2 = SS_between / SS_total`

where

`SS_between = sum_h n_h (mean(L_h) - mean(L))^2`

and

`SS_total = sum_i (L_i - mean(L))^2`.

This is algebraically equal to the coefficient of determination `R^2` from a regression that treats EO Hamming weight as a seven-level categorical factor.

Interpretation:

`eta^2 × 100%`

is the percentage of observed solution-length variance explained by knowing EO Hamming weight, without assuming a linear relationship.

Primary outputs:

- `eta^2_CFOP`
- `eta^2_TwoPhase`
- their block-specific values for replication/stability checking.

## 8. Secondary linear characterization

For each method, also fit

`L_i = beta_0 + beta_1 H_EO,i + epsilon_i`.

Report:

- slope `beta_1` in HTM moves per additional flipped edge;
- linear `R^2`;
- Pearson correlation;
- residual diagnostics.

This model characterizes direction and approximate linearity but does not replace the categorical `eta^2` as the primary explanatory-power measure.

## 9. Method-difference analysis

Because both methods solve the same state, define

`Delta_i = L_CFOP,i - L_TwoPhase,i`.

As a secondary paired analysis, evaluate:

- categorical `eta^2` of `Delta` by EO Hamming weight;
- linear regression `Delta_i = delta_0 + delta_1 H_EO,i + epsilon_i`.

This asks whether EO Hamming weight changes the relative gap between the two solving methods.

## 10. Main-data schema

Required state/provenance fields:

- study_version
- sampling_mode
- state_id
- study_seed
- sample_index
- block_index
- eo_index
- eo_vector
- x_eo_hamming_weight
- state_signature
- state_corner_permutation
- state_corner_orientation
- state_edge_permutation
- state_edge_orientation
- state_duplicate_of

Required solver fields:

- method_id
- method_version
- solution_moves
- y_solution_length_htm
- status
- error
- runtime_ms
- generator_version
- source_commit_sha
- execution_commit_sha
- created_at_utc

No additional derived cube-state feature is a primary or secondary explanatory variable in v3.0.

## 11. Exact EO-distribution invariants

For each complete 2048-state block, the generator must produce exactly:

`{0:1, 2:66, 4:495, 6:924, 8:495, 10:66, 12:1}`.

Across two blocks:

`{0:2, 2:132, 4:990, 6:1848, 8:990, 10:132, 12:2}`.

Every EO vector must occur exactly once per block.

## 12. Main-data acceptance gate

The 4096-state dataset is accepted only if:

- all 4096 states are deterministically reproducible;
- both blocks contain all 2048 legal EO vectors exactly once;
- exact Hamming-weight counts match Section 11;
- all cube parity/orientation constraints hold;
- all 8192 paired solver rows are present;
- every solver row has `status = "ok"`;
- every solution replay returns the solved state;
- no state is silently replaced or resampled;
- CSV SHA-256 matches its manifest;
- source and execution commit provenance are recorded;
- an independent post-generation audit passes.

If a solver or validation failure occurs, the dataset is not partially repaired by replacing states. The pipeline/code is corrected and the entire frozen dataset is regenerated from the same design seed.

## 13. Frozen main parameters

- study version: `3.0.0`
- study seed: `EE-2026-EO-MAIN-01`
- EO vectors per block: `2048`
- complete blocks: `2`
- main states: `4096`
- solver methods: `2`
- expected solver rows: `8192`

These values must not be changed after main-data generation begins.
