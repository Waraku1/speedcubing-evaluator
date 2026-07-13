/**
 * cross.ts — complete optimal D-cross solver
 *
 * Uses a compact 4-edge pattern database with exactly 190,080 reachable
 * cross states. This is not a full-cube solver and never imports cubejs or
 * complete-solver.ts.
 *
 * At runtime a PDB-guided depth-first search chooses a cross solution that:
 *   - finishes the aligned D cross,
 *   - uses at most 8 moves,
 *   - does not increase the number of solved F2L slots.
 */

import {
  applyMove,
  type CubeState,
  type Move,
} from "../cube/moves";

import {
  EDGE_POSITIONS,
  countSolvedF2LSlots,
  isAlignedCrossSolved,
  locateEdge,
} from "./detection";

export type CrossResult = {
  moves: Move[];
  depth: number;
  stateAfter: CubeState;
  pdbDistance: number;
  searchedNodes: number;
};

const CROSS_MOVES: readonly Move[] = [
  "U", "U'", "U2",
  "R", "R'", "R2",
  "F", "F'", "F2",
  "D", "D'", "D2",
  "L", "L'", "L2",
  "B", "B'", "B2",
];

const EDGE_STATE_COUNT = 24;
const CROSS_KEY_SPACE = EDGE_STATE_COUNT ** 4;
const REACHABLE_CROSS_STATES = 190_080;
const CROSS_NODE_LIMIT = 250_000;

// DF, DR, DB, DL in solved positions and orientations.
const CROSS_GOAL_CODES = [16, 18, 20, 22] as const;

let edgeTransitions: readonly Uint8Array[] | null = null;
let crossDistances: Int8Array | null = null;

function faceOf(move: Move): string {
  return move[0];
}

function packCrossCodes(
  df: number,
  dr: number,
  db: number,
  dl: number,
): number {
  return ((df * 24 + dr) * 24 + db) * 24 + dl;
}

function unpackCrossKey(key: number): [number, number, number, number] {
  const dl = key % 24;
  key = (key - dl) / 24;

  const db = key % 24;
  key = (key - db) / 24;

  const dr = key % 24;
  const df = (key - dr) / 24;

  return [df, dr, db, dl];
}

const CROSS_GOAL_KEY = packCrossCodes(...CROSS_GOAL_CODES);

function getCrossKey(state: CubeState): number {
  return packCrossCodes(
    locateEdge(state, "D", "F").code,
    locateEdge(state, "D", "R").code,
    locateEdge(state, "D", "B").code,
    locateEdge(state, "D", "L").code,
  );
}

function buildEdgeTransitions(): readonly Uint8Array[] {
  if (edgeTransitions !== null) return edgeTransitions;

  const tables = CROSS_MOVES.map(() => new Uint8Array(24));

  for (let moveIndex = 0; moveIndex < CROSS_MOVES.length; moveIndex++) {
    const move = CROSS_MOVES[moveIndex];

    for (let code = 0; code < 24; code++) {
      const position = Math.floor(code / 2);
      const orientation = code % 2;
      const [firstIndex, secondIndex] = EDGE_POSITIONS[position];

      const marker = Array<string>(54).fill(".");
      marker[firstIndex] = orientation === 0 ? "A" : "B";
      marker[secondIndex] = orientation === 0 ? "B" : "A";

      const moved = applyMove(marker.join(""), move);
      let nextCode = -1;

      for (let nextPosition = 0; nextPosition < EDGE_POSITIONS.length; nextPosition++) {
        const [a, b] = EDGE_POSITIONS[nextPosition];

        if (moved[a] === "A" && moved[b] === "B") {
          nextCode = nextPosition * 2;
          break;
        }

        if (moved[a] === "B" && moved[b] === "A") {
          nextCode = nextPosition * 2 + 1;
          break;
        }
      }

      if (nextCode < 0) {
        throw new Error(`[solveCross] failed to build edge transition for ${move}/${code}`);
      }

      tables[moveIndex][code] = nextCode;
    }
  }

  edgeTransitions = tables;
  return tables;
}

function moveCrossKey(key: number, moveIndex: number): number {
  const transitions = buildEdgeTransitions()[moveIndex];
  const [df, dr, db, dl] = unpackCrossKey(key);

  return packCrossCodes(
    transitions[df],
    transitions[dr],
    transitions[db],
    transitions[dl],
  );
}

function buildCrossDistances(): Int8Array {
  if (crossDistances !== null) return crossDistances;

  const distances = new Int8Array(CROSS_KEY_SPACE);
  distances.fill(-1);

  const queue = new Int32Array(REACHABLE_CROSS_STATES);
  let head = 0;
  let tail = 0;

  queue[tail++] = CROSS_GOAL_KEY;
  distances[CROSS_GOAL_KEY] = 0;

  while (head < tail) {
    const key = queue[head++];
    const nextDistance = distances[key] + 1;

    for (let moveIndex = 0; moveIndex < CROSS_MOVES.length; moveIndex++) {
      const nextKey = moveCrossKey(key, moveIndex);

      if (distances[nextKey] !== -1) continue;

      distances[nextKey] = nextDistance;
      queue[tail++] = nextKey;
    }
  }

  if (tail !== REACHABLE_CROSS_STATES) {
    throw new Error(
      `[solveCross] cross PDB size mismatch: expected ${REACHABLE_CROSS_STATES}, got ${tail}`,
    );
  }

  crossDistances = distances;
  return distances;
}

function isPhaseSafeCrossGoal(
  before: CubeState,
  candidate: CubeState,
): boolean {
  if (!isAlignedCrossSolved(candidate).solved) return false;

  return countSolvedF2LSlots(candidate) <= countSolvedF2LSlots(before);
}

export function solveCross(
  state: CubeState,
  maxDepth = 8,
): CrossResult {
  if (isAlignedCrossSolved(state).solved) {
    return {
      moves: [],
      depth: 0,
      stateAfter: state,
      pdbDistance: 0,
      searchedNodes: 0,
    };
  }

  const distances = buildCrossDistances();
  const startKey = getCrossKey(state);
  const lowerBound = distances[startKey];

  if (lowerBound < 0) {
    throw new Error(`[solveCross] invalid physical cross state`);
  }

  if (lowerBound > maxDepth) {
    throw new Error(
      `[solveCross] cross requires at least ${lowerBound} moves, above maxDepth=${maxDepth}`,
    );
  }

  let searchedNodes = 0;
  const path: Move[] = [];
  let solutionState: CubeState | null = null;

  function dfs(
    currentState: CubeState,
    currentKey: number,
    remaining: number,
    lastFace: string | null,
  ): boolean {
    searchedNodes++;

    if (searchedNodes > CROSS_NODE_LIMIT) {
      throw new Error(
        `[solveCross] node limit exceeded: ${CROSS_NODE_LIMIT}`,
      );
    }

    const minimumRemaining = distances[currentKey];
    if (minimumRemaining < 0 || minimumRemaining > remaining) return false;

    if (remaining === 0) {
      if (currentKey !== CROSS_GOAL_KEY) return false;
      if (!isPhaseSafeCrossGoal(state, currentState)) return false;

      solutionState = currentState;
      return true;
    }

    for (let moveIndex = 0; moveIndex < CROSS_MOVES.length; moveIndex++) {
      const move = CROSS_MOVES[moveIndex];
      const face = faceOf(move);

      if (face === lastFace) continue;

      const nextKey = moveCrossKey(currentKey, moveIndex);
      if (distances[nextKey] > remaining - 1) continue;

      const nextState = applyMove(currentState, move);
      path.push(move);

      if (dfs(nextState, nextKey, remaining - 1, face)) return true;

      path.pop();
    }

    return false;
  }

  for (let depth = lowerBound; depth <= maxDepth; depth++) {
    path.length = 0;

    if (dfs(state, startKey, depth, null)) {
      if (solutionState === null) {
        throw new Error(`[solveCross] internal solution-state error`);
      }

      return {
        moves: [...path],
        depth: path.length,
        stateAfter: solutionState,
        pdbDistance: lowerBound,
        searchedNodes,
      };
    }
  }

  throw new Error(
    `[solveCross] no phase-safe aligned cross found within ${maxDepth} moves; ` +
      `pdbDistance=${lowerBound}, searchedNodes=${searchedNodes}`,
  );
}

export function getCrossPatternDatabaseSize(): number {
  const distances = buildCrossDistances();
  let count = 0;

  for (const distance of distances) {
    if (distance >= 0) count++;
  }

  return count;
}

export const registeredCrossMoves = CROSS_MOVES;
