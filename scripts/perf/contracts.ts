export const PERF_SCHEMA_VERSION = "1.0" as const;

export const PB_GATE_IDS = [
  "PB-01",
  "PB-02",
  "PB-03",
  "PB-04",
  "PB-05",
  "PB-06",
  "PB-07",
  "PB-08",
  "PB-09",
  "PB-10",
  "PB-11",
  "PB-12",
  "PB-13",
  "PB-14",
  "PB-15",
  "PB-16",
  "PB-17",
  "PB-18",
  "PB-19",
] as const;

export type PbGateId = (typeof PB_GATE_IDS)[number];

export type PerfDecision =
  | "PASS_MEASURED"
  | "FAIL_MEASURED"
  | "HARNESS_READY_TARGET_HOST_REQUIRED"
  | "HARNESS_READY_PHYSICAL_DEVICE_REQUIRED"
  | "NOT_APPLICABLE_TO_THIS_INCREMENT";

export type EvidenceClass =
  | "LOCAL_BASELINE"
  | "CI_MEASURED"
  | "TARGET_HOST"
  | "PHYSICAL_DEVICE";

export type SampleUnit =
  | "milliseconds"
  | "bytes"
  | "count"
  | "ratio"
  | "kibibytes";

export type SampleSummary = Readonly<{
  min: number;
  p50: number;
  p75: number;
  p95: number;
  max: number;
}>;

export type PerfThreshold = Readonly<{
  metric: string;
  operator: "<=" | "==";
  limit: number;
  observed: number;
  unit: SampleUnit;
}>;

export type PerfFailure = Readonly<{
  code: string;
  sampleIndex?: number;
}>;

export type PerfResource = Readonly<{
  url: string;
  category:
    | "ROOT_APPLICATION"
    | "SCANNER_CHUNK"
    | "ONNX_MODEL"
    | "ORT_WASM"
    | "CAMERA_RUNTIME"
    | "CLIENT_SOLVER"
    | "EVALUATOR_PRODUCER"
    | "OTHER";
  resourceType: string;
  encodedBytes: number;
  decodedBytes: number;
  transferBytes: number;
}>;

export type PerfMemory = Readonly<{
  baselineBytes: number;
  peakBytes: number;
  settledBytes: number;
  deltaBytes: number;
  samplingIntervalMs: number;
  processIds: readonly number[];
}>;

export type PerfEnvironment = Readonly<{
  os: string;
  architecture: string;
  node: string;
  pnpm: string;
  browser?: string;
  browserVersion?: string;
  hostClass: string;
  evidenceClass: EvidenceClass;
}>;

export type PerfMeasurement = Readonly<{
  measurementId: string;
  pbGateId: PbGateId;
  scenario: string;
  sampleCount: number;
  warmupCount: number;
  rawSamples: readonly number[];
  units: SampleUnit;
  summary: SampleSummary | null;
  failures: readonly PerfFailure[];
  threshold: readonly PerfThreshold[];
  decision: PerfDecision;
  notes: readonly string[];
  resources?: readonly PerfResource[];
  memory?: PerfMemory;
}>;

export type PerfEvidenceDocument = Readonly<{
  schemaVersion: typeof PERF_SCHEMA_VERSION;
  candidateSha: string;
  artifact: Readonly<{
    buildId: string;
    buildCommand: "pnpm build";
    release: "2026-09-10-rc";
  }>;
  timestamp: string;
  environment: PerfEnvironment;
  measurements: readonly PerfMeasurement[];
}>;

export const PERFORMANCE_BUDGETS = Object.freeze({
  lcpP75Ms: 2_500,
  inpP75Ms: 200,
  clsMax: 0.1,
  rootJsEncodedBytes: 250 * 1024,
  rootJsDecodedBytes: 800 * 1024,
  scannerFetchP95Ms: 15_000,
  scannerReadyP95Ms: 35_000,
  scannerHardDeadlineMs: 45_000,
  scannerWarmReadyP95Ms: 5_000,
  modelBytes: 13 * 1024 * 1024,
  scannerEncodedBytes: 30 * 1024 * 1024,
  inferenceConcurrency: 1,
  inferenceStartsPerSecond: 8,
  tracksEndedMs: 250,
  cleanupMs: 1_000,
  inferenceP95Ms: 500,
  unrecoveredInferenceMs: 2_000,
  solverWarmP95Ms: 2_000,
  solverColdP95Ms: 3_000,
  serviceComputeMs: 8_000,
  serviceTerminalMs: 10_000,
  demand100P95Ms: 50,
  demand1000P95Ms: 250,
  apiMissP95Ms: 3_000,
  apiHitMaxMs: 250,
  apiColdMaxMs: 6_000,
  browserPaintMaxMs: 4_000,
  solverActiveJobs: 2,
  solverQueuedJobs: 8,
  overloadResponseMs: 250,
  cacheEntries: 500,
  cacheTtlMs: 30 * 60 * 1_000,
  browserSettledDeltaBytes: 20 * 1024 * 1024,
  browserPeakBytes: 512 * 1024 * 1024,
  serverPeakRssBytes: 1.5 * 1024 * 1024 * 1024,
  serverSettledDeltaBytes: 50 * 1024 * 1024,
  resourceSettlementMs: 1_000,
});
