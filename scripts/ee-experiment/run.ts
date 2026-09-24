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
  solveCFOP,
  verifySolveResult,
} from "../../src/lib/cfop-solver/cfop-solver";

import {
  axisChangeRate,
  axisTransitionEntropy,
  extractStateFeatures,
  moveTransitionEntropy,
} from "../../src/lib/ee-experiment/features";

const STUDY_VERSION = "1.0.0";
const GENERATOR_VERSION = "fixed-htm-v1";
const FEATURE_VERSION = "features-v1";

type Args = {
  samples: number;
  length: number;
  seed: string;
  out: string;
};

type MethodResult = {
  methodId: "cfop-human-v1" | "two-phase-cubejs-v1";
  methodVersion: string;
  solution: Move[];
  runtimeMs: number;
  verified: boolean;
};

function parseArgs(argv: string[]): Args {
  const result: Args = {
    samples: 20,
    length: 20,
    seed: "EE-2026-PILOT-01",
    out: "research/ee-experiment/output/pilot.csv",
  };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--samples") result.samples = Number(value);
    if (key === "--length") result.length = Number(value);
    if (key === "--seed") result.seed = value;
    if (key === "--out") result.out = value;
  }
  if (!Number.isInteger(result.samples) || result.samples <= 0) throw new Error("samples must be a positive integer");
  if (!Number.isInteger(result.length) || result.length <= 0) throw new Error("length must be a positive integer");
  return result;
}

function hashSeed(value: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FACES = ["U", "R", "F", "D", "L", "B"] as const;
const SUFFIXES = ["", "'", "2"] as const;

function axisOfFace(face: string): number {
  if (face === "U" || face === "D") return 0;
  if (face === "R" || face === "L") return 1;
  return 2;
}

function generateScramble(random: () => number, length: number): Move[] {
  const result: Move[] = [];
  while (result.length < length) {
    const face = FACES[Math.floor(random() * FACES.length)];
    const previousFace = result.at(-1)?.[0];
    if (face === previousFace) continue;

    if (result.length >= 2) {
      const a = result[result.length - 2][0];
      const b = result[result.length - 1][0];
      if (axisOfFace(a) === axisOfFace(b) && axisOfFace(b) === axisOfFace(face)) continue;
    }

    const suffix = SUFFIXES[Math.floor(random() * SUFFIXES.length)];
    result.push(`${face}${suffix}` as Move);
  }
  return result;
}

let cubeJsInitialized = false;
function solveTwoPhase(state: string): MethodResult {
  if (!cubeJsInitialized) {
    Cube.initSolver();
    cubeJsInitialized = true;
  }
  const start = performance.now();
  const raw = Cube.fromString(state).solve();
  const runtimeMs = performance.now() - start;
  const solution = parseMoveString(raw);
  const verified = applyMoves(state, solution) === SOLVED_STATE;
  return {
    methodId: "two-phase-cubejs-v1",
    methodVersion: "cubejs-1.3.2",
    solution,
    runtimeMs,
    verified,
  };
}

function solveHumanCFOP(scramble: readonly Move[]): MethodResult {
  const start = performance.now();
  const result = solveCFOP(scramble);
  const runtimeMs = performance.now() - start;
  return {
    methodId: "cfop-human-v1",
    methodVersion: "repository-cfop-db3f177",
    solution: [...result.solution],
    runtimeMs,
    verified: verifySolveResult(result),
  };
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

const args = parseArgs(process.argv.slice(2));
const random = mulberry32(hashSeed(args.seed));
const createdAt = new Date().toISOString();
const solverCommitSha = gitSha();

const columns = [
  "study_version","scramble_id","scramble_seed","scramble_index","scramble_length_htm",
  "scramble_moves","state_signature","x_axis_transition_entropy","x_twisted_corner_count",
  "x_flipped_edge_count","x_corner_cycle_deficit","x_edge_cycle_deficit",
  "x_permutation_cycle_deficit","method_id","method_version","run_index","solution_moves",
  "y_solution_length_htm","y_move_transition_entropy","y_axis_change_rate","status","error",
  "runtime_ms","generator_version","feature_extractor_version","solver_commit_sha","created_at_utc",
];

const rows: Record<string, unknown>[] = [];

for (let index = 0; index < args.samples; index++) {
  const scramble = generateScramble(random, args.length);
  const state = applyMoves(SOLVED_STATE, scramble);
  const stateFeatures = extractStateFeatures(state);
  const scrambleId = `${args.seed}-${String(index + 1).padStart(4, "0")}`;

  const methods: Array<() => MethodResult> = [
    () => solveHumanCFOP(scramble),
    () => solveTwoPhase(state),
  ];

  for (const solve of methods) {
    let result: MethodResult | null = null;
    let error = "";
    try {
      result = solve();
      if (!result.verified) throw new Error("solution replay verification failed");
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }

    const solution = result?.solution ?? [];
    rows.push({
      study_version: STUDY_VERSION,
      scramble_id: scrambleId,
      scramble_seed: args.seed,
      scramble_index: index + 1,
      scramble_length_htm: scramble.length,
      scramble_moves: scramble.join(" "),
      state_signature: state,
      x_axis_transition_entropy: axisTransitionEntropy(scramble),
      x_twisted_corner_count: stateFeatures.twistedCornerCount,
      x_flipped_edge_count: stateFeatures.flippedEdgeCount,
      x_corner_cycle_deficit: stateFeatures.cornerCycleDeficit,
      x_edge_cycle_deficit: stateFeatures.edgeCycleDeficit,
      x_permutation_cycle_deficit: stateFeatures.permutationCycleDeficit,
      method_id: result?.methodId ?? "unknown",
      method_version: result?.methodVersion ?? "unknown",
      run_index: 1,
      solution_moves: solution.join(" "),
      y_solution_length_htm: result ? solution.length : "",
      y_move_transition_entropy: result ? moveTransitionEntropy(solution) : "",
      y_axis_change_rate: result ? axisChangeRate(solution) : "",
      status: result?.verified ? "ok" : "error",
      error,
      runtime_ms: result?.runtimeMs ?? "",
      generator_version: GENERATOR_VERSION,
      feature_extractor_version: FEATURE_VERSION,
      solver_commit_sha: solverCommitSha,
      created_at_utc: createdAt,
    });
  }
}

const outPath = resolve(args.out);
mkdirSync(dirname(outPath), { recursive: true });
const csv = [
  columns.join(","),
  ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
].join("\n");
writeFileSync(outPath, csv + "\n", "utf8");

const manifest = {
  studyVersion: STUDY_VERSION,
  generatedAtUtc: createdAt,
  seed: args.seed,
  samples: args.samples,
  scrambleLengthHtm: args.length,
  expectedRows: args.samples * 2,
  actualRows: rows.length,
  okRows: rows.filter((row) => row.status === "ok").length,
  methods: ["cfop-human-v1", "two-phase-cubejs-v1"],
  generatorVersion: GENERATOR_VERSION,
  featureExtractorVersion: FEATURE_VERSION,
  solverCommitSha,
  csv: outPath,
};
writeFileSync(outPath.replace(/\.csv$/i, ".manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

const failures = rows.filter((row) => row.status !== "ok");
console.log(JSON.stringify(manifest, null, 2));
if (failures.length > 0) {
  console.error(`Experiment produced ${failures.length} failed rows`);
  process.exitCode = 1;
}
