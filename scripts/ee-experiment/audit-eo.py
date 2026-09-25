#!/usr/bin/env python3
import argparse
import csv
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

METHODS = {"cfop-human-v1", "two-phase-cubejs-v1"}
EXPECTED_PER_BLOCK = {0: 1, 2: 66, 4: 495, 6: 924, 8: 495, 10: 66, 12: 1}

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--csv", required=True)
    p.add_argument("--manifest", required=True)
    p.add_argument("--blocks", type=int, required=True)
    p.add_argument("--out", required=True)
    args = p.parse_args()

    csv_path = Path(args.csv)
    manifest_path = Path(args.manifest)
    raw = csv_path.read_bytes()
    csv_sha = hashlib.sha256(raw).hexdigest()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    with csv_path.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    errors = []
    expected_states = 2048 * args.blocks
    expected_rows = expected_states * 2

    if len(rows) != expected_rows:
        errors.append(f"row count {len(rows)} != {expected_rows}")
    if manifest.get("states") != expected_states:
        errors.append("manifest state count mismatch")
    if manifest.get("actualRows") != len(rows):
        errors.append("manifest row count mismatch")
    if manifest.get("failedRows") != 0:
        errors.append("manifest reports solver failures")
    if manifest.get("csvSha256") != csv_sha:
        errors.append("CSV SHA-256 mismatch")
    if manifest.get("samplingMode") != "eo_complete_enumeration_2x_v1":
        errors.append("unexpected sampling mode")

    by_state = defaultdict(list)
    for row in rows:
        by_state[row["state_id"]].append(row)

    if len(by_state) != expected_states:
        errors.append(f"unique state count {len(by_state)} != {expected_states}")

    block_eo = defaultdict(set)
    block_weight_counts = defaultdict(Counter)
    signatures = {}

    for state_id, pair in by_state.items():
        if len(pair) != 2:
            errors.append(f"{state_id}: expected 2 solver rows")
            continue
        methods = {r["method_id"] for r in pair}
        if methods != METHODS:
            errors.append(f"{state_id}: method pairing mismatch {methods}")
        if any(r["status"] != "ok" for r in pair):
            errors.append(f"{state_id}: non-ok solver row")

        first = pair[0]
        block = int(first["block_index"])
        eo_index = int(first["eo_index"])
        weight = int(first["x_eo_hamming_weight"])
        eo = json.loads(first["eo_vector"])

        for key in [
            "block_index", "eo_index", "eo_vector", "x_eo_hamming_weight",
            "state_signature", "state_corner_permutation", "state_corner_orientation",
            "state_edge_permutation", "state_edge_orientation", "state_duplicate_of",
        ]:
            if pair[1][key] != first[key]:
                errors.append(f"{state_id}: paired rows differ in {key}")

        if not (0 <= eo_index < 2048):
            errors.append(f"{state_id}: EO index outside [0,2047]")
        if len(eo) != 12 or any(x not in (0, 1) for x in eo):
            errors.append(f"{state_id}: invalid EO vector")
        elif sum(eo) % 2 != 0:
            errors.append(f"{state_id}: EO parity invalid")
        elif sum(eo) != weight:
            errors.append(f"{state_id}: EO Hamming weight mismatch")

        block_eo[block].add(tuple(eo))
        block_weight_counts[block][weight] += 1

        sig = first["state_signature"]
        if len(sig) != 54 or set(sig) - set("URFDLB"):
            errors.append(f"{state_id}: invalid state signature")
        if any(sig.count(face) != 9 for face in "URFDLB"):
            errors.append(f"{state_id}: invalid facelet color counts")

        if sig in signatures:
            expected_owner = signatures[sig]
            if first["state_duplicate_of"] != expected_owner:
                errors.append(f"{state_id}: duplicate state provenance mismatch")
        else:
            signatures[sig] = state_id
            if first["state_duplicate_of"]:
                errors.append(f"{state_id}: unexpected duplicate marker")

        for r in pair:
            try:
                length = int(r["y_solution_length_htm"])
                runtime = float(r["runtime_ms"])
                if length < 0:
                    errors.append(f"{state_id}: negative solution length")
                if runtime < 0:
                    errors.append(f"{state_id}: negative runtime")
            except Exception:
                errors.append(f"{state_id}: invalid numeric solver output")

    for block in range(args.blocks):
        if len(block_eo[block]) != 2048:
            errors.append(f"block {block}: unique EO vectors {len(block_eo[block])} != 2048")
        actual = dict(sorted(block_weight_counts[block].items()))
        if actual != EXPECTED_PER_BLOCK:
            errors.append(f"block {block}: weight distribution {actual} != {EXPECTED_PER_BLOCK}")

    report = {
        "auditVersion": "eo-v1",
        "status": "PASS" if not errors else "FAIL",
        "csvSha256": csv_sha,
        "blocks": args.blocks,
        "states": len(by_state),
        "rows": len(rows),
        "uniqueStateSignatures": len(signatures),
        "blockWeightCounts": {str(k): dict(sorted(v.items())) for k, v in block_weight_counts.items()},
        "errors": errors,
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    if errors:
        raise SystemExit(1)

if __name__ == "__main__":
    main()
