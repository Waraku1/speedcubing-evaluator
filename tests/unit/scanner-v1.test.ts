import { describe, expect, it } from "vitest";

import { classifyColorHSV } from "../../src/lib/detect/colorUtils";
import {
  SCAN_POSE_V1,
  SCAN_REVIEW_NET_V1,
  applyScanPoseMappingV1,
  combineCanonicalPoseCapturesV1,
  validateAndMapPoseCaptureV1,
} from "../../src/lib/detect/scanPoseV1";
import { aggregateScannerSamplesV1 } from "../../src/lib/detect/scannerAggregationV1";
import { scannerPointToDisplayPointV1 } from "../../src/lib/detect/scannerDisplayV1";
import {
  isScannerWorkerInboundV1,
  isScannerWorkerOutboundV1,
} from "../../src/lib/detect/scannerMessagesV1";
import {
  SCANNER_MODEL_V1,
  SCANNER_RUNTIME_LIMITS_V1,
} from "../../src/lib/detect/scannerRuntimeV1";
import {
  generateRawGridPointsV1,
  isValidPoseGeometryV1,
  type CubePoseV1,
} from "../../src/lib/detect/visionOnnx";
import {
  createEmptyCubeDraftV1,
  createSolvedCubeDraftV1,
  serializeCubeDraftV1,
  updateCubeDraftTokenV1,
  type CubeDraftTokenV1,
} from "../../src/lib/ui/cubeDraftV1";
import {
  SCANNER_DRAFT_HANDOFF_STORAGE_KEY_V1,
  consumeScannerDraftHandoffV1,
  createScannerDraftHandoffV1,
  parseScannerDraftHandoffV1,
  serializeScannerDraftHandoffV1,
  writeScannerDraftHandoffV1,
} from "../../src/lib/ui/scannerDraftHandoffV1";
import {
  createInitialWorkbenchStateV1,
  workbenchReducerV1,
} from "../../src/lib/ui/workbenchStateV1";

const pose1Solved = Object.freeze({
  top: Object.freeze(Array<CubeDraftTokenV1>(9).fill("U")),
  left: Object.freeze(Array<CubeDraftTokenV1>(9).fill("R")),
  right: Object.freeze(Array<CubeDraftTokenV1>(9).fill("B")),
});

const pose2Solved = Object.freeze({
  top: Object.freeze(Array<CubeDraftTokenV1>(9).fill("D")),
  left: Object.freeze(Array<CubeDraftTokenV1>(9).fill("F")),
  right: Object.freeze(Array<CubeDraftTokenV1>(9).fill("L")),
});

describe("C5 scanner geometry and color consistency", () => {
  it("GC-01 validates physical centers before canonical center mapping", () => {
    const first = validateAndMapPoseCaptureV1(1, pose1Solved);
    const second = validateAndMapPoseCaptureV1(2, pose2Solved);

    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true });
    expect(validateAndMapPoseCaptureV1(1, { ...pose1Solved, right: Array(9).fill("R") })).toEqual({
      ok: false,
      reason: "Expected the B center in the right guide.",
    });
  });

  it("GC-02 / SC-11 maps the physical URB corner to U2, R2, B0", () => {
    const raw = {
      top: Array.from({ length: 9 }, (_, index) => `top-${index}`),
      left: Array.from({ length: 9 }, (_, index) => `left-${index}`),
      right: Array.from({ length: 9 }, (_, index) => `right-${index}`),
    };
    const mapped = applyScanPoseMappingV1(1, raw);

    expect(mapped.U?.[2]).toBe("top-6");
    expect(mapped.R?.[2]).toBe("left-2");
    expect(mapped.B?.[0]).toBe("right-0");
    expect(mapped.B?.[8]).toBe("right-8");
    expect(mapped.B?.[0]).not.toBe("right-8");
  });

  it("GC-03 applies the exact Pose 2 top and 180-degree side mappings", () => {
    const raw = {
      top: Array.from({ length: 9 }, (_, index) => `top-${index}`),
      left: Array.from({ length: 9 }, (_, index) => `left-${index}`),
      right: Array.from({ length: 9 }, (_, index) => `right-${index}`),
    };
    const mapped = applyScanPoseMappingV1(2, raw);

    expect(mapped.D).toEqual([
      "top-6", "top-3", "top-0",
      "top-7", "top-4", "top-1",
      "top-8", "top-5", "top-2",
    ]);
    expect(mapped.F?.[0]).toBe("left-8");
    expect(mapped.F?.[8]).toBe("left-0");
    expect(mapped.L?.[0]).toBe("right-8");
    expect(mapped.L?.[8]).toBe("right-0");
  });

  it("GC-04 preserves physical display coordinates without mirroring", () => {
    expect(scannerPointToDisplayPointV1({ x: 0.17, y: 0.62 })).toEqual({
      x: 0.17,
      y: 0.62,
    });
  });

  it("GC-05 keeps every canonical face in outside-view orientation", () => {
    expect(SCAN_POSE_V1[1].map((binding) => binding.sourceIndexes)).toEqual([
      [8, 7, 6, 5, 4, 3, 2, 1, 0],
      [0, 1, 2, 3, 4, 5, 6, 7, 8],
      [0, 1, 2, 3, 4, 5, 6, 7, 8],
    ]);
    expect(SCAN_POSE_V1[2].map((binding) => binding.sourceIndexes)).toEqual([
      [6, 3, 0, 7, 4, 1, 8, 5, 2],
      [8, 7, 6, 5, 4, 3, 2, 1, 0],
      [8, 7, 6, 5, 4, 3, 2, 1, 0],
    ]);
  });

  it("GC-06 defines the canonical U / L F R B / D review adjacency", () => {
    expect(SCAN_REVIEW_NET_V1).toEqual({
      U: { column: 2, row: 1 },
      L: { column: 1, row: 2 },
      F: { column: 2, row: 2 },
      R: { column: 3, row: 2 },
      B: { column: 4, row: 2 },
      D: { column: 2, row: 3 },
    });
  });

  it("GC-07 never converts dark, invalid, or unknown evidence to U", () => {
    expect(classifyColorHSV({ h: 0, s: 0, v: 0.1 })).toBe("N");
    expect(classifyColorHSV({ h: Number.NaN, s: 0, v: 1 })).toBe("N");
    expect(
      aggregateScannerSamplesV1([
        Array(27).fill("N"),
        Array(27).fill("not-a-token"),
        Array(27).fill("U"),
      ])[0]
    ).toBe("N");
  });

  it("GC-08 returns N for ties and for evidence without a strict majority", () => {
    const sample = (token: string) => Array(27).fill(token);
    expect(aggregateScannerSamplesV1([sample("R"), sample("B")])[0]).toBe("N");
    expect(
      aggregateScannerSamplesV1([
        sample("R"),
        sample("R"),
        sample("N"),
        sample("N"),
        sample("B"),
      ])[0]
    ).toBe("N");
    expect(
      aggregateScannerSamplesV1([
        sample("R"),
        sample("R"),
        sample("R"),
        sample("N"),
        sample("B"),
      ])[0]
    ).toBe("R");
  });

  it("GC-09 supports manual correction back to explicit N while fixing centers", () => {
    const empty = createEmptyCubeDraftV1();
    const known = updateCubeDraftTokenV1(empty, 0, "R");
    const unknown = updateCubeDraftTokenV1(known, 0, "N");

    expect(unknown[0]).toBe("N");
    expect(updateCubeDraftTokenV1(unknown, 4, "N")).toBe(unknown);
  });

  it("GC-10 serializes the combined draft in exact URFDLB order", () => {
    const first = validateAndMapPoseCaptureV1(1, pose1Solved);
    const second = validateAndMapPoseCaptureV1(2, pose2Solved);
    if (!first.ok || !second.ok) throw new Error("fixture mapping failed");

    expect(
      serializeCubeDraftV1(combineCanonicalPoseCapturesV1(first.faces, second.faces))
    ).toBe("UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB");
  });

  it("rejects invalid/degenerate geometry before sampling", () => {
    const valid: CubePoseV1 = {
      center: { x: 0.5, y: 0.5 },
      top: { x: 0.5, y: 0.08 },
      rightUp: { x: 0.9, y: 0.28 },
      rightDown: { x: 0.9, y: 0.72 },
      bottom: { x: 0.5, y: 0.92 },
      leftDown: { x: 0.1, y: 0.72 },
      leftUp: { x: 0.1, y: 0.28 },
    };
    expect(isValidPoseGeometryV1(valid)).toBe(true);
    expect(generateRawGridPointsV1(valid)).toHaveLength(27);
    expect(
      isValidPoseGeometryV1({ ...valid, center: { x: Number.NaN, y: 0.5 } })
    ).toBe(false);
    expect(
      isValidPoseGeometryV1({
        center: { x: 0.5, y: 0.5 },
        top: { x: 0.5, y: 0.5 },
        rightUp: { x: 0.5, y: 0.5 },
        rightDown: { x: 0.5, y: 0.5 },
        bottom: { x: 0.5, y: 0.5 },
        leftDown: { x: 0.5, y: 0.5 },
        leftUp: { x: 0.5, y: 0.5 },
      })
    ).toBe(false);
  });
});

describe("C5 scanner handoff and runtime bounds", () => {
  it("keeps worker messages closed and rejects added or invalid fields", () => {
    expect(
      isScannerWorkerInboundV1({
        type: "LOAD_MODEL",
        generation: 1,
        modelUrl: "/models/cube_pose.284726d2638cc8ba.onnx",
      })
    ).toBe(true);
    expect(
      isScannerWorkerInboundV1({
        type: "LOAD_MODEL",
        generation: 1,
        modelUrl: "/cube_pose.onnx",
      })
    ).toBe(false);
    expect(
      isScannerWorkerOutboundV1({
        type: "MODEL_READY",
        generation: 1,
        payload: "not allowed",
      })
    ).toBe(false);
    expect(
      isScannerWorkerOutboundV1({
        type: "NO_DETECTION",
        generation: 1,
        requestId: 1,
        durationMs: Number.NaN,
      })
    ).toBe(false);
  });

  it("PB-08 / PB-09 binds the content-addressed model and scheduler ceilings", () => {
    expect(SCANNER_MODEL_V1).toEqual({
      url: "/models/cube_pose.284726d2638cc8ba.onnx",
      sha256: "284726d2638cc8ba56dbcdb8b56109e26fcd362c689e5571c6e8b0846190af7e",
      bytes: 12_770_043,
    });
    expect(SCANNER_MODEL_V1.bytes).toBeLessThanOrEqual(13 * 1024 * 1024);
    expect(SCANNER_RUNTIME_LIMITS_V1.minimumInferenceIntervalMs).toBe(125);
    expect(1000 / SCANNER_RUNTIME_LIMITS_V1.minimumInferenceIntervalMs).toBe(8);
    expect(SCANNER_RUNTIME_LIMITS_V1.inferenceTimeoutMs).toBe(2_000);
  });

  it("SC-13 accepts only the exact reviewed, bounded handoff schema", () => {
    const handoff = createScannerDraftHandoffV1(createSolvedCubeDraftV1());
    const serialized = serializeScannerDraftHandoffV1(handoff);

    expect(Object.keys(handoff)).toEqual([
      "schemaId",
      "schemaVersion",
      "format",
      "mappingVersion",
      "source",
      "tokens",
      "reviewed",
    ]);
    expect(parseScannerDraftHandoffV1(serialized)).toEqual(handoff);
    expect(
      parseScannerDraftHandoffV1(
        JSON.stringify({ ...handoff, unexpected: "rejected" })
      )
    ).toBeNull();
    expect(parseScannerDraftHandoffV1("x".repeat(1025))).toBeNull();
    expect(
      parseScannerDraftHandoffV1(
        JSON.stringify({ ...handoff, reviewed: false })
      )
    ).toBeNull();
  });

  it("SC-13 deletes a handoff before validation and cannot replay it", () => {
    const values = new Map<string, string>();
    const events: string[] = [];
    const storage = {
      getItem(key: string) {
        events.push("get");
        return values.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        events.push("set");
        values.set(key, value);
      },
      removeItem(key: string) {
        events.push("remove");
        values.delete(key);
      },
    };
    writeScannerDraftHandoffV1(storage, createSolvedCubeDraftV1());
    expect(values.has(SCANNER_DRAFT_HANDOFF_STORAGE_KEY_V1)).toBe(true);

    expect(consumeScannerDraftHandoffV1(storage)).toEqual(createSolvedCubeDraftV1());
    expect(events).toEqual(["set", "get", "remove"]);
    expect(consumeScannerDraftHandoffV1(storage)).toBeNull();
  });

  it("SC-13 imports into the ordinary manual state without submitting", () => {
    const initial = createInitialWorkbenchStateV1();
    const imported = workbenchReducerV1(initial, {
      type: "IMPORT_SCANNER_DRAFT",
      draft: createSolvedCubeDraftV1(),
    });

    expect(imported.phase).toBe("READY");
    expect(imported.requestEpoch).toBe(1);
    expect(imported.result).toBeNull();
    expect(imported.error).toBeNull();
    expect(imported.acquisitionMessage).toContain("Confirm or correct");
  });
});
