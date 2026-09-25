# EE EO Hamming-Weight Confirmatory Results v4.0

Status: MAIN DATA COMPLETE / AUDIT PASS  
Confirmatory dataset only. The v3 EO-enumeration dataset is not pooled into these results.

## 1. Provenance

- frozen branch: `ee/data-freeze-v4.0.0`
- source/execution SHA: `c5bce4342231615243736e38522e709324af2b8e`
- study seed: `EE-2026-EO-SRS-MAIN-01`
- bootstrap seed: `EE-2026-EO-SRS-BOOTSTRAP-01`
- sampling mode: `direct_uniform_random_state_v1`
- states: 20,480
- solver rows: 40,960
- failed solver rows: 0
- duplicate state signatures: 0
- CSV SHA-256: `f03c03ce0de322aad6e8f4c6eb36351f6186031abd3af95f3a97adc87153d1d7`
- GitHub artifact digest: `sha256:d4f9983da93ae8b007706d14ed0599090a5d04b88fd9e167960a9dd1761683f8`

## 2. Sampling diagnostic

Observed EO Hamming-weight counts:

| H_EO | Observed | Expected under uniform state sampling |
|---:|---:|---:|
| 0 | 10 | 10 |
| 2 | 666 | 660 |
| 4 | 4,914 | 4,950 |
| 6 | 9,294 | 9,240 |
| 8 | 4,899 | 4,950 |
| 10 | 687 | 660 |
| 12 | 10 | 10 |

Pearson chi-square diagnostic: `2.2619480519` for 6 df.  
The independent audit passed and did not impose any EO quota or exact-count criterion.

## 3. Primary explained-variance results

| Method | eta^2 | bootstrap 95% CI | omega^2 | F(6, 20473) | p |
|---|---:|---:|---:|---:|---:|
| CFOP | 0.001983997 | [0.001132413, 0.003629978] | 0.001691427 | 6.78319 | 3.37e-7 |
| Two-phase | 0.003005586 | [0.001601028, 0.006071974] | 0.002713265 | 10.28648 | 2.10e-11 |

Thus the observed categorical explained variance is about:

- CFOP: 0.1984% of solution-length variance;
- two-phase: 0.3006% of solution-length variance.

The pre-declared sensitivity target was `eta^2_min = 0.001` (0.1%). Both point estimates and both percentile-bootstrap lower bounds are above that value.

The finite-sample null reference for raw eta-squared is approximately

`(7 - 1) / (20,480 - 1) = 0.000292983`.

The bias-reduced omega-squared estimates also remain above 0.001 for both methods.

## 4. Method comparison

`Delta eta^2 = eta^2_CFOP - eta^2_TwoPhase = -0.001021589`.

Paired state-bootstrap 95% CI:

`[-0.004042266, 0.001141957]`.

Because this interval includes zero, the confirmatory data do not clearly distinguish the two methods in relative categorical explained variance.

For the paired length gap

`Delta_i = L_CFOP,i - L_TwoPhase,i`:

- categorical eta-squared = 0.001728629;
- omega-squared = 0.001435997;
- bootstrap 95% CI for eta-squared = [0.000962698, 0.003318455].

## 5. Linear secondary characterization

| Method/response | slope (HTM per additional flipped edge) | bootstrap 95% CI | linear R^2 |
|---|---:|---:|---:|
| CFOP | +0.175744 | [0.119587, 0.231557] | 0.001786066 |
| Two-phase | +0.010351 | [0.005543, 0.015075] | 0.000931860 |
| CFOP - Two-phase | +0.165393 | [0.109109, 0.221483] | 0.001568647 |

The positive paired-gap slope indicates that the absolute CFOP-minus-two-phase solution-length gap tends to increase with EO Hamming weight.

The linear R^2 accounts for about 90.0% of the categorical eta-squared for CFOP, but only about 31.0% for two-phase. Therefore the CFOP association is much closer to an approximately linear trend, whereas most of the two-phase categorical explained variance is non-linear across EO-weight groups.

## 6. Absolute versus relative scale

The overall solution-length standard deviations are approximately:

- CFOP: 7.213 HTM;
- two-phase: 0.588 HTM.

Since `eta = sqrt(eta^2)`, the standard deviation of the EO-conditioned mean component is approximately:

- CFOP: `7.213 * sqrt(0.001984) = 0.321 HTM`;
- two-phase: `0.588 * sqrt(0.003006) = 0.032 HTM`.

Therefore the larger two-phase eta-squared does not imply a larger absolute EO effect. Two-phase has a much smaller total solution-length variance, so a very small absolute between-EO variation can represent a larger proportion of its total variance.

## 7. Group means

| H_EO | n | CFOP mean HTM | Two-phase mean HTM |
|---:|---:|---:|---:|
| 0 | 10 | 67.100 | 20.900 |
| 2 | 666 | 68.002 | 21.686 |
| 4 | 4,914 | 68.675 | 21.666 |
| 6 | 9,294 | 69.131 | 21.725 |
| 8 | 4,899 | 69.355 | 21.717 |
| 10 | 687 | 69.498 | 21.732 |
| 12 | 10 | 69.400 | 21.200 |

H=0 and H=12 are naturally rare under uniform random-state sampling, so their group means have substantially wider uncertainty and should not be over-interpreted.

## 8. Interpretation guardrails

- The study measures association / explained variance, not causation.
- Statistical significance must not be treated as practical importance.
- Eta-squared is relative to each solver's own total variance, so cross-method comparison must also consider absolute HTM effects and solution-length standard deviations.
- Omega-squared is reported as a finite-sample bias-reduced companion to raw eta-squared.
- The exploratory v3 dataset must not be pooled into any v4 inferential calculation.
