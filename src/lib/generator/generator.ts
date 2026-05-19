import Cube from "cubejs";

import type {
  CubeState,
  Move,
} from "../cube";

import {
  serializeCubeState,
  applyMoves,
  isSolvedState,
} from "../cube";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const ALL_MOVES = [
  "U", "U'", "U2",
  "R", "R'", "R2",
  "F", "F'", "F2",
  "D", "D'", "D2",
  "L", "L'", "L2",
  "B", "B'", "B2",
] as const satisfies readonly Move[];

const VALID_MOVES = new Set<Move>(ALL_MOVES);

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type SolveResult = {
  readonly solution: Move[];
  readonly normalizedLength: number;
};

// ─────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────

function parseAlgorithm(
  algorithm: string
): Move[] {

  const tokens = algorithm
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const result: Move[] = [];

  for (const token of tokens) {

    if (!VALID_MOVES.has(token as Move)) {
      throw new Error(
        `Invalid move from solver: ${token}`
      );
    }

    result.push(token as Move);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// Encoding
// ─────────────────────────────────────────────────────────────

function encodeCubeState(
  state: CubeState
): string {

  return serializeCubeState(state);
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function generateSolution(
  state: CubeState
): SolveResult {

  const encoded = encodeCubeState(state);

  const cube = Cube.fromString(encoded);

  const rawSolution = cube.solve();

  const solution = parseAlgorithm(
    rawSolution
  );

  return {
    solution,
    normalizedLength:
      solution.length,
  };
}

// ─────────────────────────────────────────────────────────────
// Verification
// ─────────────────────────────────────────────────────────────

export function verifySolution(
  initialState: CubeState,
  solution: readonly Move[]
): boolean {

  const finalState = applyMoves(
    initialState,
    [...solution]
  );

  return isSolvedState(finalState);
}