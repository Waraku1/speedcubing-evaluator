import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import Cube from "cubejs";

import {
  SOLVED_STATE,
  applyMoves,
  invertMoves,
  parseMoveString,
  type Move,
} from "../../src/lib/cube/moves";

import {
  solveCFOPState,
  verifySolveResult,
} from "../../src/lib/cfop-solver/cfop-solver";

import {
  axisChangeRate,
  extractStateFeatures,
  moveTransitionEntropy,
} from "../../src/lib/ee-experiment/features";

import {
  generateRandomState,
} from "../../src/lib/ee-experiment/random-state";

const STUDY_VERSION = "2.0.0";
const SAMPLING_MODE = "random_state_uniform_coordinate_v1";
const GENERATOR_VERSION = "random-state-sha256-coordinate-v1";
const FEATURE_VERSION = "features-v1";

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
    samples: 20,
    seed: "EE-2026-RANDOM-STATE-PILOT-01",
    out: "research/ee-experiment/output/pilot.csv",
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
const solverCommitSha = process.env.EE_SOURCE_COMMIT_SHA?.trim() || executionCommitSha;

const columns = [
  "study_version",
  "sampling_mode",
  "scramble_id",
  "study_seed",
  "sample_index",
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
  "method_id",
  "method_version",
  "run_index",
  "solution_moves",
  "y_solution_length_htm",
  "y_move_transition_entropy",
  "y_axis_change_rate",
  "status",
  "error",
  "runtime_ms",
  "generator_version",
  "feature_extractor_version",
  "solver_commit_sha",
  "execution_commit_sha",
  "created_at_utc",
];

const rows: Record<string, unknown>[] = [];
const firstIdByState = new Map<string, string>();

for (let index = 0; index < args.samples; index++) {
  const generated = generateRandomState(args.seed, index);
  const regenerated = generateRandomState(args.seed, index);

  if (
    regenerated.stateSignature !== generated.stateSignature ||
    JSON.stringify(regenerated.coordinates) !== JSON.stringify(generated.coordinates)
  ) {
    throw new Error(`deterministic regeneration failed at sample ${index}`);
  }

  const state = generated.stateSignature;
  const coordinates = generated.coordinates;
  const stateFeatures = extractStateFeatures(state);
  const scrambleId = `${args.seed}-${String(index + 1).padStart(4, "0")}`;

  const duplicateOf = firstIdByState.get(state) ?? "";
  if (!duplicateOf) firstIdByState.set(state, scrambleId);

  // Two-phase is evaluated once. Its verified solution is also inverted solely to
  // materialize a replayable scramble representation of the sampled state.
  const twoPhase = solveTwoPhase(state);

  let scramble: Move[] = [];
  let scrambleRepresentationError = "";
  if (twoPhase.verified) {
    scramble = invertMoves(twoPhase.solution);
    if (applyMoves(SOLVED_STATE, scramble) !== state) {
      scrambleRepresentationError = "materialized scramble did not reproduce sampled state";
      scramble = [];
    }
  } else {
    scrambleRepresentationError = "two-phase solution unavailable for scramble representation";
  }

  const cfop = solveHumanCFOP(state);

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
    const { result } = method;
    const status = result.verified && scrambleRepresentationError === "" ? "ok" : "error";
    const error = [result.error, scrambleRepresentationError].filter(Boolean).join("; ");

    rows.push({
      study_version: STUDY_VERSION,
      sampling_mode: SAMPLING_MODE,
      scramble_id: scrambleId,
      study_seed: args.seed,
      sample_index: index,
      state_signature: state,
      state_corner_permutation: JSON.stringify(coordinates.cp),
      state_corner_orientation: JSON.stringify(coordinates.co),
      state_edge_permutation: JSON.stringify(coordinates.ep),
      state_edge_orientation: JSON.stringify(coordinates.eo),
      state_duplicate_of: duplicateOf,
      scramble_moves: scramble.join(" "),
      scramble_length_htm: scramble.length,
      scramble_representation_method: "inverse(two-phase-cubejs-v1)",
      x_flipped_edge_count: stateFeatures.flippedEdgeCount,
      x_twisted_corner_count: stateFeatures.twistedCornerCount,
      x_corner_cycle_deficit: stateFeatures.cornerCycleDeficit,
      x_edge_cycle_deficit: stateFeatures.edgeCycleDeficit,
      x_permutation_cycle_deficit: stateFeatures.permutationCycleDeficit,
      method_id: method.methodId,
      method_version: method.methodVersion,
      run_index: 1,
      solution_moves: result.solution.join(" "),
      y_solution_length_htm: result.verified ? result.solution.length : "",
      y_move_transition_entropy: result.verified
        ? moveTransitionEntropy(result.solution)
        : "",
      y_axis_change_rate: result.verified ? axisChangeRate(result.solution) : "",
      status,
      error,
      runtime_ms: result.runtimeMs,
      generator_version: GENERATOR_VERSION,
      feature_extractor_version: FEATURE_VERSION,
      solver_commit_sha: solverCommitSha,
      execution_commit_sha: executionCommitSha,
      created_at_utc: createdAt,
    });
  }
}

const expectedRows = args.samples * 2;
if (rows.length !== expectedRows) {
  throw new Error(`row count invariant failed: ${rows.length}/${expectedRows}`);
}

for (let index = 0; index < args.samples; index++) {
  const scrambleId = `${args.seed}-${String(index + 1).padStart(4, "0")}`;
  const paired = rows.filter((row) => row.scramble_id === scrambleId);
  const methodIds = new Set(paired.map((row) => row.method_id));

  if (paired.length !== 2 || methodIds.size !== 2) {
    throw new Error(`pairing invariant failed for ${scrambleId}`);
  }
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
const duplicateRows = rows.filter((row) => row.state_duplicate_of !== "");

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
  duplicateStateRows: duplicateRows.length,
  methods: ["cfop-human-v1", "two-phase-cubejs-v1"],
  generatorVersion: GENERATOR_VERSION,
  featureExtractorVersion: FEATURE_VERSION,
  solverCommitSha,
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
