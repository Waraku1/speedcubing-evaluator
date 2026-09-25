#!/usr/bin/env python3
import argparse
import csv
import hashlib
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

METHODS = {"cfop-human-v1", "two-phase-cubejs-v1"}
THEORETICAL_COUNTS = {
    0: 1 / 2048,
    2: 66 / 2048,
    4: 495 / 2048,
    6: 924 / 2048,
    8: 495 / 2048,
    10: 66 / 2048,
    12: 1 / 2048,
}
STATE_SHARED = [
    "study_version",
    "sampling_mode",
    "state_id",
    "study_seed",
    "sample_index",
    "eo_vector",
    "x_eo_hamming_weight",
    "state_signature",
    "state_corner_permutation",
    "state_corner_orientation",
    "state_edge_permutation",
    "state_edge_orientation",
    "state_duplicate_of",
    "generator_version",
    "source_commit_sha",
    "execution_commit_sha",
    "created_at_utc",
]

def parity(perm):
    inv = 0
    for i in range(len(perm)):
        for j in range(i + 1, len(perm)):
            inv += perm[i] > perm[j]
    return inv % 2

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--csv", required=True)
    p.add_argument("--manifest", required=True)
    p.add_argument("--expected-samples", type=int, required=True)
    p.add_argument("--out", required=True)
    args = p.parse_args()

    csv_path = Path(args.csv)
    manifest_path = Path(args.manifest)
    out_path = Path(args.out)

    raw = csv_path.read_bytes()
    csv_sha = hashlib.sha256(raw).hexdigest()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    with csv_path.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    expected_rows = args.expected_samples * 2
    errors = []

    if len(rows) != expected_rows:
        errors.append(f"row count {len(rows)} != expected {expected_rows}")
    if manifest.get("samples") != args.expected_samples:
        errors.append("manifest sample count mismatch")
    if manifest.get("actualRows") != len(rows):
        errors.append("manifest actualRows mismatch")
    if manifest.get("csvSha256") != csv_sha:
        errors.append("manifest CSV SHA-256 mismatch")
    if manifest.get("samplingMode") != "direct_uniform_random_state_v1":
        errors.append("unexpected sampling mode")
    if manifest.get("studyVersion") != "4.0.0":
        errors.append("unexpected study version")

    by_state = defaultdict(list)
    for row in rows:
        by_state[row["state_id"]].append(row)

    if len(by_state) != args.expected_samples:
        errors.append(f"unique state_id count {len(by_state)} != expected {args.expected_samples}")

    signatures = {}
    duplicate_states = 0
    observed_weights = Counter()

    for state_id, pair in by_state.items():
        if len(pair) != 2:
            errors.append(f"{state_id}: expected exactly two solver rows")
            continue

        methods = {row["method_id"] for row in pair}
        if methods != METHODS:
            errors.append(f"{state_id}: invalid method pair {methods}")

        first = pair[0]
        for key in STATE_SHARED:
            if pair[1][key] != first[key]:
                errors.append(f"{state_id}: paired rows differ in {key}")

        try:
            cp = json.loads(first["state_corner_permutation"])
            co = json.loads(first["state_corner_orientation"])
            ep = json.loads(first["state_edge_permutation"])
            eo = json.loads(first["state_edge_orientation"])
            eo_vector = json.loads(first["eo_vector"])
            weight = int(first["x_eo_hamming_weight"])
        except Exception as exc:
            errors.append(f"{state_id}: coordinate parse failure: {exc}")
            continue

        if sorted(cp) != list(range(8)):
            errors.append(f"{state_id}: invalid corner permutation")
        if sorted(ep) != list(range(12)):
            errors.append(f"{state_id}: invalid edge permutation")
        if len(co) != 8 or any(v not in (0, 1, 2) for v in co) or sum(co) % 3 != 0:
            errors.append(f"{state_id}: invalid corner orientation")
        if len(eo) != 12 or any(v not in (0, 1) for v in eo) or sum(eo) % 2 != 0:
            errors.append(f"{state_id}: invalid edge orientation")
        if eo_vector != eo:
            errors.append(f"{state_id}: eo_vector differs from stored edge orientation")
        if parity(cp) != parity(ep):
            errors.append(f"{state_id}: permutation parity mismatch")
        if weight != sum(eo):
            errors.append(f"{state_id}: EO Hamming weight mismatch")
        if weight not in THEORETICAL_COUNTS:
            errors.append(f"{state_id}: illegal EO Hamming weight {weight}")

        observed_weights[weight] += 1

        sig = first["state_signature"]
        if len(sig) != 54 or set(sig) - set("URFDLB"):
            errors.append(f"{state_id}: invalid state signature alphabet/length")
        elif any(sig.count(face) != 9 for face in "URFDLB"):
            errors.append(f"{state_id}: invalid state signature color counts")

        if sig in signatures:
            duplicate_states += 1
            expected_owner = signatures[sig]
            if first["state_duplicate_of"] != expected_owner:
                errors.append(f"{state_id}: duplicate provenance mismatch")
        else:
            signatures[sig] = state_id
            if first["state_duplicate_of"]:
                errors.append(f"{state_id}: first occurrence marked as duplicate")

        for row in pair:
            if row["status"] != "ok":
                errors.append(f"{state_id}: solver {row['method_id']} status={row['status']}")
                continue
            try:
                length = int(row["y_solution_length_htm"])
                runtime = float(row["runtime_ms"])
                if length < 0:
                    errors.append(f"{state_id}: negative solution length")
                if not math.isfinite(runtime) or runtime < 0:
                    errors.append(f"{state_id}: invalid runtime")
            except Exception:
                errors.append(f"{state_id}: invalid solver numeric output")

    expected_weight_counts = {
        str(h): args.expected_samples * p
        for h, p in THEORETICAL_COUNTS.items()
    }
    observed_weight_counts = {
        str(h): observed_weights.get(h, 0)
        for h in sorted(THEORETICAL_COUNTS)
    }
    standardized_residuals = {}
    chi_square = 0.0
    for h, prob in THEORETICAL_COUNTS.items():
        expected = args.expected_samples * prob
        observed = observed_weights.get(h, 0)
        chi_square += (observed - expected) ** 2 / expected
        standardized_residuals[str(h)] = (observed - expected) / math.sqrt(expected)

    if sum(observed_weights.values()) != args.expected_samples:
        errors.append("EO-weight observation count mismatch")

    report = {
        "auditVersion": "eo-srs-v1",
        "status": "PASS" if not errors else "FAIL",
        "csvSha256": csv_sha,
        "samples": len(by_state),
        "rows": len(rows),
        "uniqueStateSignatures": len(signatures),
        "duplicateStates": duplicate_states,
        "samplingMode": manifest.get("samplingMode"),
        "observedEOWeightCounts": observed_weight_counts,
        "expectedEOWeightCountsUnderUniformStateSampling": expected_weight_counts,
        "eoWeightStandardizedResiduals": standardized_residuals,
        "eoWeightPearsonChiSquareDiagnostic": chi_square,
        "note": "EO-weight counts are diagnostic only; no quota or exact-count acceptance criterion is applied.",
        "errors": errors,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))

    if errors:
        raise SystemExit(1)

if __name__ == "__main__":
    main()
