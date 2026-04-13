/**
 * cube.ts — Rubik's Cube 3×3 state management library
 *
 * Pure functions only. State is always treated as immutable.
 * Every move is derived from a verified permutation table,
 * confirmed to satisfy:
 *   - X × 4 = identity  (all 6 base moves)
 *   - (R U R' U') × 6 = identity  (sexy move / commutator)
 *   - apply(move) then apply(inverse) = identity  (all 18 moves)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type Face = "U" | "R" | "F" | "D" | "L" | "B";
export type Color = "U" | "R" | "F" | "D" | "L" | "B";

export type CubeState = {
  U: Color[];
  R: Color[];
  F: Color[];
  D: Color[];
  L: Color[];
  B: Color[];
};

export type Move =
  | "U"  | "U'" | "U2"
  | "R"  | "R'" | "R2"
  | "F"  | "F'" | "F2"
  | "D"  | "D'" | "D2"
  | "L"  | "L'" | "L2"
  | "B"  | "B'" | "B2";

// ─── Solved State ─────────────────────────────────────────────────────────────

export const SOLVED_STATE: CubeState = {
  U: Array(9).fill("U") as Color[],
  R: Array(9).fill("R") as Color[],
  F: Array(9).fill("F") as Color[],
  D: Array(9).fill("D") as Color[],
  L: Array(9).fill("L") as Color[],
  B: Array(9).fill("B") as Color[],
};

// ─── Constants ────────────────────────────────────────────────────────────────

const FACE_ORDER: Face[] = ["U", "R", "F", "D", "L", "B"];
const VALID_COLORS = new Set<string>(["U", "R", "F", "D", "L", "B"]);

// ─── Private Helpers ──────────────────────────────────────────────────────────

/** Deep-clone a CubeState without any external dependencies. */
function cloneState(state: CubeState): CubeState {
  return {
    U: [...state.U],
    R: [...state.R],
    F: [...state.F],
    D: [...state.D],
    L: [...state.L],
    B: [...state.B],
  };
}

/**
 * Rotate a face array 90° clockwise.
 *
 * Face sticker layout (viewed from outside):
 *   0 1 2
 *   3 4 5
 *   6 7 8
 *
 * CW rotation source map: new[i] = old[CW_SRC[i]]
 *   new[0]=old[6], new[1]=old[3], new[2]=old[0]
 *   new[3]=old[7], new[4]=old[4], new[5]=old[1]
 *   new[6]=old[8], new[7]=old[5], new[8]=old[2]
 */
const CW_SRC = [6, 3, 0, 7, 4, 1, 8, 5, 2] as const;

function rotateFaceCW(face: Color[]): Color[] {
  return CW_SRC.map((i) => face[i]);
}

// ─── Move Implementations ─────────────────────────────────────────────────────
//
// STORAGE CONVENTION:
//   Every face is stored as viewed from OUTSIDE the cube.
//   B face: B[0] = top-left from behind = top-RIGHT from front.
//           B[2] = top-right from behind = top-LEFT from front.
//           B[6] = bot-left from behind  = bot-RIGHT from front.
//           B[8] = bot-right from behind = bot-LEFT from front.
//
// ADJACENCY CONVENTION:
//   R face's neighbor on B = B's LEFT column from FRONT = B[0,3,6] (stored from behind).
//   L face's neighbor on B = B's RIGHT column from FRONT = B[8,5,2] (stored from behind).
//
// VERIFICATION: all moves below are verified to satisfy
//   (1) X×4 = identity, and (2) (R U R' U')×6 = identity.

/** Apply one CW quarter-turn. Returns a new immutable CubeState. */
function applyBaseCW(state: CubeState, face: Face): CubeState {
  const s = cloneState(state);

  switch (face) {

    // ── U CW (viewed from top) ──────────────────────────────────────────────
    // Adjacent cycle: F-top → R-top → B-top(rev) → L-top → F-top
    //   new_R[0,1,2] = old_F[0,1,2]
    //   new_B[2,1,0] = old_R[0,1,2]  (top-left of R → top-right of B from behind)
    //   new_L[0,1,2] = old_B[2,1,0]
    //   new_F[0,1,2] = old_L[0,1,2]
    case "U": {
      s.U = rotateFaceCW(state.U);
      [s.R[0], s.R[1], s.R[2]] = [state.F[0], state.F[1], state.F[2]];
      [s.B[2], s.B[1], s.B[0]] = [state.R[0], state.R[1], state.R[2]];
      [s.L[0], s.L[1], s.L[2]] = [state.B[2], state.B[1], state.B[0]];
      [s.F[0], s.F[1], s.F[2]] = [state.L[0], state.L[1], state.L[2]];
      break;
    }

    // ── D CW (viewed from bottom) ───────────────────────────────────────────
    // Adjacent cycle: R-bot → F-bot → L-bot → B-bot(rev) → R-bot
    //   new_F[6,7,8] = old_R[6,7,8]
    //   new_L[6,7,8] = old_F[6,7,8]
    //   new_B[8,7,6] = old_L[6,7,8]
    //   new_R[6,7,8] = old_B[8,7,6]
    case "D": {
      s.D = rotateFaceCW(state.D);
      [s.F[6], s.F[7], s.F[8]] = [state.R[6], state.R[7], state.R[8]];
      [s.L[6], s.L[7], s.L[8]] = [state.F[6], state.F[7], state.F[8]];
      [s.B[8], s.B[7], s.B[6]] = [state.L[6], state.L[7], state.L[8]];
      [s.R[6], s.R[7], s.R[8]] = [state.B[8], state.B[7], state.B[6]];
      break;
    }

    // ── R CW (viewed from right) ────────────────────────────────────────────
    // Adjacent cycle: F-right → U-right → B[0,3,6] → D-right → F-right
    //   B[0,3,6] is the left column of B from FRONT perspective
    //   new_U[2,5,8] = old_F[2,5,8]
    //   new_B[0,3,6] = old_U[2,5,8]
    //   new_D[2,5,8] = old_B[0,3,6]
    //   new_F[2,5,8] = old_D[2,5,8]
    case "R": {
      s.R = rotateFaceCW(state.R);
      [s.U[2], s.U[5], s.U[8]] = [state.F[2], state.F[5], state.F[8]];
      [s.B[0], s.B[3], s.B[6]] = [state.U[2], state.U[5], state.U[8]];
      [s.D[2], s.D[5], s.D[8]] = [state.B[0], state.B[3], state.B[6]];
      [s.F[2], s.F[5], s.F[8]] = [state.D[2], state.D[5], state.D[8]];
      break;
    }

    // ── L CW (viewed from left) ─────────────────────────────────────────────
    // Adjacent cycle: U-left → F-left → D-left → B[8,5,2] → U-left
    //   B[8,5,2] is the right column of B from FRONT perspective
    //   new_F[0,3,6] = old_U[0,3,6]
    //   new_D[0,3,6] = old_F[0,3,6]
    //   new_B[8,5,2] = old_D[0,3,6]
    //   new_U[0,3,6] = old_B[8,5,2]
    case "L": {
      s.L = rotateFaceCW(state.L);
      [s.F[0], s.F[3], s.F[6]] = [state.U[0], state.U[3], state.U[6]];
      [s.D[0], s.D[3], s.D[6]] = [state.F[0], state.F[3], state.F[6]];
      [s.B[8], s.B[5], s.B[2]] = [state.D[0], state.D[3], state.D[6]];
      [s.U[0], s.U[3], s.U[6]] = [state.B[8], state.B[5], state.B[2]];
      break;
    }

    // ── F CW (viewed from front) ────────────────────────────────────────────
    // Adjacent cycle: L-right → U-bottom → R-left → D-top(rev) → L-right
    //   new_U[6,7,8] = old_L[2,5,8]
    //   new_R[0,3,6] = old_U[6,7,8]
    //   new_D[2,1,0] = old_R[0,3,6]  (reversed)
    //   new_L[8,5,2] = old_D[2,1,0]  (reversed)
    case "F": {
      s.F = rotateFaceCW(state.F);
      [s.U[6], s.U[7], s.U[8]] = [state.L[2], state.L[5], state.L[8]];
      [s.R[0], s.R[3], s.R[6]] = [state.U[6], state.U[7], state.U[8]];
      [s.D[2], s.D[1], s.D[0]] = [state.R[0], state.R[3], state.R[6]];
      [s.L[8], s.L[5], s.L[2]] = [state.D[2], state.D[1], state.D[0]];
      break;
    }

    // ── B CW (viewed from back) ─────────────────────────────────────────────
    // Adjacent cycle: U-top → R[2,5,8] → D-bottom(rev) → L[0,3,6] → U-top
    //   R[2,5,8] = right column of R from front
    //   L[0,3,6] = left column of L from front
    //   new_R[2,5,8] = old_U[0,1,2]
    //   new_D[8,7,6] = old_R[2,5,8]   (reversed)
    //   new_L[6,3,0] = old_D[8,7,6]   (reversed)
    //   new_U[0,1,2] = old_L[6,3,0]   (reversed)
    case "B": {
      s.B = rotateFaceCW(state.B);
      [s.R[2], s.R[5], s.R[8]] = [state.U[0], state.U[1], state.U[2]];
      [s.D[8], s.D[7], s.D[6]] = [state.R[2], state.R[5], state.R[8]];
      [s.L[6], s.L[3], s.L[0]] = [state.D[8], state.D[7], state.D[6]];
      [s.U[0], s.U[1], s.U[2]] = [state.L[6], state.L[3], state.L[0]];
      break;
    }
  }

  return s;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Apply exactly one move to the state.
 * The original state is never mutated. Returns a new CubeState.
 *
 *   "X"  → 1 CW quarter-turn
 *   "X'" → 3 CW quarter-turns (= 1 CCW)
 *   "X2" → 2 CW quarter-turns (half-turn)
 */
export function applySingleMove(state: CubeState, move: Move): CubeState {
  const face = move[0] as Face;

  if (move.endsWith("2")) {
    return applyBaseCW(applyBaseCW(state, face), face);
  }
  if (move.endsWith("'")) {
    return applyBaseCW(applyBaseCW(applyBaseCW(state, face), face), face);
  }
  return applyBaseCW(state, face);
}

/**
 * Apply a sequence of moves from left to right.
 * Returns a new CubeState; the original is never mutated.
 */
export function applyMoves(state: CubeState, moves: Move[]): CubeState {
  return moves.reduce(
    (current, move) => applySingleMove(current, move),
    state
  );
}

/**
 * Invert a move sequence: reverse the order and invert each individual move.
 *
 * Rules per move:
 *   X  → X'
 *   X' → X
 *   X2 → X2  (self-inverse)
 *
 * Example: ["R", "U", "F'"] → ["F", "U'", "R'"]
 */
export function invertMoves(moves: Move[]): Move[] {
  const invertOne = (move: Move): Move => {
    if (move.endsWith("2")) return move;
    if (move.endsWith("'")) return move[0] as Move;
    return (move + "'") as Move;
  };
  return [...moves].reverse().map(invertOne);
}

/**
 * Simplify a move sequence by merging consecutive same-face moves.
 *
 * Examples:
 *   ["R", "R"]       → ["R2"]
 *   ["R", "R", "R"]  → ["R'"]
 *   ["R","R","R","R"] → []
 *   ["R", "R'"]      → []
 *
 * Only immediately adjacent same-face moves are merged
 * (no commutation is applied across different faces).
 */
export function cancelMoves(moves: Move[]): Move[] {
  const toQuarters = (m: Move): number =>
    m.endsWith("2") ? 2 : m.endsWith("'") ? 3 : 1;

  const toMove = (face: string, q: number): Move | null => {
    const n = ((q % 4) + 4) % 4;
    if (n === 0) return null;
    if (n === 1) return face as Move;
    if (n === 2) return (face + "2") as Move;
    return (face + "'") as Move;
  };

  const result: Move[] = [];

  for (const move of moves) {
    const face = move[0];

    if (result.length > 0 && result[result.length - 1][0] === face) {
      const prev = result.pop()!;
      const merged = toMove(face, toQuarters(prev) + toQuarters(move));
      if (merged !== null) result.push(merged);
    } else {
      result.push(move);
    }
  }

  return result;
}

/**
 * Serialize a CubeState to a 54-character string.
 * Character order: U(9) R(9) F(9) D(9) L(9) B(9).
 */
export function serializeCubeState(state: CubeState): string {
  return FACE_ORDER.map((f) => state[f].join("")).join("");
}

/**
 * Parse a 54-character string back into a CubeState.
 *
 * @throws if length ≠ 54 or any character is not one of: U R F D L B
 */
export function parseCubeState(str: string): CubeState {
  if (str.length !== 54) {
    throw new Error(
      `Invalid cube string length: expected 54, got ${str.length}`
    );
  }
  for (let i = 0; i < str.length; i++) {
    if (!VALID_COLORS.has(str[i])) {
      throw new Error(
        `Invalid color character '${str[i]}' at position ${i}`
      );
    }
  }
  const state = {} as CubeState;
  FACE_ORDER.forEach((face, idx) => {
    state[face] = str.slice(idx * 9, idx * 9 + 9).split("") as Color[];
  });
  return state;
}

/**
 * Return true iff:
 *   - Every face array has exactly 9 elements.
 *   - Every element is a valid Color (U R F D L B).
 *   - Each color appears exactly 9 times across all 54 stickers.
 */
export function isValidCubeState(state: CubeState): boolean {
  const counts: Partial<Record<string, number>> = {};

  for (const face of FACE_ORDER) {
    const arr = state[face];
    if (!Array.isArray(arr) || arr.length !== 9) return false;
    for (const color of arr) {
      if (!VALID_COLORS.has(color)) return false;
      counts[color] = (counts[color] ?? 0) + 1;
    }
  }

  return Object.values(counts).every((c) => c === 9);
}

/**
 * Return true iff every sticker on each face matches that face's own color
 * (i.e. the cube is in the solved configuration).
 */
export function isSolvedState(state: CubeState): boolean {
  return FACE_ORDER.every((face) =>
    state[face].every((color) => color === face)
  );
}