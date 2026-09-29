#!/usr/bin/env python3
import argparse
import csv
import hashlib
import json
import math
import statistics
from collections import Counter, defaultdict
from pathlib import Path

EXPECTED_METHODS = {"cfop-human-v1", "two-phase-cubejs-v1"}
STATE_SHARED_COLUMNS = [
    "state_signature",
    "state_corner_permutation",
    "state_corner_orientation",
    "state_edge_permutation",
    "state_edge_orientation",
    "state_duplicate_of",
    "scramble_moves",
    "scramble_length_htm",
    "scramble_representation_method",
    "x_flipped_edge_count",
    "x_twisted_corner_count",
    "x_corner_cycle_deficit",
    "x_edge_cycle_deficit",
    "x_permutation_cycle_deficit",
]

def parse_int(row, key):
    return int(row[key])

def parse_float(row, key):
    value = float(row[key])
    if not math.isfinite(value):
        raise ValueError(f"{key} is not finite for {row.get('scramble_id')}")
    return value

def describe(values):
    values = list(values)
    if not values:
        return {"n": 0}
    return {
        "n": len(values),
        "mean": statistics.fmean(values),
        "min": min(values),
        "max": max(values),
        "stdev": statistics.stdev(values) if len(values) > 1 else 0.0,
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--expected-samples", required=True, type=int)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    csv_path = Path(args.csv)
    manifest_path = Path(args.manifest)
    out_path = Path(args.out)

    raw = csv_path.read_bytes()
    csv_sha256 = hashlib.sha256(raw).hexdigest()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    with csv_path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))

    expected_rows = args.expected_samples * len(EXPECTED_METHODS)
    errors = []

    if len(rows) != expected_rows:
        errors.append(f"row count {len(rows)} != expected {expected_rows}")
    if manifest.get("samples") != args.expected_samples:
        errors.append("manifest sample count mismatch")
    if manifest.get("actualRows") != len(rows):
        errors.append("manifest actualRows mismatch")
    if manifest.get("csvSha256") != csv_sha256:
        errors.append("manifest CSV SHA-256 mismatch")
    if manifest.get("samplingMode") != "random_state_uniform_coordinate_v1":
        errors.append("unexpected sampling mode")

    by_id = defaultdict(list)
    for row in rows:
        by_id[row["scramble_id"]].append(row)

    if len(by_id) != args.expected_samples:
        errors.append(f"unique scramble_id count {len(by_id)} != expected {args.expected_samples}")

    state_signature_owner = {}
    duplicate_state_count = 0

    for scramble_id, pair in by_id.items():
        methods = {row["method_id"] for row in pair}
        if len(pair) != 2 or methods != EXPECTED_METHODS:
            errors.append(f"{scramble_id}: invalid paired method block {methods}")

        if any(row["status"] != "ok" for row in pair):
            errors.append(f"{scramble_id}: non-ok solver status")

        first = pair[0]
        for column in STATE_SHARED_COLUMNS:
            if any(row[column] != first[column] for row in pair[1:]):
                errors.append(f"{scramble_id}: paired rows differ in {column}")

        sig = first["state_signature"]
        if len(sig) != 54 or set(sig) - set("URFDLB"):
            errors.append(f"{scramble_id}: invalid state signature alphabet/length")
        counts = Counter(sig)
        if any(counts[face] != 9 for face in "URFDLB"):
            errors.append(f"{scramble_id}: invalid state signature color counts")

        if sig in state_signature_owner:
            duplicate_state_count += 1
            expected_owner = state_signature_owner[sig]
            if first["state_duplicate_of"] != expected_owner:
                errors.append(f"{scramble_id}: duplicate state not linked to {expected_owner}")
        else:
            state_signature_owner[sig] = scramble_id
            if first["state_duplicate_of"]:
                errors.append(f"{scramble_id}: state_duplicate_of set for first occurrence")

        flipped = parse_int(first, "x_flipped_edge_count")
        twisted = parse_int(first, "x_twisted_corner_count")
        cdef = parse_int(first, "x_corner_cycle_deficit")
        edef = parse_int(first, "x_edge_cycle_deficit")
        pdef = parse_int(first, "x_permutation_cycle_deficit")

        if not (0 <= flipped <= 12 and flipped % 2 == 0):
            errors.append(f"{scramble_id}: flipped-edge count outside legal parity/domain")
        if not (0 <= twisted <= 8):
            errors.append(f"{scramble_id}: twisted-corner count outside domain")
        if not (0 <= cdef <= 7 and 0 <= edef <= 11 and pdef == cdef + edef):
            errors.append(f"{scramble_id}: permutation-cycle deficit invariant failed")

        for row in pair:
            length = parse_int(row, "y_solution_length_htm")
            entropy = parse_float(row, "y_move_transition_entropy")
            axis_rate = parse_float(row, "y_axis_change_rate")
            runtime = parse_float(row, "runtime_ms")
            if length < 0:
                errors.append(f"{scramble_id}: negative solution length")
            if not (0 <= entropy <= 1):
                errors.append(f"{scramble_id}: solution entropy outside [0,1]")
            if not (0 <= axis_rate <= 1):
                errors.append(f"{scramble_id}: axis-change rate outside [0,1]")
            if runtime < 0:
                errors.append(f"{scramble_id}: negative runtime")

    method_stats = {}
    for method in sorted(EXPECTED_METHODS):
        subset = [row for row in rows if row["method_id"] == method]
        method_stats[method] = {
            "solution_length_htm": describe(parse_int(row, "y_solution_length_htm") for row in subset),
            "move_transition_entropy": describe(parse_float(row, "y_move_transition_entropy") for row in subset),
            "axis_change_rate": describe(parse_float(row, "y_axis_change_rate") for row in subset),
            "runtime_ms": describe(parse_float(row, "runtime_ms") for row in subset),
        }

    state_rows = [pair[0] for pair in by_id.values()]
    feature_stats = {
        key: describe(parse_int(row, key) for row in state_rows)
        for key in [
            "x_flipped_edge_count",
            "x_twisted_corner_count",
            "x_corner_cycle_deficit",
            "x_edge_cycle_deficit",
            "x_permutation_cycle_deficit",
        ]
    }

    paired_differences = []
    for pair in by_id.values():
        lengths = {row["method_id"]: parse_int(row, "y_solution_length_htm") for row in pair}
        paired_differences.append(lengths["cfop-human-v1"] - lengths["two-phase-cubejs-v1"])

    report = {
        "auditVersion": "1.0.0",
        "status": "PASS" if not errors else "FAIL",
        "csvSha256": csv_sha256,
        "samples": len(by_id),
        "rows": len(rows),
        "duplicateStates": duplicate_state_count,
        "methodStats": method_stats,
        "featureStats": feature_stats,
        "pairedDifferenceCfopMinusTwoPhase": describe(paired_differences),
        "errors": errors,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))

    if errors:
        raise SystemExit(1)

if __name__ == "__main__":
    main()
