import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  PB_GATE_IDS,
  PERF_SCHEMA_VERSION,
  type EvidenceClass,
  type PerfDecision,
  type PerfEnvironment,
  type PerfEvidenceDocument,
  type PerfFailure,
  type PerfMeasurement,
  type PerfResource,
  type PerfThreshold,
  type PbGateId,
  type SampleUnit,
} from "./contracts";
import { summarizeSamples } from "./statistics";

const DECISIONS = new Set<PerfDecision>([
  "PASS_MEASURED",
  "FAIL_MEASURED",
  "HARNESS_READY_TARGET_HOST_REQUIRED",
  "HARNESS_READY_PHYSICAL_DEVICE_REQUIRED",
  "NOT_APPLICABLE_TO_THIS_INCREMENT",
]);

export type MeasurementInput = Readonly<{
  measurementId: string;
  pbGateId: PbGateId;
  scenario: string;
  rawSamples?: readonly number[];
  units: SampleUnit;
  warmupCount?: number;
  failures?: readonly PerfFailure[];
  threshold?: readonly PerfThreshold[];
  decision?: PerfDecision;
  notes?: readonly string[];
  resources?: readonly PerfResource[];
  memory?: PerfMeasurement["memory"];
}>;

export function evaluateThresholds(
  thresholds: readonly PerfThreshold[]
): boolean {
  return thresholds.every((threshold) =>
    threshold.operator === "<="
      ? threshold.observed <= threshold.limit
      : threshold.observed === threshold.limit
  );
}

export function createMeasurement(input: MeasurementInput): PerfMeasurement {
  const rawSamples = [...(input.rawSamples ?? [])];
  const failures = [...(input.failures ?? [])];
  const threshold = [...(input.threshold ?? [])];
  const decision =
    input.decision ??
    (failures.length === 0 && evaluateThresholds(threshold)
      ? "PASS_MEASURED"
      : "FAIL_MEASURED");

  if (!PB_GATE_IDS.includes(input.pbGateId)) {
    throw new TypeError("Unknown PB gate ID.");
  }
  if (!DECISIONS.has(decision)) {
    throw new TypeError("Unknown performance decision.");
  }
  if (!input.measurementId || !input.scenario) {
    throw new TypeError("Measurement identity and scenario are required.");
  }
  if (
    (decision === "PASS_MEASURED" || decision === "FAIL_MEASURED") &&
    rawSamples.length === 0
  ) {
    throw new TypeError("Measured decisions require raw samples.");
  }
  if (
    decision === "PASS_MEASURED" &&
    (failures.length > 0 || !evaluateThresholds(threshold))
  ) {
    throw new TypeError("PASS_MEASURED contradicts failures or thresholds.");
  }
  if (
    decision === "FAIL_MEASURED" &&
    failures.length === 0 &&
    evaluateThresholds(threshold)
  ) {
    throw new TypeError("FAIL_MEASURED requires a failure or failed threshold.");
  }

  return Object.freeze({
    measurementId: input.measurementId,
    pbGateId: input.pbGateId,
    scenario: input.scenario,
    sampleCount: rawSamples.length,
    warmupCount: input.warmupCount ?? 0,
    rawSamples: Object.freeze(rawSamples),
    units: input.units,
    summary: rawSamples.length > 0 ? summarizeSamples(rawSamples) : null,
    failures: Object.freeze(failures),
    threshold: Object.freeze(threshold),
    decision,
    notes: Object.freeze([...(input.notes ?? [])]),
    ...(input.resources ? { resources: Object.freeze([...input.resources]) } : {}),
    ...(input.memory ? { memory: Object.freeze(input.memory) } : {}),
  });
}

function commandOutput(command: string, args: readonly string[]): string {
  try {
    return execFileSync(command, [...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

export function localEnvironment(
  evidenceClass: EvidenceClass = "LOCAL_BASELINE",
  overrides: Partial<PerfEnvironment> = {}
): PerfEnvironment {
  return Object.freeze({
    os: `${os.platform()} ${os.release()}`,
    architecture: os.arch(),
    node: process.version,
    pnpm: commandOutput("pnpm", ["--version"]),
    hostClass: evidenceClass === "TARGET_HOST" ? "configured-target-host" : "local-workstation",
    evidenceClass,
    ...overrides,
  });
}

export function evidenceDocument(
  environment: PerfEnvironment,
  measurements: readonly PerfMeasurement[]
): PerfEvidenceDocument {
  const candidateSha = commandOutput("git", ["rev-parse", "HEAD"]);
  let buildId = "not-built";
  try {
    buildId = readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    // Node-only benchmarks remain reproducible even when no browser artifact exists.
  }

  return Object.freeze({
    schemaVersion: PERF_SCHEMA_VERSION,
    candidateSha,
    artifact: Object.freeze({
      buildId,
      buildCommand: "pnpm build" as const,
      release: "2026-09-10-rc" as const,
    }),
    timestamp: new Date().toISOString(),
    environment,
    measurements: Object.freeze([...measurements]),
  });
}

export function validateEvidenceDocument(value: unknown): asserts value is PerfEvidenceDocument {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Evidence must be an object.");
  }
  const record = value as Partial<PerfEvidenceDocument>;
  if (
    record.schemaVersion !== PERF_SCHEMA_VERSION ||
    typeof record.candidateSha !== "string" ||
    !/^[0-9a-f]{40}$/i.test(record.candidateSha) ||
    typeof record.timestamp !== "string" ||
    !record.environment ||
    !Array.isArray(record.measurements)
  ) {
    throw new TypeError("Invalid performance evidence document.");
  }
  for (const measurement of record.measurements) {
    if (
      !PB_GATE_IDS.includes(measurement.pbGateId) ||
      !DECISIONS.has(measurement.decision) ||
      measurement.sampleCount !== measurement.rawSamples.length
    ) {
      throw new TypeError("Invalid performance measurement.");
    }
  }
}

export function writeEvidence(
  label: string,
  environment: PerfEnvironment,
  measurements: readonly PerfMeasurement[],
  evidenceDirectory = process.env.PERF_EVIDENCE_DIR ?? "artifacts/rc-evidence"
): string {
  const document = evidenceDocument(environment, measurements);
  validateEvidenceDocument(document);
  const safeLabel = label.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const stamp = document.timestamp.replace(/[:.]/g, "-");
  const absoluteDirectory = path.resolve(evidenceDirectory);
  mkdirSync(absoluteDirectory, { recursive: true });
  const outputPath = path.join(absoluteDirectory, `${stamp}-${safeLabel}.json`);
  writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return outputPath;
}

export function printSummary(pathname: string, measurements: readonly PerfMeasurement[]): void {
  for (const measurement of measurements) {
    const summary = measurement.summary;
    const distribution = summary
      ? `p50=${summary.p50.toFixed(2)} p75=${summary.p75.toFixed(2)} p95=${summary.p95.toFixed(2)} max=${summary.max.toFixed(2)} ${measurement.units}`
      : "no local samples";
    console.log(`${measurement.pbGateId} ${measurement.measurementId}: ${measurement.decision}; ${distribution}`);
  }
  console.log(`Evidence: ${pathname}`);
}

export function exitCodeFor(measurements: readonly PerfMeasurement[]): number {
  return measurements.some((measurement) => measurement.decision === "FAIL_MEASURED") ? 1 : 0;
}
