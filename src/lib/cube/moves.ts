/**
 * moves.ts — 3×3 Rubik's Cube move application
 *
 * State representation: 54-character string, sticker index 0–53
 *   Face order  : U  R  F  D  L  B
 *   Face indices: 0  9  18 27 36 45
 *   Within face : row-major, 0=top-left … 8=bottom-right
 *
 *       +--U--+
 *       0  1  2
 *       3  4  5
 *       6  7  8
 * +--L--+--F--+--R--+--B--+
 * 36 37 38 | 18 19 20 | 9  10 11 | 45 46 47
 * 39 40 41 | 21 22 23 | 12 13 14 | 48 49 50
 * 42 43 44 | 24 25 26 | 15 16 17 | 51 52 53
 *       +--D--+
 *       27 28 29
 *       30 31 32
 *       33 34 35
 *
 * Design contract
 *   - applyMove()  is O(1) — exactly 20 sticker writes per quarter-turn
 *   - U' and U2 are composed from the U permutation (no extra tables)
 *   - Pure functions only — no mutation of input, no global state
 *   - Throws InvalidMoveError for unrecognised move tokens
 *   - WASM-compatible: strings in / strings out, zero allocations beyond result
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A 54-character string encoding the full cube state. */
export type CubeState = string;

/** A valid WCA move token. */
export type Move =
  | "U"  | "U'" | "U2"
  | "R"  | "R'" | "R2"
  | "F"  | "F'" | "F2"
  | "D"  | "D'" | "D2"
  | "L"  | "L'" | "L2"
  | "B"  | "B'" | "B2";

/** Thrown when an unrecognised move token is supplied. */
export class InvalidMoveError extends Error {
  constructor(move: string) {
    super(`Invalid move: "${move}"`);
    this.name = "InvalidMoveError";
  }
}

// ---------------------------------------------------------------------------
// Permutation tables — quarter-turn clockwise only
//
// Each table is a flat array of 20 numbers describing which source index maps
// to which destination index, in application order.
//
// Layout: [dst0, src0, dst1, src1, …, dst19, src19]
//
// This interleaved format lets applyPerm() stay branch-free and avoids a
// separate temporary array — we read all 20 source values first (saved into
// the 'tmp' array), then write all 20 destinations.
//
// Derivation method (for every face F):
//   1. Rotate the 9 face stickers CW (3 4-cycles on the face).
//   2. Rotate the 12 adjacent stickers on the 4 neighbouring face strips (3
//      parallel 4-cycles, one for each row of the strip).
//
// Each 4-cycle (a→b→c→d) is encoded as pairs:
//   (a←d), (b←a), (c←b), (d←c)   i.e. dst=a,src=d  dst=b,src=a  …
// ---------------------------------------------------------------------------

/**
 * A permutation is a flat Int8Array/Uint8Array of length 40:
 * [dst0, src0, dst1, src1, …, dst19, src19]
 *
 * Using Uint8Array keeps it cache-friendly and avoids boxing.
 */
type Perm = Readonly<Uint8Array>;

function perm(...pairs: number[]): Perm {
  // pairs: [dst0, src0, dst1, src1, …]
  return new Uint8Array(pairs);
}

// ---------------------------------------------------------------------------
// U face — top layer, looking down
//
// Face stickers (CW):  0→2→8→6→0, 1→5→7→3→1  (face centre 4 is fixed)
// Adjacent strips (CW):
//   top row of F(18,19,20) → top row of R(9,10,11) → top row of B(45,46,47) → top row of L(36,37,38)
//   reading direction keeps clockwise sense
//
// 4-cycle for face corner ring:  6→0→2→8→6
//   encode: 6←8, 0←6, 2←0, 8←2
// 4-cycle for face edge ring:    3→1→5→7→3
//   encode: 3←7, 1←3, 5←1, 7←5
//
// Adjacent CW: F-top → R-top → B-top → L-top
//   F18→R9, F19→R10, F20→R11
//   R9→B45, R10→B46, R11→B47
//   B45→L36, B46→L37, B47→L38
//   L36→F18, L37→F19, L38→F20
//
// encoded as dst←src pairs (CW quarter):
//   col 0: dst=9,src=18  dst=10,src=19  dst=11,src=20
//          dst=45,src=9   dst=46,src=10  dst=47,src=11
//          dst=36,src=45  dst=37,src=46  dst=38,src=47
//          dst=18,src=36  dst=19,src=37  dst=20,src=38
// ---------------------------------------------------------------------------

const U_CW: Perm = perm(
  // face stickers
  6, 8,   0, 6,   2, 0,   8, 2,   // corner ring
  3, 7,   1, 3,   5, 1,   7, 5,   // edge ring
  // adjacent strips
  9, 18,  10, 19,  11, 20,
  45,  9,  46, 10,  47, 11,
  36, 45,  37, 46,  38, 47,
  18, 36,  19, 37,  20, 38,
);

// ---------------------------------------------------------------------------
// D face — bottom layer, looking up (turns are still described CW from outside)
//
// Face stickers (CW from below, i.e. from outside):
//   corner ring: 33→27→29→35→33  encode: 33←35, 27←33, 29←27, 35←29
//   edge   ring: 30→28→32→34→30  encode: 30←34, 28←30, 32←28, 34←32
//
// Adjacent CW (viewed from outside, i.e. below):
//   bottom row of F → bottom row of L → bottom row of B → bottom row of R
//   F bottom (24,25,26) → L bottom (42,43,44) → B bottom (51,52,53) → R bottom (15,16,17)
//
//   dst=42,src=24  dst=43,src=25  dst=44,src=26
//   dst=51,src=42  dst=52,src=43  dst=53,src=44
//   dst=15,src=51  dst=16,src=52  dst=17,src=53
//   dst=24,src=15  dst=25,src=16  dst=26,src=17
// ---------------------------------------------------------------------------

const D_CW: Perm = perm(
  // face stickers
  33, 35,  27, 33,  29, 27,  35, 29,
  30, 34,  28, 30,  32, 28,  34, 32,
  // adjacent strips
  42, 24,  43, 25,  44, 26,
  51, 42,  52, 43,  53, 44,
  15, 51,  16, 52,  17, 53,
  24, 15,  25, 16,  26, 17,
);

// ---------------------------------------------------------------------------
// R face — right layer, looking left (from outside right)
//
// Face stickers (CW from outside right):
//   corner ring:  9→11→17→15→9   encode: 9←15, 11←9, 17←11, 15←17
//   edge   ring: 10←16, 12←10, 14←12, 16←14
//
// Adjacent CW (from outside right):
//   right col of F → right col of U → right col of B (reversed) → right col of D
//   F-right col: 20,23,26  U-right col: 2,5,8  B-left col (reversed): 47,50,53  D-right col: 29,32,35
//
//   CW from viewer outside right: F→U→B(rev)→D→F
//   dst=2, src=20   dst=5, src=23   dst=8, src=26
//   dst=47,src=2    dst=50,src=5    dst=53,src=8    (B is flipped: top↔bottom)
//   dst=35,src=47   dst=32,src=50   dst=29,src=53   (D right col, reversed because B reversed)
//   dst=20,src=35   dst=23,src=32   dst=26,src=29
//
// Note: The B face is stored in the canonical orientation (looking from outside back).
// When R turns CW, the right column of F maps to: U right col (top of cube),
// then to B left col (but B's top is index 45 which is the top-right from the
// front perspective, so sticker 47 is B top-right = adjacent to U right = index 2).
// The reversal arises because F and B face opposite directions.
// ---------------------------------------------------------------------------

const R_CW: Perm = perm(
  // face stickers
  9, 15,  11, 9,  17, 11,  15, 17,
  10, 16,  12, 10,  14, 12,  16, 14,
  // adjacent strips
   2, 20,   5, 23,   8, 26,
  47,  2,  50,  5,  53,  8,
  35, 47,  32, 50,  29, 53,
  20, 35,  23, 32,  26, 29,
);

// ---------------------------------------------------------------------------
// L face — left layer, looking right (from outside left)
//
// Face stickers (CW from outside left):
//   corner ring: 36→38→44→42→36  encode: 36←42, 38←36, 44←38, 42←44
//   edge   ring: 37←43, 39←37, 41←39, 43←41
//
// Adjacent CW (from outside left):
//   left col of F → left col of D → left col of B (reversed) → left col of U
//   F-left: 18,21,24   D-left: 27,30,33   B-right (reversed): 53,50,47   U-left: 0,3,6
//
//   CW: F→D→B(rev)→U→F
//   dst=27,src=18  dst=30,src=21  dst=33,src=24
//   dst=53,src=27  dst=50,src=30  dst=47,src=33
//   dst=6, src=53  dst=3, src=50  dst=0, src=47
//   dst=18,src=6   dst=21,src=3   dst=24,src=0
// ---------------------------------------------------------------------------

const L_CW: Perm = perm(
  // face stickers
  36, 42,  38, 36,  44, 38,  42, 44,
  37, 43,  39, 37,  41, 39,  43, 41,
  // adjacent strips
  27, 18,  30, 21,  33, 24,
  53, 27,  50, 30,  47, 33,
   6, 53,   3, 50,   0, 47,
  18,  6,  21,  3,  24,  0,
);

// ---------------------------------------------------------------------------
// F face — front layer, looking back (from outside front)
//
// Face stickers (CW from outside front):
//   corner ring: 18→20→26→24→18  encode: 18←24, 20←18, 26←20, 24←26
//   edge   ring: 19←25, 21←19, 23←21, 25←23
//
// Adjacent CW:
//   bottom row of U → right col of R → top row of D (reversed) → left col of L (reversed)
//   U-bottom: 6,7,8    R-left col: 9,12,15    D-top (reversed): 29,28,27    L-right col (reversed): 44,41,38
//
//   CW: U-bottom → R-left → D-top(rev) → L-right(rev) → U-bottom
//   dst=9, src=6   dst=12,src=7   dst=15,src=8
//   dst=29,src=9   dst=28,src=12  dst=27,src=15
//   dst=44,src=29  dst=41,src=28  dst=38,src=27
//   dst=6, src=44  dst=7, src=41  dst=8, src=38
// ---------------------------------------------------------------------------

const F_CW: Perm = perm(
  // face stickers
  18, 24,  20, 18,  26, 20,  24, 26,
  19, 25,  21, 19,  23, 21,  25, 23,
  // adjacent strips
   9,  6,  12,  7,  15,  8,
  29,  9,  28, 12,  27, 15,
  44, 29,  41, 28,  38, 27,
   6, 44,   7, 41,   8, 38,
);

// ---------------------------------------------------------------------------
// B face — back layer, looking forward (from outside back)
//
// Face stickers (CW from outside back):
//   corner ring: 45→47→53→51→45  encode: 45←51, 47←45, 53←47, 51←53
//   edge   ring: 46←52, 48←46, 50←48, 52←50
//
// Adjacent CW (from outside back):
//   top row of U (reversed) → left col of L → bottom row of D (reversed) → right col of R
//   U-top (rev): 2,1,0    L-left col: 36,39,42    D-bottom (rev): 33,34,35    R-right col: 11,14,17
//
//   CW: U-top(rev) → L-left → D-bottom(rev) → R-right → U-top(rev)
//   dst=36,src=2   dst=39,src=1   dst=42,src=0
//   dst=33,src=36  dst=34,src=39  dst=35,src=42
//   dst=11,src=33  dst=14,src=34  dst=17,src=35
//   dst=2, src=11  dst=1, src=14  dst=0, src=17
// ---------------------------------------------------------------------------

const B_CW: Perm = perm(
  // face stickers
  45, 51,  47, 45,  53, 47,  51, 53,
  46, 52,  48, 46,  50, 48,  52, 50,
  // adjacent strips
  36,  2,  39,  1,  42,  0,
  33, 36,  34, 39,  35, 42,
  11, 33,  14, 34,  17, 35,
   2, 11,   1, 14,   0, 17,
);

// ---------------------------------------------------------------------------
// Permutation application
// ---------------------------------------------------------------------------

/**
 * Apply a single CW permutation to a 54-char state string.
 * O(1) — exactly 20 reads and 20 writes.
 *
 * We read all source characters into a small fixed-size buffer first,
 * then write them to avoid aliasing issues if src === dst for some pair
 * (which cannot happen in a valid permutation, but this pattern is correct
 * by construction regardless).
 */
function applyPerm(state: CubeState, p: Perm): CubeState {
  // Snapshot 20 source characters
  const s0  = state[p[1]];  const s1  = state[p[3]];
  const s2  = state[p[5]];  const s3  = state[p[7]];
  const s4  = state[p[9]];  const s5  = state[p[11]];
  const s6  = state[p[13]]; const s7  = state[p[15]];
  const s8  = state[p[17]]; const s9  = state[p[19]];
  const s10 = state[p[21]]; const s11 = state[p[23]];
  const s12 = state[p[25]]; const s13 = state[p[27]];
  const s14 = state[p[29]]; const s15 = state[p[31]];
  const s16 = state[p[33]]; const s17 = state[p[35]];
  const s18 = state[p[37]]; const s19 = state[p[39]];

  // Build result as a char array (fastest mutable approach in V8)
  const a = state.split("");

  a[p[0]]  = s0;  a[p[2]]  = s1;
  a[p[4]]  = s2;  a[p[6]]  = s3;
  a[p[8]]  = s4;  a[p[10]] = s5;
  a[p[12]] = s6;  a[p[14]] = s7;
  a[p[16]] = s8;  a[p[18]] = s9;
  a[p[20]] = s10; a[p[22]] = s11;
  a[p[24]] = s12; a[p[26]] = s13;
  a[p[28]] = s14; a[p[30]] = s15;
  a[p[32]] = s16; a[p[34]] = s17;
  a[p[36]] = s18; a[p[38]] = s19;

  return a.join("");
}

/** Apply a permutation twice (half-turn). O(1). */
function applyPerm2(state: CubeState, p: Perm): CubeState {
  return applyPerm(applyPerm(state, p), p);
}

/** Apply a permutation three times (CCW = CW × 3). O(1). */
function applyPerm3(state: CubeState, p: Perm): CubeState {
  return applyPerm(applyPerm(applyPerm(state, p), p), p);
}

// ---------------------------------------------------------------------------
// Move dispatch table
// ---------------------------------------------------------------------------

type MoveHandler = (state: CubeState) => CubeState;

const MOVE_TABLE: Readonly<Record<string, MoveHandler>> = {
  "U" : (s) => applyPerm (s, U_CW),
  "U'": (s) => applyPerm3(s, U_CW),
  "U2": (s) => applyPerm2(s, U_CW),
  "R" : (s) => applyPerm (s, R_CW),
  "R'": (s) => applyPerm3(s, R_CW),
  "R2": (s) => applyPerm2(s, R_CW),
  "F" : (s) => applyPerm (s, F_CW),
  "F'": (s) => applyPerm3(s, F_CW),
  "F2": (s) => applyPerm2(s, F_CW),
  "D" : (s) => applyPerm (s, D_CW),
  "D'": (s) => applyPerm3(s, D_CW),
  "D2": (s) => applyPerm2(s, D_CW),
  "L" : (s) => applyPerm (s, L_CW),
  "L'": (s) => applyPerm3(s, L_CW),
  "L2": (s) => applyPerm2(s, L_CW),
  "B" : (s) => applyPerm (s, B_CW),
  "B'": (s) => applyPerm3(s, B_CW),
  "B2": (s) => applyPerm2(s, B_CW),
} as const;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply a single move to a cube state.
 *
 * @param state - 54-character string; not validated for cube legality here.
 * @param move  - WCA move token (U, U', U2, R, …, B2).
 * @returns     New 54-character state string.
 * @throws      {InvalidMoveError} if move is not a recognised token.
 */
export function applyMove(state: CubeState, move: Move | string): CubeState {
  const handler = MOVE_TABLE[move];
  if (handler === undefined) throw new InvalidMoveError(move);
  return handler(state);
}

/**
 * Apply a sequence of moves left-to-right.
 *
 * @param state - 54-character cube state.
 * @param moves - Array of WCA move tokens.
 * @returns     New 54-character state string after all moves.
 * @throws      {InvalidMoveError} on the first unrecognised token.
 */
export function applyMoves(state: CubeState, moves: ReadonlyArray<Move | string>): CubeState {
  let s = state;
  for (const m of moves) s = applyMove(s, m);
  return s;
}

/**
 * Invert a move sequence: reverses order and inverts each move.
 *
 * Rules:  X  → X'
 *         X' → X
 *         X2 → X2  (self-inverse)
 */
export function invertMoves(moves: ReadonlyArray<Move | string>): Move[] {
  const result: Move[] = [];
  for (let i = moves.length - 1; i >= 0; i--) {
    const m = moves[i];
    if (m.endsWith("'")) {
      result.push(m.slice(0, -1) as Move);
    } else if (m.endsWith("2")) {
      result.push(m as Move);
    } else {
      result.push((m + "'") as Move);
    }
  }
  return result;
}

/**
 * Count Half-Turn Metric: every move (quarter or half) counts as 1.
 */
export function countHTM(moves: ReadonlyArray<string>): number {
  return moves.length;
}

/**
 * Count Quarter-Turn Metric: half-turn (X2) counts as 2, others as 1.
 */
export function countQTM(moves: ReadonlyArray<string>): number {
  let n = 0;
  for (const m of moves) n += m.endsWith("2") ? 2 : 1;
  return n;
}

/**
 * Parse a space-separated move string into an array of tokens.
 * Empty string returns [].
 */
export function parseMoveString(s: string): Move[] {
  return s.trim() === "" ? [] : (s.trim().split(/\s+/) as Move[]);
}

/**
 * Cancel adjacent moves on the same face:
 *   X  + X  → X2
 *   X  + X2 → X'
 *   X' + X' → X2
 *   X' + X2 → X
 *   X2 + X  → X'
 *   X2 + X' → X
 *   X2 + X2 → (nothing)
 *   X  + X' → (nothing)
 *   X' + X  → (nothing)
 *
 * Iterates until no further cancellations are possible.
 * O(n) per pass; worst case O(n²) total (alternating cancellations).
 */
export function cancelMoves(moves: ReadonlyArray<Move | string>): Move[] {
  const result: Move[] = moves.slice() as Move[];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < result.length - 1; i++) {
      const merged = tryMerge(result[i], result[i + 1]);
      if (merged !== null) {
        result.splice(i, 2, ...merged);
        changed = true;
        // Restart scan from one position earlier to handle chain cancellations
        i = Math.max(-1, i - 2);
      }
    }
  }
  return result;
}

/** @internal */
function faceOf(m: string): string {
  return m[0].toUpperCase();
}

/** @internal — quarter count: CW=1, CCW=3, Half=2 */
function quarters(m: string): number {
  if (m.endsWith("'")) return 3;
  if (m.endsWith("2")) return 2;
  return 1;
}

/** @internal — merge two same-face moves; null if different faces */
function tryMerge(a: string, b: string): Move[] | null {
  if (faceOf(a) !== faceOf(b)) return null;
  const face = faceOf(a);
  const total = (quarters(a) + quarters(b)) % 4;
  if (total === 0) return [];
  if (total === 1) return [face as Move];
  if (total === 2) return [(face + "2") as Move];
  return [(face + "'") as Move];
}

// ---------------------------------------------------------------------------
// Solved-state constant (WASM solver input baseline)
// ---------------------------------------------------------------------------

/**
 * The solved cube state as a 54-character string.
 * Suitable as a starting point for WASM solver integration.
 *
 *   U×9  R×9  F×9  D×9  L×9  B×9
 */
export const SOLVED_STATE: CubeState =
  "UUUUUUUUU" +
  "RRRRRRRRR" +
  "FFFFFFFFF" +
  "DDDDDDDDD" +
  "LLLLLLLLL" +
  "BBBBBBBBB";