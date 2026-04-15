import {
  CubeState,
  Move,
  applyMoves,
  cancelMoves,
  isSolvedState,
} from "../cube/cube";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EvaluationResult = {
  moveCount: number;           // original move length
  effectiveMoveCount: number;  // after cancelMoves
  cancelCount: number;         // moves eliminated by cancellation

  isSolved: boolean;           // whether final state is solved

  redundancyScore: number;     // 0.0 – 1.0  (higher = more waste)
  efficiencyScore: number;     // 0.0 – 1.0  (higher = better)

  hasImmediateCancel: boolean; // e.g. R R'
  hasTripleMove: boolean;      // e.g. R R R

  normalizedMoves: Move[];     // result of cancelMoves
};

export type MovePatternAnalysis = {
  faceRepetition: Record<string, number>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the base face letter from a move token (e.g. "R'" → "R", "U2" → "U"). */
function baseFace(move: Move): string {
  return move[0];
}

/**
 * Returns true when two adjacent moves cancel each other out.
 * Cancellation pairs: X and X' (quarter-turn and its inverse).
 * Note: X2 and X2 also cancel but are handled by cancelMoves; we only
 * flag the visually obvious quarter-turn pairs here.
 */
function movesCancel(a: Move, b: Move): boolean {
  if (baseFace(a) !== baseFace(b)) return false;

  const aIsInverse = a.endsWith("'");
  const bIsInverse = b.endsWith("'");
  const aIsDouble  = a.endsWith("2");
  const bIsDouble  = b.endsWith("2");

  // X X'  or  X' X
  if (!aIsDouble && !bIsDouble && aIsInverse !== bIsInverse) return true;

  // X2 X2  (also cancels)
  if (aIsDouble && bIsDouble) return true;

  return false;
}

/** Clamp a number to [0, 1]. */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Evaluates a move sequence against an initial cube state and returns a
 * comprehensive EvaluationResult describing quality and efficiency.
 *
 * Input arrays are never mutated.
 */
export function evaluateMoves(
  initial: CubeState,
  moves: Move[]
): EvaluationResult {
  // --- 1. Basic metrics ---------------------------------------------------
  const moveCount      = moves.length;
  const normalizedMoves: Move[] = cancelMoves([...moves]);
  const effectiveMoveCount = normalizedMoves.length;
  const cancelCount    = moveCount - effectiveMoveCount;

  // --- 2. Solved check ----------------------------------------------------
  const finalState = applyMoves(initial, moves);
  const isSolved   = isSolvedState(finalState);

  // --- 3. Redundancy detection --------------------------------------------

  // Immediate cancel: any adjacent pair (R R', U U', …)
  let hasImmediateCancel = false;
  for (let i = 0; i < moves.length - 1; i++) {
    if (movesCancel(moves[i], moves[i + 1])) {
      hasImmediateCancel = true;
      break;
    }
  }

  // Triple move: same base face three times in a row (R R R, U U U, …)
  // Only plain quarter-turns count (not doubles), because R2 R2 R2 is unusual.
  let hasTripleMove = false;
  for (let i = 0; i < moves.length - 2; i++) {
    if (
      moves[i]     === moves[i + 1] &&
      moves[i + 1] === moves[i + 2]
    ) {
      hasTripleMove = true;
      break;
    }
  }

  // --- 4. Scoring ---------------------------------------------------------
  const baseCancelRatio = moveCount > 0 ? cancelCount / moveCount : 0;

  const redundancyScore = clamp01(
    baseCancelRatio +
    (hasImmediateCancel ? 0.2 : 0) +
    (hasTripleMove      ? 0.2 : 0)
  );

  const efficiencyScore = clamp01(1 - redundancyScore);

  // --- Result -------------------------------------------------------------
  return {
    moveCount,
    effectiveMoveCount,
    cancelCount,
    isSolved,
    redundancyScore,
    efficiencyScore,
    hasImmediateCancel,
    hasTripleMove,
    normalizedMoves,
  };
}

// ---------------------------------------------------------------------------
// Bonus: pattern analysis
// ---------------------------------------------------------------------------

/**
 * Analyses how often each face appears in the move sequence.
 * Useful for detecting over-reliance on a single axis.
 *
 * Input array is never mutated.
 */
export function analyzeMovePatterns(moves: Move[]): MovePatternAnalysis {
  const faceRepetition: Record<string, number> = {};

  for (const move of moves) {
    const face = baseFace(move);
    faceRepetition[face] = (faceRepetition[face] ?? 0) + 1;
  }

  return { faceRepetition };
}