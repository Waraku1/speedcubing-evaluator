# EE Data Freeze v4.0

This commit freezes and triggers the confirmatory EO Hamming-weight study.

Design:
- target population: uniform distribution over all reachable 3×3×3 cube states;
- sampling: direct uniform random-state sampling;
- no EO stratification, quota, rejection, or replacement;
- sole primary predictor: EO Hamming weight;
- main states: 20,480;
- solver methods: deterministic human-style CFOP and cubejs two-phase;
- expected solver rows: 40,960;
- primary effect-size metric: categorical eta-squared;
- companion bias-reduced metric: omega-squared;
- minimum sensitivity target used for planning: eta-squared = 0.001;
- bootstrap: 10,000 paired state-level resamples;
- study seed: EE-2026-EO-SRS-MAIN-01;
- bootstrap seed: EE-2026-EO-SRS-BOOTSTRAP-01.

The v3 4096-state EO-enumeration dataset remains exploratory only and is not pooled into this confirmatory dataset.
