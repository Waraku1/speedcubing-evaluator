# EE Data Freeze v3.0

This commit intentionally triggers the frozen EO Hamming-weight main-data workflow.

Design:
- predictor: EO Hamming weight only;
- complete legal EO vectors per block: 2048;
- independent nuisance-randomization blocks: 2;
- main states: 4096;
- solver methods: CFOP and cubejs two-phase;
- expected solver rows: 8192;
- study seed: EE-2026-EO-MAIN-01;
- primary explained-variance measure: categorical eta-squared by method;
- secondary characterization: linear slope and R-squared by method.

The main dataset must pass the EO enumeration audit before it is accepted.
