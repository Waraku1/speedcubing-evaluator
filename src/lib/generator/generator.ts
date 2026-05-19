import Cube from "cubejs";

import type {
  CubeState,
  Move,
} from "../cube/cube";

import {
  serializeCubeState,
  applyMoves,
  isSolvedState,
  cancelMoves,
} from "../cube/cube";

// ─────────────────────────────────────────────────────────────
// Solver initialization
// ─────────────────────────────────────────────────────────────

let solverInitialized = false;

function ensureSolverInitialized(): void {

  if (solverInitialized) {
    return;
  }

  Cube.initSolver();

  solverInitialized = true;
}

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
// Move helpers
// ─────────────────────────────────────────────────────────────

function invertMove(
  move: Move
): Move {

  if (
    move.endsWith("2")
  ) {
    return move;
  }

  if (
    move.endsWith("'")
  ) {
    return move[0] as Move;
  }

  return (
    move + "'"
  ) as Move;
}

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
// Single solution
// ─────────────────────────────────────────────────────────────

export function generateSolution(
  state: CubeState
): SolveResult {

  const results =
    generateSolutions(
      state,
      1
    );

  return results[0];
}

// ─────────────────────────────────────────────────────────────
// Multiple solutions
// ─────────────────────────────────────────────────────────────

export function generateSolutions(
  state: CubeState,
  count: number
): SolveResult[] {

  ensureSolverInitialized();

  const uniqueSolutions =
    new Map<string, SolveResult>();

  for (
    let i = 0;
    i < count * 50;
    i++
  ) {

    // ─────────────────────────────
    // random premove
    // ─────────────────────────────

    const premoveCount =
      Math.floor(
        Math.random() * 3
      );

    const premoves: Move[] = [];

    for (
      let j = 0;
      j < premoveCount;
      j++
    ) {

      const randomMove =
        ALL_MOVES[
          Math.floor(
            Math.random()
            * ALL_MOVES.length
          )
        ];

      premoves.push(
        randomMove
      );
    }

    // ─────────────────────────────
    // apply premoves
    // ─────────────────────────────

    const modifiedState =
      applyMoves(
        state,
        premoves
      );

    const encoded =
      encodeCubeState(
        modifiedState
      );

    const cube =
      Cube.fromString(
        encoded
      );

    const rawSolution =
      cube.solve();

    const parsed =
      parseAlgorithm(
        rawSolution
      );

    // ─────────────────────────────
    // undo premoves
    // ─────────────────────────────

    const finalSolution =
  cancelMoves([
    ...premoves,
    ...parsed,
  ]);

    const key =
      finalSolution.join(
        " "
      );

    if (
      !uniqueSolutions.has(
        key
      )
    ) {

      uniqueSolutions.set(
        key,
        {
          solution:
            finalSolution,

          normalizedLength:
            finalSolution.length,
        }
      );
    }

    if (
      uniqueSolutions.size
      >= count
    ) {
      break;
    }
  }

  return [
    ...uniqueSolutions.values()
  ];
}

// ─────────────────────────────────────────────────────────────
// Verification
// ─────────────────────────────────────────────────────────────

export function verifySolution(
  initialState: CubeState,
  solution: readonly Move[]
): boolean {

  const finalState =
    applyMoves(
      initialState,
      [...solution]
    );

  return isSolvedState(
    finalState
  );
}