# IB Math AA EE — Experiment Requirements v1.0

Status: IMPLEMENTATION BASELINE
Branch: `ee/experiment-pipeline-v1`

## 1. Research objective

Measure how reproducible characteristics of a 20-move 3×3×3 scramble are associated with properties of the resulting solution sequence, and test whether those associations differ between a human-style CFOP solver and a computational two-phase solver.

This is an observational paired design over naturally generated scramble states. Feature associations must not be described as causal effects.

## 2. Experimental unit and pairing

- Experimental unit: one generated scramble/state identified by `scramble_id`.
- Block: `scramble_id`.
- Every accepted scramble is solved by every declared solver adapter.
- Feature values are calculated once per scramble/state and copied unchanged to each solver record.
- A failed solver run remains in the raw data with an explicit status.

## 3. Main-data sampling contract

- Main scramble length: 20 HTM.
- Primary sample size: 300 unique scrambles.
- One deterministic run per solver per scramble.
- Seed is mandatory and recorded.
- Generator prohibits consecutive turns of the same face.
- Generator also prohibits three consecutive moves on the same axis.
- The generator is a fixed-length reproducible experimental generator; it must not be called an official WCA random-state scrambler.
- Sensitivity datasets at 10 and 30 HTM may be generated separately and must not be pooled into the primary model without an explicit length term.

## 4. Explanatory variables

### X1 — axis-transition entropy
For scramble move axes U/D, R/L, F/B, calculate the ordered transition distribution over the 3×3 axis pairs:

`H_axis = -Σ p_ab ln(p_ab) / ln(9)`.

Range: 0 to 1.

### X2 — twisted-corner count
Decode the eight corner cubies in the fixed URFDLB reference frame and count corners with orientation coordinate != 0.

`T_c = Σ I(t_r != 0)`.

### X3 — permutation-cycle deficit
Decode corner and edge permutations and calculate

`D_pi = (8 - c(pi_c)) + (12 - c(pi_e))`

where `c(pi)` is the number of cycles, including fixed points.

Secondary state variables may include flipped-edge count and separate corner/edge cycle deficits, but they are not primary predictors unless declared before analysis.

## 5. Solver adapters

### CFOP
Use the repository's physically validated human-style CFOP pipeline:
Cross → F2L → OLL → PLL.

The adapter must call the canonical CFOP implementation and record its version/provenance.

### Two-phase
Use `cubejs` two-phase solving on the exact same URFDLB state.

Do not relabel two-phase output as CFOP, Roux, or human solving.

## 6. Response variables

Primary:
- `y_solution_length_htm`: number of face-turn tokens in the verified solution.

Secondary:
- `y_move_transition_entropy`: normalized Shannon entropy of ordered face-to-face transitions in the solution.
- `y_axis_change_rate`: fraction of adjacent solution moves whose axes differ.
- runtime in milliseconds (diagnostic only; not a mathematical efficiency measure across implementations unless separately justified).

## 7. Verification invariants

A record is eligible for analysis only if:
1. the generated scramble has exactly the declared HTM length;
2. the canonical state equals application of the recorded scramble to solved state;
3. the solver returns only valid face-turn notation;
4. replaying the returned solution from the canonical state produces the solved state;
5. all feature values are finite and within their declared domains.

Raw failures are retained with `status != "ok"`.

## 8. Record schema

Required fields:
- study_version
- scramble_id
- scramble_seed
- scramble_index
- scramble_length_htm
- scramble_moves
- state_signature
- x_axis_transition_entropy
- x_twisted_corner_count
- x_flipped_edge_count
- x_corner_cycle_deficit
- x_edge_cycle_deficit
- x_permutation_cycle_deficit
- method_id
- method_version
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
- created_at_utc

Primary key:
`study_version + scramble_id + method_id + run_index`.

## 9. Analysis contract

Primary model:

`y_ij = beta_0 + Σ beta_k x_ik + alpha_j + Σ gamma_kj x_ik + u_i + epsilon_ij`

where `u_i` is a scramble-level random intercept.

Report coefficient estimates, 95% confidence intervals, residual diagnostics, standardized continuous predictors, and paired within-scramble method contrasts.

Do not select predictors by significance after inspecting the main dataset.

## 10. Pilot gate before main data

Run at least 20 paired scrambles and require:
- 100% deterministic scramble regeneration from seed;
- 100% state replay agreement;
- 100% solution verification for both solver adapters;
- no duplicate `scramble_id`;
- no missing paired solver row;
- finite metrics;
- stable CSV and manifest output.

Only after this gate passes should the 300-scramble primary dataset be generated.
