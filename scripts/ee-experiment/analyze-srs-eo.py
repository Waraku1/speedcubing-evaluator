#!/usr/bin/env python3
import argparse
import csv
import json
import math
import random
import statistics
from collections import defaultdict
from pathlib import Path

METHODS = ["cfop-human-v1", "two-phase-cubejs-v1"]
WEIGHTS = [0, 2, 4, 6, 8, 10, 12]
WEIGHT_INDEX = {h: i for i, h in enumerate(WEIGHTS)}

def percentile(values, q):
    values = sorted(values)
    if not values:
        return None
    pos = (len(values) - 1) * q
    lo = math.floor(pos)
    hi = math.ceil(pos)
    if lo == hi:
        return values[lo]
    frac = pos - lo
    return values[lo] * (1 - frac) + values[hi] * frac

def betacf(a, b, x):
    max_iter = 300
    eps = 3e-14
    fpmin = 1e-300

    qab = a + b
    qap = a + 1.0
    qam = a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < fpmin:
        d = fpmin
    d = 1.0 / d
    h = d

    for m in range(1, max_iter + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < fpmin:
            d = fpmin
        c = 1.0 + aa / c
        if abs(c) < fpmin:
            c = fpmin
        d = 1.0 / d
        h *= d * c

        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < fpmin:
            d = fpmin
        c = 1.0 + aa / c
        if abs(c) < fpmin:
            c = fpmin
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < eps:
            break
    return h

def regularized_beta(x, a, b):
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0
    ln_bt = (
        math.lgamma(a + b)
        - math.lgamma(a)
        - math.lgamma(b)
        + a * math.log(x)
        + b * math.log1p(-x)
    )
    bt = math.exp(ln_bt)
    if x < (a + 1.0) / (a + b + 2.0):
        return bt * betacf(a, b, x) / a
    return 1.0 - bt * betacf(b, a, 1.0 - x) / b

def f_survival(f_value, df1, df2):
    if f_value <= 0:
        return 1.0
    x = (df1 * f_value) / (df1 * f_value + df2)
    cdf = regularized_beta(x, df1 / 2.0, df2 / 2.0)
    return max(0.0, min(1.0, 1.0 - cdf))

def aggregated_effect(counts, sums, sumsq):
    n = sum(counts)
    total_sum = sum(sums)
    total_sumsq = sum(sumsq)
    if n <= 1:
        return None

    ss_total = total_sumsq - total_sum * total_sum / n
    ss_between = sum(
        (s * s / c) for c, s in zip(counts, sums) if c > 0
    ) - total_sum * total_sum / n
    ss_within = ss_total - ss_between

    k = sum(c > 0 for c in counts)
    df_between = k - 1
    df_within = n - k

    eta2 = ss_between / ss_total if ss_total > 0 else 0.0

    if df_between > 0 and df_within > 0 and ss_within >= 0:
        ms_between = ss_between / df_between
        ms_within = ss_within / df_within
        f_value = ms_between / ms_within if ms_within > 0 else math.inf
        p_value = f_survival(f_value, df_between, df_within) if math.isfinite(f_value) else 0.0
        omega2 = (
            (ss_between - df_between * ms_within) /
            (ss_total + ms_within)
        ) if (ss_total + ms_within) > 0 else 0.0
    else:
        ms_between = None
        ms_within = None
        f_value = None
        p_value = None
        omega2 = None

    return {
        "n": n,
        "observed_groups": k,
        "ss_total": ss_total,
        "ss_between": ss_between,
        "ss_within": ss_within,
        "eta_squared": eta2,
        "omega_squared": omega2,
        "df_between": df_between,
        "df_within": df_within,
        "ms_between": ms_between,
        "ms_within": ms_within,
        "f_statistic": f_value,
        "p_value": p_value,
    }

def linear_from_aggregates(counts, sums):
    n = sum(counts)
    sum_x = sum(c * h for c, h in zip(counts, WEIGHTS))
    sum_xx = sum(c * h * h for c, h in zip(counts, WEIGHTS))
    sum_y = sum(sums)
    sum_xy = sum(h * s for h, s in zip(WEIGHTS, sums))

    denom_x = sum_xx - sum_x * sum_x / n
    slope = (sum_xy - sum_x * sum_y / n) / denom_x if denom_x > 0 else 0.0
    intercept = (sum_y - slope * sum_x) / n

    return {
        "intercept": intercept,
        "slope_htm_per_flipped_edge": slope,
    }

def observed_summary(weights, values):
    counts = [0] * len(WEIGHTS)
    sums = [0.0] * len(WEIGHTS)
    sumsq = [0.0] * len(WEIGHTS)
    groups = defaultdict(list)

    for h, y in zip(weights, values):
        j = WEIGHT_INDEX[h]
        counts[j] += 1
        sums[j] += y
        sumsq[j] += y * y
        groups[h].append(y)

    effect = aggregated_effect(counts, sums, sumsq)
    linear = linear_from_aggregates(counts, sums)

    xbar = statistics.fmean(weights)
    ybar = statistics.fmean(values)
    sxx = sum((x - xbar) ** 2 for x in weights)
    syy = sum((y - ybar) ** 2 for y in values)
    sxy = sum((x - xbar) * (y - ybar) for x, y in zip(weights, values))
    r = sxy / math.sqrt(sxx * syy) if sxx > 0 and syy > 0 else 0.0

    group_stats = {}
    for h in WEIGHTS:
        vals = groups.get(h, [])
        group_stats[str(h)] = {
            "n": len(vals),
            "mean_htm": statistics.fmean(vals) if vals else None,
            "stdev_htm": statistics.stdev(vals) if len(vals) > 1 else None,
        }

    return {
        **effect,
        "null_eta_squared_finite_sample_reference": (effect["observed_groups"] - 1) / (effect["n"] - 1),
        "linear": {
            **linear,
            "pearson_r": r,
            "linear_r_squared": r * r,
        },
        "group_stats": group_stats,
    }

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--csv", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--bootstrap", type=int, default=10000)
    p.add_argument("--bootstrap-seed", default="EE-2026-EO-SRS-BOOTSTRAP-01")
    args = p.parse_args()

    with Path(args.csv).open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    by_state = defaultdict(dict)
    for row in rows:
        if row["status"] == "ok":
            by_state[row["state_id"]][row["method_id"]] = row

    states = []
    for state_id, methods in by_state.items():
        if set(methods) != set(METHODS):
            continue
        c = methods["cfop-human-v1"]
        t = methods["two-phase-cubejs-v1"]
        h = int(c["x_eo_hamming_weight"])
        if h != int(t["x_eo_hamming_weight"]):
            raise ValueError(f"paired EO-weight mismatch for {state_id}")
        states.append((
            h,
            int(c["y_solution_length_htm"]),
            int(t["y_solution_length_htm"]),
        ))

    if not states:
        raise ValueError("no complete paired states available")

    weights = [x[0] for x in states]
    cfop = [x[1] for x in states]
    two = [x[2] for x in states]
    delta = [c - t for c, t in zip(cfop, two)]

    observed = {
        "cfop-human-v1": observed_summary(weights, cfop),
        "two-phase-cubejs-v1": observed_summary(weights, two),
        "paired_difference_cfop_minus_two_phase": observed_summary(weights, delta),
    }

    rng = random.Random(args.bootstrap_seed)
    n = len(states)
    indices = list(range(n))

    boot_eta_c = []
    boot_eta_t = []
    boot_eta_d = []
    boot_eta_diff = []
    boot_slope_c = []
    boot_slope_t = []
    boot_slope_d = []
    boot_group_c = {h: [] for h in WEIGHTS}
    boot_group_t = {h: [] for h in WEIGHTS}

    hidx = [WEIGHT_INDEX[h] for h in weights]

    for b in range(args.bootstrap):
        counts = [0] * len(WEIGHTS)
        sum_c = [0.0] * len(WEIGHTS)
        sum_t = [0.0] * len(WEIGHTS)
        sum_d = [0.0] * len(WEIGHTS)
        sumsq_c = [0.0] * len(WEIGHTS)
        sumsq_t = [0.0] * len(WEIGHTS)
        sumsq_d = [0.0] * len(WEIGHTS)

        sample = rng.choices(indices, k=n)
        for idx in sample:
            j = hidx[idx]
            c = cfop[idx]
            t = two[idx]
            d = c - t
            counts[j] += 1
            sum_c[j] += c
            sum_t[j] += t
            sum_d[j] += d
            sumsq_c[j] += c * c
            sumsq_t[j] += t * t
            sumsq_d[j] += d * d

        ec = aggregated_effect(counts, sum_c, sumsq_c)
        et = aggregated_effect(counts, sum_t, sumsq_t)
        ed = aggregated_effect(counts, sum_d, sumsq_d)

        boot_eta_c.append(ec["eta_squared"])
        boot_eta_t.append(et["eta_squared"])
        boot_eta_d.append(ed["eta_squared"])
        boot_eta_diff.append(ec["eta_squared"] - et["eta_squared"])

        boot_slope_c.append(linear_from_aggregates(counts, sum_c)["slope_htm_per_flipped_edge"])
        boot_slope_t.append(linear_from_aggregates(counts, sum_t)["slope_htm_per_flipped_edge"])
        boot_slope_d.append(linear_from_aggregates(counts, sum_d)["slope_htm_per_flipped_edge"])

        for j, h in enumerate(WEIGHTS):
            if counts[j] > 0:
                boot_group_c[h].append(sum_c[j] / counts[j])
                boot_group_t[h].append(sum_t[j] / counts[j])

        if (b + 1) % 1000 == 0 or b + 1 == args.bootstrap:
            print(f"bootstrap {b + 1}/{args.bootstrap}")

    def ci(values):
        return {
            "lower_2_5_percentile": percentile(values, 0.025),
            "upper_97_5_percentile": percentile(values, 0.975),
        }

    observed["cfop-human-v1"]["eta_squared_bootstrap_95_ci"] = ci(boot_eta_c)
    observed["two-phase-cubejs-v1"]["eta_squared_bootstrap_95_ci"] = ci(boot_eta_t)
    observed["paired_difference_cfop_minus_two_phase"]["eta_squared_bootstrap_95_ci"] = ci(boot_eta_d)

    observed["cfop-human-v1"]["linear"]["slope_bootstrap_95_ci"] = ci(boot_slope_c)
    observed["two-phase-cubejs-v1"]["linear"]["slope_bootstrap_95_ci"] = ci(boot_slope_t)
    observed["paired_difference_cfop_minus_two_phase"]["linear"]["slope_bootstrap_95_ci"] = ci(boot_slope_d)

    for h in WEIGHTS:
        observed["cfop-human-v1"]["group_stats"][str(h)]["mean_bootstrap_95_ci"] = ci(boot_group_c[h])
        observed["two-phase-cubejs-v1"]["group_stats"][str(h)]["mean_bootstrap_95_ci"] = ci(boot_group_t[h])

    result = {
        "analysisVersion": "eo-srs-v1",
        "analysisPopulation": "v4 confirmatory direct-uniform-random-state dataset only",
        "states": n,
        "bootstrapResamples": args.bootstrap,
        "bootstrapSeed": args.bootstrap_seed,
        "primary": {
            "cfop-human-v1": observed["cfop-human-v1"],
            "two-phase-cubejs-v1": observed["two-phase-cubejs-v1"],
        },
        "methodComparison": {
            "delta_eta_squared_cfop_minus_two_phase": (
                observed["cfop-human-v1"]["eta_squared"]
                - observed["two-phase-cubejs-v1"]["eta_squared"]
            ),
            "delta_eta_squared_bootstrap_95_ci": ci(boot_eta_diff),
            "pairedLengthGap": observed["paired_difference_cfop_minus_two_phase"],
        },
        "interpretationGuardrail": (
            "Eta-squared is descriptive explained variance. Omega-squared is reported as a "
            "finite-sample bias-reduced companion. Statistical significance is not treated "
            "as practical importance."
        ),
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
