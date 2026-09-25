import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import Cube from "cubejs";

import {
  SOLVED_STATE,
  applyMoves,
  parseMoveString,
  type Move,
} from "../../src/lib/cube/moves";

import {
  solveCFOPState,
  verifySolveResult,
} from "../../src/lib/cfop-solver/cfop-solver";

import {
  generateRandomState,
} from "../../src/lib/ee-experiment/random-state";

const STUDY_VERSION = "4.0.0";
const SAMPLING_MODE = "direct_uniform_random_state_v1";
const GENERATOR_VERSION = "random-state-sha256-coordinate-v1";

type Args = {
  samples: number;
  seed: string;
  out: string;
};

type MethodId = "cfop-human-v1" | "two-phase-cubejs-v1";

type MethodResult = {
  solution: Move[];
  runtimeMs: number;
  verified: boolean;
  error: string;
};

function parseArgs(argv: string[]): Args {
  const result: Args = {
    samples: 20480,
    seed: "EE-2026-EO-SRS-MAIN-01",
    out: "research/ee-experiment/output/main-eo-srs-20480.csv",
  };

  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--samples") result.samples = Number(value);
    if (key === "--seed") result.seed = value;
    if (key === "--out") result.out = value;
  }

  if (!Number.isInteger(result.samples) || result.samples <= 0) {
    throw new Error("samples must be a positive integer");
  }
  if (!result.seed) throw new Error("seed must be non-empty");
  if (!result.out) throw new Error("out must be non-empty");

  return result;
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function gitSha(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unrecorded";
  }
}

function eoHammingWeight(eo: readonly number[]): number {
  return eo.reduce((sum, value) => sum + value, 0);
}

let cubeJsInitialized = false;

function ensureCubeJsSolver(): void {
  if (cubeJsInitialized) return;
  Cube.initSolver();
  cubeJsInitialized = true;
}

function solveTwoPhase(state: string): MethodResult {
  try {
    ensureCubeJsSolver();
    const start = performance.now();
    const raw = Cube.fromString(state).solve();
    const runtimeMs = performance.now() - start;
    const solution = parseMoveString(raw);
    const verified = applyMoves(state, solution) === SOLVED_STATE;

    return {
      solution,
      runtimeMs,
      verified,
      error: verified ? "" : "solution replay verification failed",
    };
  } catch (cause) {
    return {
      solution: [],
      runtimeMs: 0,
      verified: false,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

function solveHumanCFOP(state: string): MethodResult {
  try {
    const start = performance.now();
    const result = solveCFOPState(state);
    const runtimeMs = performance.now() - start;
    const verified = verifySolveResult(result);

    return {
      solution: [...result.solution],
      runtimeMs,
      verified,
      error: verified ? "" : "solution replay verification failed",
    };
  } catch (cause) {
    return {
      solution: [],
      runtimeMs: 0,
      verified: false,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

const args = parseArgs(process.argv.slice(2));
const createdAt = new Date().toISOString();
const executionCommitSha = gitSha();
const sourceCommitSha = process.env.EE_SOURCE_COMMIT_SHA?.trim() || executionCommitSha;

const columns = [
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
  "method_id",
  "method_version",
  "solution_moves",
  "y_solution_length_htm",
  "status",
  "error",
  "runtime_ms",
  "generator_version",
  "source_commit_sha",
  "execution_commit_sha",
  "created_at_utc",
];

const rows: Record<string, unknown>[] = [];
const firstIdByState = new Map<string, string>();
const eoWeightCounts = new Map<number, number>();

for (let index = 0; index < args.samples; index++) {
  const generated = generateRandomState(args.seed, index);
  const regenerated = generateRandomState(args.seed, index);

  if (
    regenerated.stateSignature !== generated.stateSignature ||
    JSON.stringify(regenerated.coordinates) !== JSON.stringify(generated.coordinates)
  ) {
    throw new Error(`deterministic regeneration failed at sample ${index}`);
  }

  const { cp, co, ep, eo } = generated.coordinates;
  const state = generated.stateSignature;
  const weight = eoHammingWeight(eo);
  const stateId = `${args.seed}-${String(index + 1).padStart(5, "0")}`;

  if (weight < 0 || weight > 12 || weight % 2 !== 0) {
    throw new Error(`illegal EO Hamming weight ${weight} at sample ${index}`);
  }

  eoWeightCounts.set(weight, (eoWeightCounts.get(weight) ?? 0) + 1);

  const duplicateOf = firstIdByState.get(state) ?? "";
  if (!duplicateOf) firstIdByState.set(state, stateId);

  const cfop = solveHumanCFOP(state);
  const twoPhase = solveTwoPhase(state);

  const methods: Array<{
    methodId: MethodId;
    methodVersion: string;
    result: MethodResult;
  }> = [
    {
      methodId: "cfop-human-v1",
      methodVersion: "repository-cfop-state-v1",
      result: cfop,
    },
    {
      methodId: "two-phase-cubejs-v1",
      methodVersion: "cubejs-1.3.2",
      result: twoPhase,
    },
  ];

  for (const method of methods) {
    rows.push({
      study_version: STUDY_VERSION,
      sampling_mode: SAMPLING_MODE,
      state_id: stateId,
      study_seed: args.seed,
      sample_index: index,
      eo_vector: JSON.stringify(eo),
      x_eo_hamming_weight: weight,
      state_signature: state,
      state_corner_permutation: JSON.stringify(cp),
      state_corner_orientation: JSON.stringify(co),
      state_edge_permutation: JSON.stringify(ep),
      state_edge_orientation: JSON.stringify(eo),
      state_duplicate_of: duplicateOf,
      method_id: method.methodId,
      method_version: method.methodVersion,
      solution_moves: method.result.solution.join(" "),
      y_solution_length_htm: method.result.verified ? method.result.solution.length : "",
      status: method.result.verified ? "ok" : "error",
      error: method.result.error,
      runtime_ms: method.result.runtimeMs,
      generator_version: GENERATOR_VERSION,
      source_commit_sha: sourceCommitSha,
      execution_commit_sha: executionCommitSha,
      created_at_utc: createdAt,
    });
  }

  if ((index + 1) % 1000 === 0 || index + 1 === args.samples) {
    console.log(`generated ${index + 1}/${args.samples} states`);
  }
}

const expectedRows = args.samples * 2;
if (rows.length !== expectedRows) {
  throw new Error(`row count invariant failed: ${rows.length}/${expectedRows}`);
}

const outPath = resolve(args.out);
mkdirSync(dirname(outPath), { recursive: true });

const csv = [
  columns.join(","),
  ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
].join("\n") + "\n";

writeFileSync(outPath, csv, "utf8");
const csvSha256 = createHash("sha256").update(csv, "utf8").digest("hex");

const failures = rows.filter((row) => row.status !== "ok");

const manifest = {
  studyVersion: STUDY_VERSION,
  samplingMode: SAMPLING_MODE,
  generatedAtUtc: createdAt,
  studySeed: args.seed,
  samples: args.samples,
  expectedRows,
  actualRows: rows.length,
  okRows: rows.length - failures.length,
  failedRows: failures.length,
  pairedStates: args.samples,
  duplicateStateRows: rows.filter((row) => row.state_duplicate_of !== "").length,
  eoWeightCounts: Object.fromEntries([...eoWeightCounts.entries()].sort((a, b) => a[0] - b[0])),
  methods: ["cfop-human-v1", "two-phase-cubejs-v1"],
  generatorVersion: GENERATOR_VERSION,
  sourceCommitSha,
  executionCommitSha,
  csvSha256,
  csv: outPath,
};

writeFileSync(
  outPath.replace(/\.csv$/i, ".manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8",
);

console.log(JSON.stringify(manifest, null, 2));

if (failures.length > 0) {
  console.error(`Experiment produced ${failures.length} failed rows`);
  process.exitCode = 1;
}
