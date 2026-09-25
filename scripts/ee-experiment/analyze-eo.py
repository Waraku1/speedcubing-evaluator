#!/usr/bin/env python3
import argparse
import csv
import json
import math
import statistics
from collections import defaultdict
from pathlib import Path

METHODS = ["cfop-human-v1", "two-phase-cubejs-v1"]

def eta_squared(xs, ys):
    grand = statistics.fmean(ys)
    groups = defaultdict(list)
    for x, y in zip(xs, ys):
        groups[x].append(y)
    ss_between = sum(len(v) * (statistics.fmean(v) - grand) ** 2 for v in groups.values())
    ss_total = sum((y - grand) ** 2 for y in ys)
    return ss_between / ss_total if ss_total else 0.0

def linear_stats(xs, ys):
    xbar = statistics.fmean(xs)
    ybar = statistics.fmean(ys)
    sxx = sum((x - xbar) ** 2 for x in xs)
    syy = sum((y - ybar) ** 2 for y in ys)
    sxy = sum((x - xbar) * (y - ybar) for x, y in zip(xs, ys))
    slope = sxy / sxx if sxx else 0.0
    intercept = ybar - slope * xbar
    r = sxy / math.sqrt(sxx * syy) if sxx and syy else 0.0
    return {
        "intercept": intercept,
        "slope_htm_per_flipped_edge": slope,
        "pearson_r": r,
        "linear_r_squared": r * r,
    }

def summarize(rows):
    xs = [int(r["x_eo_hamming_weight"]) for r in rows]
    ys = [int(r["y_solution_length_htm"]) for r in rows]
    groups = defaultdict(list)
    for x, y in zip(xs, ys):
        groups[x].append(y)
    return {
        "n": len(rows),
        "eta_squared_categorical": eta_squared(xs, ys),
        "linear": linear_stats(xs, ys),
        "group_means": {
            str(h): {
                "n": len(vals),
                "mean_htm": statistics.fmean(vals),
                "stdev_htm": statistics.stdev(vals) if len(vals) > 1 else None,
            }
            for h, vals in sorted(groups.items())
        },
    }

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--csv", required=True)
    p.add_argument("--out", required=True)
    args = p.parse_args()

    with Path(args.csv).open(newline="", encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if r["status"] == "ok"]

    by_method = {m: [r for r in rows if r["method_id"] == m] for m in METHODS}
    by_state = defaultdict(dict)
    for r in rows:
        by_state[r["state_id"]][r["method_id"]] = r

    delta_rows = []
    for state_id, methods in by_state.items():
        if set(methods) != set(METHODS):
            continue
        c = methods["cfop-human-v1"]
        t = methods["two-phase-cubejs-v1"]
        delta_rows.append({
            "x_eo_hamming_weight": c["x_eo_hamming_weight"],
            "y_solution_length_htm": str(
                int(c["y_solution_length_htm"]) - int(t["y_solution_length_htm"])
            ),
        })

    block_results = {}
    for block in sorted({int(r["block_index"]) for r in rows}):
        block_results[str(block)] = {
            m: summarize([r for r in by_method[m] if int(r["block_index"]) == block])
            for m in METHODS
        }

    result = {
        "analysisVersion": "eo-v1",
        "primary": {m: summarize(by_method[m]) for m in METHODS},
        "pairedDifferenceCfopMinusTwoPhase": summarize(delta_rows),
        "blockReplication": block_results,
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
