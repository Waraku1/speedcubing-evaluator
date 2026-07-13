/**
 * moves.ts — physically valid 3×3 Rubik's Cube move engine
 *
 * Sticker layout:
 *   U: 0-8, R: 9-17, F: 18-26,
 *   D: 27-35, L: 36-44, B: 45-53.
 *
 * Every clockwise face permutation below was generated from a 3-D coordinate
 * model. Each quarter-turn moves exactly 20 stickers and preserves physical
 * edge/corner cubies under arbitrary compositions.
 */

export type CubeState = string;

export type Move =
  | "U" | "U'" | "U2"
  | "R" | "R'" | "R2"
  | "F" | "F'" | "F2"
  | "D" | "D'" | "D2"
  | "L" | "L'" | "L2"
  | "B" | "B'" | "B2";

export class InvalidMoveError extends Error {
  constructor(move: string) {
    super(`Invalid move: "${move}"`);
    this.name = "InvalidMoveError";
  }
}

type Perm = Readonly<Uint8Array>;

function perm(...pairs: number[]): Perm {
  if (pairs.length !== 40) {
    throw new Error(`Quarter-turn permutation must contain 20 dst/src pairs; got ${pairs.length / 2}`);
  }
  return new Uint8Array(pairs);
}

// dst, src pairs for one clockwise quarter-turn viewed from outside the face.
const U_CW: Perm = perm(
   2,  0,   5,  1,   8,  2,   1,  3,   7,  5,
   0,  6,   3,  7,   6,  8,
  18,  9,  19, 10,  20, 11,
  36, 18,  37, 19,  38, 20,
  45, 36,  46, 37,  47, 38,
   9, 45,  10, 46,  11, 47,
);

const R_CW: Perm = perm(
  51,  2,  48,  5,  45,  8,
  11,  9,  14, 10,  17, 11,  10, 12,  16, 14,
   9, 15,  12, 16,  15, 17,
   2, 20,   5, 23,   8, 26,
  20, 29,  23, 32,  26, 35,
  35, 45,  32, 48,  29, 51,
);

const F_CW: Perm = perm(
   9,  6,  12,  7,  15,  8,
  29,  9,  28, 12,  27, 15,
  20, 18,  23, 19,  26, 20,  19, 21,  25, 23,
  18, 24,  21, 25,  24, 26,
  38, 27,  41, 28,  44, 29,
   8, 38,   7, 41,   6, 44,
);

const D_CW: Perm = perm(
  51, 15,  52, 16,  53, 17,
  15, 24,  16, 25,  17, 26,
  29, 27,  32, 28,  35, 29,  28, 30,  34, 32,
  27, 33,  30, 34,  33, 35,
  24, 42,  25, 43,  26, 44,
  42, 51,  43, 52,  44, 53,
);

const L_CW: Perm = perm(
  18,  0,  21,  3,  24,  6,
  27, 18,  30, 21,  33, 24,
  53, 27,  50, 30,  47, 33,
  38, 36,  41, 37,  44, 38,  37, 39,  43, 41,
  36, 42,  39, 43,  42, 44,
   6, 47,   3, 50,   0, 53,
);

const B_CW: Perm = perm(
  42,  0,  39,  1,  36,  2,
   0, 11,   1, 14,   2, 17,
  17, 33,  14, 34,  11, 35,
  33, 36,  34, 39,  35, 42,
  47, 45,  50, 46,  53, 47,  46, 48,  52, 50,
  45, 51,  48, 52,  51, 53,
);

function applyQuarterTurn(state: CubeState, p: Perm): CubeState {
  if (state.length !== 54) {
    throw new Error(`Cube state must have length 54; got ${state.length}`);
  }

  const sources = new Array<string>(20);
  for (let i = 0; i < 20; i++) {
    sources[i] = state[p[i * 2 + 1]];
  }

  const result = state.split("");
  for (let i = 0; i < 20; i++) {
    result[p[i * 2]] = sources[i];
  }

  return result.join("");
}

function applyHalfTurn(state: CubeState, p: Perm): CubeState {
  return applyQuarterTurn(applyQuarterTurn(state, p), p);
}

function applyCounterClockwise(state: CubeState, p: Perm): CubeState {
  return applyQuarterTurn(applyHalfTurn(state, p), p);
}

type MoveHandler = (state: CubeState) => CubeState;

const MOVE_TABLE: Readonly<Record<string, MoveHandler>> = {
  U:  (s) => applyQuarterTurn(s, U_CW),
  "U'": (s) => applyCounterClockwise(s, U_CW),
  U2: (s) => applyHalfTurn(s, U_CW),

  R:  (s) => applyQuarterTurn(s, R_CW),
  "R'": (s) => applyCounterClockwise(s, R_CW),
  R2: (s) => applyHalfTurn(s, R_CW),

  F:  (s) => applyQuarterTurn(s, F_CW),
  "F'": (s) => applyCounterClockwise(s, F_CW),
  F2: (s) => applyHalfTurn(s, F_CW),

  D:  (s) => applyQuarterTurn(s, D_CW),
  "D'": (s) => applyCounterClockwise(s, D_CW),
  D2: (s) => applyHalfTurn(s, D_CW),

  L:  (s) => applyQuarterTurn(s, L_CW),
  "L'": (s) => applyCounterClockwise(s, L_CW),
  L2: (s) => applyHalfTurn(s, L_CW),

  B:  (s) => applyQuarterTurn(s, B_CW),
  "B'": (s) => applyCounterClockwise(s, B_CW),
  B2: (s) => applyHalfTurn(s, B_CW),
};

export function applyMove(state: CubeState, move: Move | string): CubeState {
  const handler = MOVE_TABLE[move];
  if (handler === undefined) throw new InvalidMoveError(move);
  return handler(state);
}

export function applyMoves(
  state: CubeState,
  moves: ReadonlyArray<Move | string>,
): CubeState {
  let current = state;
  for (const move of moves) current = applyMove(current, move);
  return current;
}

export function invertMoves(moves: ReadonlyArray<Move | string>): Move[] {
  const result: Move[] = [];
  for (let i = moves.length - 1; i >= 0; i--) {
    const move = moves[i];
    if (move.endsWith("'")) result.push(move.slice(0, -1) as Move);
    else if (move.endsWith("2")) result.push(move as Move);
    else result.push(`${move}'` as Move);
  }
  return result;
}

export function countHTM(moves: ReadonlyArray<string>): number {
  return moves.length;
}

export function countQTM(moves: ReadonlyArray<string>): number {
  return moves.reduce((sum, move) => sum + (move.endsWith("2") ? 2 : 1), 0);
}

export function parseMoveString(value: string): Move[] {
  const trimmed = value.trim();
  if (trimmed === "") return [];

  const tokens = trimmed.split(/\s+/);
  for (const token of tokens) {
    if (MOVE_TABLE[token] === undefined) throw new InvalidMoveError(token);
  }
  return tokens as Move[];
}

function faceOf(move: string): string {
  return move[0].toUpperCase();
}

function quarterCount(move: string): number {
  if (move.endsWith("'")) return 3;
  if (move.endsWith("2")) return 2;
  return 1;
}

function mergeSameFace(a: string, b: string): Move[] | null {
  if (faceOf(a) !== faceOf(b)) return null;

  const face = faceOf(a);
  const total = (quarterCount(a) + quarterCount(b)) % 4;

  if (total === 0) return [];
  if (total === 1) return [face as Move];
  if (total === 2) return [`${face}2` as Move];
  return [`${face}'` as Move];
}

export function cancelMoves(moves: ReadonlyArray<Move | string>): Move[] {
  const result = [...moves] as Move[];

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < result.length - 1; i++) {
      const merged = mergeSameFace(result[i], result[i + 1]);
      if (merged === null) continue;

      result.splice(i, 2, ...merged);
      changed = true;
      i = Math.max(-1, i - 2);
    }
  }

  return result;
}

export const SOLVED_STATE: CubeState =
  "UUUUUUUUU" +
  "RRRRRRRRR" +
  "FFFFFFFFF" +
  "DDDDDDDDD" +
  "LLLLLLLLL" +
  "BBBBBBBBB";
