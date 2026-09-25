# IB Math AA EE — EO Hamming-Weight Experiment Requirements v4.0

Status: DESIGN FROZEN — MAIN DATA NOT YET GENERATED
Branch: `ee/experiment-pipeline-v1`

This document supersedes v3.0 for any future confirmatory main-data collection.
The v3 4096-state EO-enumeration dataset is retained as exploratory/pilot evidence only and must not be pooled with the v4 confirmatory dataset.

## 1. Research question

To what extent does edge-orientation Hamming weight account for variation in HTM solution length among uniformly sampled reachable 3×3×3 Rubik's Cube states, for:

1. the repository's deterministic human-style CFOP solver; and
2. the deterministic `cubejs` two-phase solver?

The sole explanatory variable in the primary study is EO Hamming weight.

The language of the report must be associational/explanatory-variance language, not causal language.

## 2. Population and direct random-state sampling

The target population is the uniform distribution over all physically reachable 3×3×3 cube states in the fixed URFDLB cubie reference frame.

Each main-study state is sampled independently and directly from that population.

For each state:

1. sample corner permutation uniformly from all 8! permutations;
2. sample seven independent corner-orientation coordinates in {0,1,2} and set the eighth so the twist sum is 0 mod 3;
3. sample edge permutation uniformly from all 12! permutations and enforce the cube permutation-parity constraint;
4. sample eleven independent edge-orientation coordinates in {0,1} and set the twelfth so the flip sum is 0 mod 2.

No state is accepted, rejected, stratified, duplicated intentionally, or resampled on the basis of EO vector or EO Hamming weight.

The EO vector is therefore an observed characteristic of the random state, not a design-controlled factor.

## 3. EO Hamming weight

Write the edge-orientation coordinate as

`e = (e_1,...,e_12)`, where `e_r in {0,1}`

and legal states satisfy

`sum(e_r) = 0 (mod 2)`.

Define

`H_EO = sum(e_r)`.

Thus

`H_EO in {0,2,4,6,8,10,12}`.

There are `2^11 = 2048` legal EO vectors, all equiprobable under the uniform random-state population.

Hence the population probabilities are

- P(H=0) = 1/2048
- P(H=2) = 66/2048
- P(H=4) = 495/2048
- P(H=6) = 924/2048
- P(H=8) = 495/2048
- P(H=10) = 66/2048
- P(H=12) = 1/2048.

The confirmatory sample must reproduce these probabilities only stochastically; exact counts are not imposed.

## 4. Confirmatory sample size

The v3 4096-state EO-enumeration dataset is used only as an exploratory planning dataset.

Its observed explanatory powers were approximately:

- CFOP categorical eta-squared: 0.00423
- two-phase categorical eta-squared: 0.00232
- two-phase linear R-squared: approximately 0.00101.

To avoid choosing a confirmatory sample that is only large enough to rediscover the exploratory effect, v4 pre-declares a smaller minimum effect of interest:

`eta^2_min = 0.001`

meaning 0.1% of solution-length variance explained by EO Hamming weight.

For a seven-level EO-weight factor, the omnibus model has six tested degrees of freedom.

Using the standard fixed-model noncentral-F sensitivity calculation with:

- alpha = 0.05
- target power = 0.90
- tested degrees of freedom = 6
- effect size `f^2 = eta^2/(1-eta^2)`

the minimum required sample is approximately 17,408 independent random states.

The frozen confirmatory sample size is:

`N = 20,480 random states`.

This value has a second population-based interpretation: because each exact legal EO vector has probability 1/2048, a 20,480-state simple random sample contains an expected 10 observations of each exact EO vector. Consequently the rare H=0 and H=12 categories each also have expected count 10, while remaining naturally rare.

Expected Hamming-weight counts are therefore:

- H=0: 10
- H=2: 660
- H=4: 4,950
- H=6: 9,240
- H=8: 4,950
- H=10: 660
- H=12: 10.

These are expectations only. The observed counts must not be forced to equal them.

## 5. Study independence from exploratory data

The v4 confirmatory dataset must use a new frozen seed:

`EE-2026-EO-SRS-MAIN-01`.

No state from the v3 dataset is intentionally carried forward.

The v3 dataset may be cited only as:
- pipeline/exploratory evidence;
- the source used to set a conservative sensitivity target.

It must not be pooled into v4 coefficient, eta-squared, R-squared, confidence-interval, or hypothesis-test calculations.

## 6. Solver pairing

Every sampled state is passed unchanged to both deterministic solver adapters.

### CFOP
Use the repository state-based human-style pipeline:
Cross -> F2L -> OLL -> PLL.

### Two-phase
Use `cubejs` two-phase solving on the same canonical URFDLB state.

The state is the experimental unit. Solver output rows are paired observations belonging to that state.

No repeated solver runs are required because the solver implementations are deterministic.

## 7. Primary response

Primary response:

`L = y_solution_length_htm`.

Runtime is diagnostic metadata only.

Sequence entropy and axis-change rate are outside the v4 primary analysis.

## 8. Primary estimand: variance explained by EO Hamming weight

Because EO Hamming weight has seven admissible values and no linear functional form is assumed, the primary model treats Hamming weight as a categorical factor.

For each solver separately:

`eta^2 = SS_between / SS_total`

where

`SS_between = sum_h n_h (mean(L_h) - mean(L))^2`

and

`SS_total = sum_i (L_i - mean(L))^2`.

This equals the ordinary coefficient of determination from a seven-level factor regression.

Primary estimands:

- `eta^2_CFOP`
- `eta^2_TwoPhase`.

Interpret `100 eta^2` as the percentage of observed solution-length variance accounted for by knowledge of EO Hamming weight in a uniform-random-state sample.

## 9. Primary inference

For each solver report:

- eta-squared;
- 95% confidence interval from state-level nonparametric bootstrap;
- one-way ANOVA omnibus F statistic with 6 and N-7 degrees of freedom;
- corresponding p-value;
- group count, mean, standard deviation, and confidence interval for every observed EO-weight level.

Use 10,000 bootstrap resamples of whole states.

Bootstrap resampling must preserve the paired CFOP/two-phase rows belonging to each state.

The inferential focus remains effect size and uncertainty; statistical significance alone is not a substantive conclusion.

## 10. Solver comparison

The methods are compared using the paired state structure.

Primary comparison quantity:

`Delta_eta^2 = eta^2_CFOP - eta^2_TwoPhase`.

Estimate its 95% confidence interval with the same paired state-level bootstrap.

Also define the paired length gap

`Delta_i = L_CFOP,i - L_TwoPhase,i`

and report the categorical eta-squared of EO Hamming weight for `Delta_i` as a secondary comparison.

## 11. Secondary linear characterization

For each solver fit:

`L_i = beta_0 + beta_1 H_EO,i + epsilon_i`.

Report:

- beta_1 in HTM moves per additional flipped edge;
- Pearson r;
- linear R-squared;
- 95% confidence interval for beta_1;
- residual diagnostics.

The linear model is descriptive and secondary. It must not replace the categorical primary model unless the EE later explicitly changes its research question before inspecting v4 outcomes.

## 12. Sampling and data-integrity rules

- sample exactly N=20,480 direct random states;
- do not condition generation on EO;
- do not enforce EO-weight quotas;
- do not reject rare, easy, hard, solved, or duplicated legal states;
- record duplicate state signatures if they occur;
- retain solver failures explicitly;
- do not replace failed states with new states;
- if a code/solver defect invalidates the run, fix the pipeline and regenerate the entire dataset from the same frozen seed;
- verify every returned solution by replay;
- record source SHA, execution SHA, generator version, solver versions, and CSV SHA-256.

## 13. Acceptance gate

The confirmatory v4 dataset is accepted only if:

- exactly 20,480 generated state records exist;
- exactly 40,960 solver rows exist;
- every generated state satisfies cube orientation and parity constraints;
- regeneration from seed + sample index is deterministic;
- EO Hamming weight equals the decoded EO-vector Hamming weight;
- both solver rows exist for every state;
- every accepted solver row replays to the solved state;
- no EO-based filtering or quota logic is present;
- an independent audit confirms the observed EO-weight counts but does not require exact expected counts;
- CSV SHA-256 matches the manifest;
- provenance fields are complete.

## 14. Frozen candidate parameters

- study version: 4.0.0
- sampling mode: direct uniform random state
- study seed: EE-2026-EO-SRS-MAIN-01
- main states: 20,480
- solver methods: 2
- expected solver rows: 40,960
- sole primary predictor: EO Hamming weight
- primary effect-size metric: categorical eta-squared
- minimum sensitivity target used for planning: eta-squared = 0.001
- bootstrap resamples: 10,000\n- bootstrap seed: `EE-2026-EO-SRS-BOOTSTRAP-01`

This v4 design was explicitly accepted before main-data generation. The parameters in Section 14 are frozen for the confirmatory run.
