import { describe, expect, it } from "vitest";

import { PERFORMANCE_BUDGETS } from "../../scripts/perf/contracts";
import { maxStartsInOneSecond } from "../../scripts/perf/browserBenchmarks";
import {
  createMeasurement,
  evaluateThresholds,
  evidenceDocument,
  localEnvironment,
  validateEvidenceDocument,
} from "../../scripts/perf/evidence";
import {
  PERFORMANCE_FIXTURE_SEED,
  fixedLegalCubeStates,
  fixedSeedScrambles,
  governedTransitions,
} from "../../scripts/perf/fixtures";
import {
  parsePsRss,
  processTreeRows,
  totalRssBytes,
} from "../../scripts/perf/processRss";
import {
  aggregateResources,
  forbiddenRootResources,
  normalizeResource,
  sanitizedResourceUrl,
} from "../../scripts/perf/resources";
import { percentile, summarizeSamples, validatedSamples } from "../../scripts/perf/statistics";

describe("RC performance statistics", () => {
  it("uses deterministic Hyndman-Fan type 7 interpolation", () => {
    expect(percentile([40, 10, 30, 20], 0)).toBe(10);
    expect(percentile([40, 10, 30, 20], 50)).toBe(25);
    expect(percentile([40, 10, 30, 20], 75)).toBe(32.5);
    expect(percentile([40, 10, 30, 20], 95)).toBeCloseTo(38.5);
    expect(summarizeSamples([2])).toEqual({ min: 2, p50: 2, p75: 2, p95: 2, max: 2 });
  });

  it.each([[[]], [[Number.NaN]], [[Number.POSITIVE_INFINITY]], [[-1]]] as const)("rejects invalid samples %j", (samples) => {
    expect(() => validatedSamples(samples)).toThrow();
  });

  it("rejects invalid percentile bounds", () => {
    expect(() => percentile([1], -1)).toThrow(RangeError);
    expect(() => percentile([1], 101)).toThrow(RangeError);
  });
});

describe("RC performance evidence", () => {
  it("evaluates <= and exact thresholds", () => {
    expect(evaluateThresholds([
      { metric: "latency", operator: "<=", limit: 10, observed: 10, unit: "milliseconds" },
      { metric: "pending", operator: "==", limit: 0, observed: 0, unit: "count" },
    ])).toBe(true);
    expect(evaluateThresholds([
      { metric: "latency", operator: "<=", limit: 10, observed: 11, unit: "milliseconds" },
    ])).toBe(false);
  });

  it("derives honest decisions and rejects contradictions", () => {
    const pass = createMeasurement({
      measurementId: "test-pass",
      pbGateId: "PB-04",
      scenario: "synthetic",
      rawSamples: [1, 2],
      units: "bytes",
      threshold: [{ metric: "bytes", operator: "<=", limit: 2, observed: 2, unit: "bytes" }],
    });
    expect(pass.decision).toBe("PASS_MEASURED");
    expect(pass.summary?.p50).toBe(1.5);
    expect(() => createMeasurement({
      measurementId: "bad-pass",
      pbGateId: "PB-04",
      scenario: "synthetic",
      rawSamples: [3],
      units: "bytes",
      threshold: [{ metric: "bytes", operator: "<=", limit: 2, observed: 3, unit: "bytes" }],
      decision: "PASS_MEASURED",
    })).toThrow(/contradicts/);
    expect(() => createMeasurement({
      measurementId: "empty-pass",
      pbGateId: "PB-04",
      scenario: "synthetic",
      units: "bytes",
      decision: "PASS_MEASURED",
    })).toThrow(/raw samples/);
  });

  it("validates complete documents and rejects unknown candidate identity", () => {
    const pending = createMeasurement({
      measurementId: "target-pending",
      pbGateId: "PB-01",
      scenario: "target",
      units: "milliseconds",
      decision: "HARNESS_READY_TARGET_HOST_REQUIRED",
    });
    const document = evidenceDocument(localEnvironment(), [pending]);
    expect(() => validateEvidenceDocument(document)).not.toThrow();
    expect(() => validateEvidenceDocument({ ...document, candidateSha: "private/path" })).toThrow();
  });
});

describe("deterministic performance fixtures", () => {
  it("repeats the fixed generator without adjacent equal faces", () => {
    expect(PERFORMANCE_FIXTURE_SEED).toBe(0x51f15e);
    const first = fixedSeedScrambles(3);
    expect(fixedSeedScrambles(3)).toEqual(first);
    for (const scramble of first) {
      expect(scramble).toHaveLength(18);
      expect(scramble.every((move, index) => index === 0 || move[0] !== scramble[index - 1][0])).toBe(true);
    }
  });

  it("creates unique legal cube states and governed Transition objects", () => {
    const states = fixedLegalCubeStates(100);
    expect(new Set(states.map((state) => state.stateId)).size).toBe(100);
    expect(governedTransitions(1_000)).toHaveLength(1_000);
    expect(governedTransitions(1)[0]).toEqual(expect.objectContaining({ before: expect.any(Object), move: expect.any(String), after: expect.any(Object) }));
  });
});

describe("resource and HAR aggregation", () => {
  const observation = (url: string, responseBody?: string) => normalizeResource({
    url,
    resourceType: "script",
    encodedBytes: 100,
    decodedBytes: 200,
    transferBytes: 120,
    responseBody,
  });

  it("classifies fetched resource content and aggregates browser transfer sizes", () => {
    const resources = [
      observation("https://host/_next/static/chunks/root.js", "application shell"),
      observation("https://host/_next/static/chunks/scanner.js", "scannerWorkerV1 LOAD_MODEL"),
      observation("https://host/models/cube_pose.284726d2638cc8ba.onnx"),
      observation("https://host/ort-wasm-simd-threaded.wasm"),
      observation("https://host/_next/static/chunks/solver.js", "CubeJsSolverV1"),
      observation("https://host/_next/static/chunks/evaluator.js", "EvaluatorPipeline"),
    ];
    expect(resources.map((resource) => resource.category)).toEqual([
      "ROOT_APPLICATION", "SCANNER_CHUNK", "ONNX_MODEL", "ORT_WASM", "CLIENT_SOLVER", "EVALUATOR_PRODUCER",
    ]);
    expect(aggregateResources(resources)).toEqual({ count: 6, encodedBytes: 600, decodedBytes: 1_200, transferBytes: 720 });
    expect(forbiddenRootResources(resources)).toHaveLength(5);
  });

  it("rejects invalid browser sizes", () => {
    expect(() => normalizeResource({
      url: "https://host/a.js",
      resourceType: "script",
      encodedBytes: -1,
      decodedBytes: 1,
      transferBytes: 1,
    })).toThrow();
  });

  it("removes credentials, query strings, and fragments from evidence URLs", () => {
    expect(sanitizedResourceUrl("https://user:secret@host/model.onnx?token=private#part")).toBe(
      "https://host/model.onnx"
    );
    expect(sanitizedResourceUrl("/chunk.js?token=private")).toBe("/chunk.js");
  });

  it("computes the maximum rolling one-second inference-start window", () => {
    expect(maxStartsInOneSecond([])).toBe(0);
    expect(maxStartsInOneSecond([0, 100, 200, 999, 1_000, 1_100])).toBe(4);
  });
});

describe("server PID and RSS parsing", () => {
  it("selects only the exact process tree and totals KiB as bytes", () => {
    const rows = parsePsRss("100 1 10 pnpm start\n101 100 20 next-server\n102 101 30 worker\n999 1 999 browser\n");
    const tree = processTreeRows(rows, 100);
    expect(tree.map((row) => row.pid)).toEqual([100, 101, 102]);
    expect(totalRssBytes(tree)).toBe(60 * 1024);
  });

  it("preserves the authoritative memory budgets", () => {
    expect(PERFORMANCE_BUDGETS.serverPeakRssBytes).toBe(1.5 * 1024 * 1024 * 1024);
    expect(PERFORMANCE_BUDGETS.serverSettledDeltaBytes).toBe(50 * 1024 * 1024);
  });
});
