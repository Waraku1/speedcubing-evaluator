# IB Math AA EE — Experiment Requirements v2.0

Status: IMPLEMENTATION BASELINE — RANDOM-STATE SAMPLING
Branch: `ee/experiment-pipeline-v1`

## 1. Research objective

Measure how mathematically defined characteristics of randomly sampled reachable 3×3×3 cube states are associated with properties of the resulting solution sequence, and test whether those associations differ between a human-style CFOP solver and a computational two-phase solver.

This is an observational paired design over random cube states. Feature associations must not be described as causal effects.

## 2. Experimental unit and pairing

- Experimental unit: one sampled legal cube state identified by `scramble_id`.
- Block: `scramble_id`.
- The canonical object is the cube state, not a particular move sequence used to display that state.
- Every accepted state is solved by every declared solver adapter.
- State-feature values are calculated once and copied unchanged to each solver record.
- A failed solver run remains in the raw data with an explicit status.
- The solver adapters must receive the same canonical URFDLB state directly whenever their API permits it.

## 3. Random-state sampling contract

### 3.1 Population

Sample from the set of all physically reachable 3×3×3 cube states in the fixed URFDLB reference frame.

The state space has

`8! × 3^7 × 12! × 2^10`

reachable states.

### 3.2 Coordinate sampling

For every sampled state:

1. sample a corner permutation uniformly from the 8! permutations;
2. sample the first seven corner orientations independently from {0,1,2}, and set the eighth so that the orientation sum is 0 mod 3;
3. sample an edge permutation uniformly from the 12! permutations, constrained to have the same permutation parity as the corner permutation;
4. sample the first eleven edge orientations independently from {0,1}, and set the twelfth so that the orientation sum is 0 mod 2.

Permutation sampling must use unbiased Fisher–Yates choices. Integer generation must use rejection sampling rather than modulo reduction when the underlying PRNG range is not divisible by the requested range.

### 3.3 Reproducibility

- Primary sample size: 300 states.
- Frozen primary study seed: `EE-2026-RANDOM-STATE-MAIN-01`.
- Pilot study seed: `EE-2026-RANDOM-STATE-PILOT-01`.
- Sampling is pseudorandom but deterministically reproducible from the recorded study seed.
- Use a versioned seeded random stream with sufficient state/output width for this experiment; the exact generator implementation and version are recorded.
- `scramble_id` is derived from study seed + sample index, not from solver output.
- The exact `state_signature` and cubie coordinates are stored for every sample.
- Do not resample a legal state because it appears easy, hard, atypical, or duplicated. Duplicate-state occurrence is retained and flagged rather than silently replaced.
- The solved state is not excluded a priori; excluding it would alter the declared population, although its probability is negligible.

### 3.4 Scramble representation

A move sequence may be materialized for display/replay by solving the sampled state and inverting that solution. Its HTM length is allowed to vary.

The displayed scramble algorithm is a representation of the sampled state, not the experimental unit and not a primary explanatory variable.

No fixed 20-move requirement remains. The previous 10/20/30-move sensitivity design is removed.

## 4. Explanatory variables

All primary explanatory variables are state-derived so that their values do not depend on which scramble algorithm happens to represent the same state.

### X1 — flipped-edge count

Decode the twelve edge cubies in the fixed reference frame and count edges whose orientation coordinate is non-zero:

`F_e = Σ I(e_r != 0), r = 1..12`.

### X2 — twisted-corner count

Decode the eight corner cubies and count corners whose orientation coordinate is non-zero:

`T_c = Σ I(t_r != 0), r = 1..8`.

### X3 — permutation-cycle deficit

For corner permutation `pi_c` and edge permutation `pi_e`:

`D_pi = (8 - c(pi_c)) + (12 - c(pi_e))`

where `c(pi)` is the number of disjoint cycles including fixed points.

Secondary state variables:
- corner-cycle deficit;
- edge-cycle deficit;
- separate corner-orientation composition;
- separate edge-orientation composition.

### Removed from the primary model

`axis-transition entropy` of the scramble algorithm is not a primary predictor under random-state sampling, because it is a property of one chosen representation of a state rather than an invariant of the state itself.

It may be retained only as a diagnostic property of the materialized scramble sequence and must not be interpreted as an intrinsic state characteristic.

## 5. Solver adapters

### CFOP

Use the repository's physically validated human-style CFOP pipeline:
Cross → F2L → OLL → PLL.

For random-state sampling the adapter must call the canonical state-based interface (`solveCFOPState` or equivalent), not depend on the generated scramble representation.

### Two-phase

Use `cubejs` two-phase solving on the exact same canonical URFDLB state.

Do not relabel two-phase output as CFOP, Roux, or human solving.

## 6. Response variables

Primary:
- `y_solution_length_htm`: number of face-turn tokens in the verified solution.

Secondary:
- `y_move_transition_entropy`: normalized Shannon entropy of ordered face-to-face transitions in the solution;
- `y_axis_change_rate`: fraction of adjacent solution moves whose axes differ;
- runtime in milliseconds, diagnostic only.

Scramble-representation length is metadata only and is not a response variable.

## 7. Verification invariants

A sampled state is eligible only if:

1. its cubie coordinates satisfy all Rubik's Cube orientation and parity constraints;
2. serialization to the canonical URFDLB facelet representation is valid;
3. regenerating the same sample from the same study seed and index reproduces the identical cubie coordinates and `state_signature`;
4. if a scramble representation is materialized, replaying it from solved state produces exactly the canonical sampled state;
5. each solver returns only valid move notation;
6. replaying each solution from the canonical sampled state produces the solved state;
7. all declared features are finite and within their mathematical domains.

Raw solver failures are retained with `status != "ok"`.

## 8. Record schema

Required fields:

- study_version
- sampling_mode
- scramble_id
- study_seed
- sample_index
- state_signature
- state_corner_permutation
- state_corner_orientation
- state_edge_permutation
- state_edge_orientation
- state_duplicate_of
- scramble_moves
- scramble_length_htm
- scramble_representation_method
- x_flipped_edge_count
- x_twisted_corner_count
- x_corner_cycle_deficit
- x_edge_cycle_deficit
- x_permutation_cycle_deficit
- method_id
- method_version
- run_index
- solution_moves
- y_solution_length_htm
- y_move_transition_entropy
- y_axis_change_rate
- status
- error
- runtime_ms
- generator_version
- feature_extractor_version
- solver_commit_sha
- execution_commit_sha
- created_at_utc

Primary key:

`study_version + scramble_id + method_id + run_index`.

## 9. Analysis contract

Primary model:

`y_ij = beta_0 + Σ beta_k x_ik + alpha_j + Σ gamma_kj x_ik + u_i + epsilon_ij`

where:
- `i` indexes sampled states;
- `j` indexes solving methods;
- `u_i` is a state-level random intercept.

The primary predictors are:
- flipped-edge count;
- twisted-corner count;
- permutation-cycle deficit.

Report:
- coefficient estimates;
- 95% confidence intervals;
- standardized numeric effect sizes;
- residual diagnostics;
- feature × method interactions;
- paired within-state method contrasts;
- sensitivity to alternative but pre-declared state-feature parameterizations.

Do not select predictors by significance after inspecting the main dataset.

## 10. Pilot gate before main data

Run at least 20 paired sampled states and require:

- 100% deterministic regeneration from study seed + sample index;
- 100% cubie-orientation and permutation-parity validity;
- 100% state serialization validity;
- 100% scramble-representation replay agreement when a representation is generated;
- 100% solution verification for both solver adapters;
- no missing paired solver row;
- finite feature and response metrics;
- stable CSV and manifest output;
- SHA-256 digest of the emitted CSV in the manifest;
- stable source-commit provenance distinct from any ephemeral CI merge commit.

In addition, unit tests must establish the generator invariants independently of solver success.

Only after this gate passes should the 300-state primary dataset be generated.

## 11. Methodological interpretation

Random-state sampling separates the sampled mathematical object from its displayed scramble notation. This is essential to avoid treating an arbitrary solution-derived scramble sequence as if it were an intrinsic characteristic of the cube state.

The main inference is therefore about associations between state-space structure and solution-sequence structure, and about whether those associations differ across solving methods.
