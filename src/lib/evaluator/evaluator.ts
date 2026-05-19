import {
  CubeState,
  Move,
  Face,
  applyMoves,
  cancelMoves,
  isSolvedState,
} from "../cube/cube";

// ---------------------------------------------------------------------------
// Evaluation Result Types
// ---------------------------------------------------------------------------

/**
 * Primary evaluator output.
 *
 * Design goals:
 * - Fully deterministic
 * - Pure-functional
 * - Stable for testing
 * - Human-oriented speedcubing evaluation
 * - Forward-compatible with future evaluator expansion
 */
export type EvaluationResult = {
  // -----------------------------------------------------------------------
  // Raw move metrics
  // -----------------------------------------------------------------------

  /** Original input length. */
  moveCount: number;

  /** Length after cancelMoves normalization. */
  effectiveMoveCount: number;

  /** Number of eliminated moves. */
  cancelCount: number;

  /** cancelCount / moveCount */
  cancelRatio: number;

  // -----------------------------------------------------------------------
  // Solved-state metrics
  // -----------------------------------------------------------------------

  /** Final cube solved or not. */
  isSolved: boolean;

  // -----------------------------------------------------------------------
  // Cost metrics
  // -----------------------------------------------------------------------

  /** Total ergonomic execution cost. */
  totalCost: number;

  /** Average cost per move. */
  costPerMove: number;

  // -----------------------------------------------------------------------
  // Axis metrics
  // -----------------------------------------------------------------------

  /** Number of axis transitions. */
  axisSwitchCount: number;

  /**
   * 0–1 score.
   * Higher = smoother axis continuity.
   */
  axisEfficiencyScore: number;

  // -----------------------------------------------------------------------
  // Flow metrics
  // -----------------------------------------------------------------------

  /**
   * Human flow quality.
   * Penalizes awkward cancellations/repetitions.
   */
  flowScore: number;

  // -----------------------------------------------------------------------
  // Regrip metrics
  // -----------------------------------------------------------------------

  /** Estimated number of regrips. */
  regripCount: number;

  /** 0–1 normalized regrip penalty. */
  regripPenaltyScore: number;

  // -----------------------------------------------------------------------
  // Efficiency metrics
  // -----------------------------------------------------------------------

  /** Higher = more wasteful. */
  redundancyScore: number;

  /** Higher = more efficient. */
  efficiencyScore: number;

  /**
   * Final blended human-oriented quality score.
   *
   * Weighted blend of:
   * - efficiency
   * - axis continuity
   * - flow
   * - ergonomic cost
   * - regrip minimization
   */
  humanEfficiencyScore: number;

  // -----------------------------------------------------------------------
  // Pattern flags
  // -----------------------------------------------------------------------

  hasImmediateCancel: boolean;
  hasTripleMove: boolean;

  // -----------------------------------------------------------------------
  // Normalized sequence
  // -----------------------------------------------------------------------

  normalizedMoves: Move[];
};

// ---------------------------------------------------------------------------
// Pattern analysis
// ---------------------------------------------------------------------------

export type MovePatternAnalysis = {
  faceRepetition: Record<Face, number>;
  axisDistribution: Record<Axis, number>;
};

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

type Axis = "UD" | "RL" | "FB";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FACE_TO_AXIS: Record<Face, Axis> = {
  U: "UD",
  D: "UD",
  R: "RL",
  L: "RL",
  F: "FB",
  B: "FB",
};

/**
 * Ergonomic move costs.
 *
 * These values are intentionally approximate.
 * They are meant for relative comparison,
 * NOT physical simulation.
 */
const BASE_MOVE_COST: Record<Face, number> = {
  U: 0.8,
  D: 1.2,
  R: 1.0,
  L: 1.1,
  F: 1.3,
  B: 1.5,
};

const REGRIP_FACES = new Set<Face>(["F", "B"]);

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Clamp numeric value into [0, 1]. */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Extract base face from move token. */
function baseFace(move: Move): Face {
  return move[0] as Face;
}

/** Returns move quarter-turn amount. */
function quarterTurns(move: Move): number {
  if (move.endsWith("2")) return 2;
  if (move.endsWith("'")) return 3;
  return 1;
}

/** Determine move axis. */
function moveAxis(move: Move): Axis {
  return FACE_TO_AXIS[baseFace(move)];
}

/**
 * Immediate cancellation detection.
 *
 * Examples:
 * - R R'
 * - U' U
 * - F2 F2
 */
function movesCancel(a: Move, b: Move): boolean {
  if (baseFace(a) !== baseFace(b)) {
    return false;
  }

  const total = (quarterTurns(a) + quarterTurns(b)) % 4;
  return total === 0;
}

/**
 * Triple repetition detection.
 *
 * Example:
 * - R R R
 * - U' U' U'
 */
function isTripleMove(a: Move, b: Move, c: Move): boolean {
  return a === b && b === c;
}

// ---------------------------------------------------------------------------
// Cost Evaluation
// ---------------------------------------------------------------------------

/**
 * Estimate ergonomic move execution cost.
 *
 * Design principles:
 * - B is expensive
 * - F often causes regrip
 * - D is slower than U
 * - Half turns cost slightly more
 */
function estimateMoveCost(move: Move): number {
  const face = baseFace(move);

  let cost = BASE_MOVE_COST[face];

  if (move.endsWith("2")) {
    cost *= 1.6;
  }

  return cost;
}

/**
 * Count axis transitions.
 *
 * Example:
 *   R U R U
 *   RL → UD → RL → UD
 *   = 3 switches
 */
function countAxisSwitches(moves: Move[]): number {
  if (moves.length <= 1) {
    return 0;
  }

  let switches = 0;

  for (let i = 1; i < moves.length; i++) {
    if (moveAxis(moves[i]) !== moveAxis(moves[i - 1])) {
      switches++;
    }
  }

  return switches;
}

/**
 * Estimate regrips.
 *
 * Current heuristic:
 * - F/B moves are more likely to require hand adjustment
 * - Consecutive F/B chains are especially awkward
 */
function estimateRegrips(moves: Move[]): number {
  let count = 0;

  for (let i = 0; i < moves.length; i++) {
    const current = baseFace(moves[i]);

    if (REGRIP_FACES.has(current)) {
      count += 1;
    }

    if (i > 0) {
      const prev = baseFace(moves[i - 1]);

      if (
        REGRIP_FACES.has(prev) &&
        REGRIP_FACES.has(current)
      ) {
        count += 0.5;
      }
    }
  }

  return count;
}

/**
 * Compute axis efficiency score.
 *
 * Philosophy:
 * - Too many axis switches reduce fluidity
 * - Some switching is natural and healthy
 */
function computeAxisEfficiency(
  moveCount: number,
  axisSwitchCount: number
): number {
  if (moveCount <= 1) {
    return 1;
  }

  const maxPossible = moveCount - 1;

  return clamp01(1 - axisSwitchCount / maxPossible);
}

/**
 * Compute flow score.
 *
 * Penalizes:
 * - immediate cancels
 * - excessive repetition
 * - awkward local structures
 */
function computeFlowScore(
  moves: Move[],
  hasImmediateCancel: boolean,
  hasTripleMove: boolean
): number {
  if (moves.length === 0) {
    return 1;
  }

  let penalty = 0;

  if (hasImmediateCancel) {
    penalty += 0.4;
  }

  if (hasTripleMove) {
    penalty += 0.2;
  }

  for (let i = 1; i < moves.length; i++) {
    if (baseFace(moves[i]) === baseFace(moves[i - 1])) {
      penalty += 0.05;
    }
  }

  return clamp01(1 - penalty);
}

/**
 * Compute regrip penalty score.
 *
 * Normalized to [0,1].
 */
function computeRegripPenalty(
  regripCount: number,
  moveCount: number
): number {
  if (moveCount === 0) {
    return 0;
  }

  return clamp01(regripCount / moveCount);
}

// ---------------------------------------------------------------------------
// Core Evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate move sequence quality.
 *
 * Key guarantees:
 * - Pure function
 * - No mutation
 * - Deterministic output
 * - Stable testability
 * - Human-oriented heuristic evaluation
 */
export function evaluateMoves(
  initial: CubeState,
  moves: Move[]
): EvaluationResult {
  // -----------------------------------------------------------------------
  // 1. Normalize sequence
  // -----------------------------------------------------------------------

  const normalizedMoves = cancelMoves([...moves]);

  // -----------------------------------------------------------------------
  // 2. Basic counts
  // -----------------------------------------------------------------------

  const moveCount = moves.length;
  const effectiveMoveCount = normalizedMoves.length;
  const cancelCount = moveCount - effectiveMoveCount;

  const cancelRatio =
    moveCount > 0
      ? cancelCount / moveCount
      : 0;

  // -----------------------------------------------------------------------
  // 3. Cube simulation
  // -----------------------------------------------------------------------

  const finalState = applyMoves(initial, moves);
  const isSolved = isSolvedState(finalState);

  // -----------------------------------------------------------------------
  // 4. Pattern detection
  // -----------------------------------------------------------------------

  let hasImmediateCancel = false;

  for (let i = 0; i < moves.length - 1; i++) {
    if (movesCancel(moves[i], moves[i + 1])) {
      hasImmediateCancel = true;
      break;
    }
  }

  let hasTripleMove = false;

  for (let i = 0; i < moves.length - 2; i++) {
    if (
      isTripleMove(
        moves[i],
        moves[i + 1],
        moves[i + 2]
      )
    ) {
      hasTripleMove = true;
      break;
    }
  }

  // -----------------------------------------------------------------------
  // 5. Cost metrics
  // -----------------------------------------------------------------------

  const totalCost = moves.reduce(
    (sum, move) => sum + estimateMoveCost(move),
    0
  );

  const costPerMove =
    moveCount > 0
      ? totalCost / moveCount
      : 0;

  // -----------------------------------------------------------------------
  // 6. Axis metrics
  // -----------------------------------------------------------------------

  const axisSwitchCount = countAxisSwitches(moves);

  const axisEfficiencyScore = computeAxisEfficiency(
    moveCount,
    axisSwitchCount
  );

  // -----------------------------------------------------------------------
  // 7. Regrip metrics
  // -----------------------------------------------------------------------

  const regripCount = estimateRegrips(moves);

  const regripPenaltyScore = computeRegripPenalty(
    regripCount,
    moveCount
  );

  // -----------------------------------------------------------------------
  // 8. Flow metrics
  // -----------------------------------------------------------------------

  const flowScore = computeFlowScore(
    moves,
    hasImmediateCancel,
    hasTripleMove
  );

  // -----------------------------------------------------------------------
  // 9. Efficiency metrics
  // -----------------------------------------------------------------------

  const redundancyScore = clamp01(
    cancelRatio +
    (hasImmediateCancel ? 0.2 : 0) +
    (hasTripleMove ? 0.15 : 0)
  );

  const efficiencyScore = clamp01(1 - redundancyScore);

  // -----------------------------------------------------------------------
  // 10. Final blended score
  // -----------------------------------------------------------------------

  const humanEfficiencyScore = clamp01(
    0.25 * efficiencyScore +
    0.20 * axisEfficiencyScore +
    0.25 * flowScore +
    0.15 * (1 - Math.min(totalCost / 30, 1)) +
    0.15 * (1 - regripPenaltyScore)
  );

  // -----------------------------------------------------------------------
  // Result
  // -----------------------------------------------------------------------

  return {
    // Raw counts
    moveCount,
    effectiveMoveCount,
    cancelCount,
    cancelRatio,

    // Solved state
    isSolved,

    // Cost metrics
    totalCost,
    costPerMove,

    // Axis metrics
    axisSwitchCount,
    axisEfficiencyScore,

    // Flow metrics
    flowScore,

    // Regrip metrics
    regripCount,
    regripPenaltyScore,

    // Efficiency metrics
    redundancyScore,
    efficiencyScore,
    humanEfficiencyScore,

    // Flags
    hasImmediateCancel,
    hasTripleMove,

    // Sequence
    normalizedMoves,
  };
}

// ---------------------------------------------------------------------------
// Pattern Analysis
// ---------------------------------------------------------------------------

/**
 * Analyze move distribution patterns.
 *
 * Useful for:
 * - generator feedback
 * - algorithm diagnostics
 * - evaluator visualization
 * - axis overuse detection
 */
export function analyzeMovePatterns(
  moves: Move[]
): MovePatternAnalysis {
  const faceRepetition: Record<Face, number> = {
    U: 0,
    R: 0,
    F: 0,
    D: 0,
    L: 0,
    B: 0,
  };

  const axisDistribution: Record<Axis, number> = {
    UD: 0,
    RL: 0,
    FB: 0,
  };

  for (const move of moves) {
    const face = baseFace(move);
    const axis = moveAxis(move);

    faceRepetition[face] += 1;
    axisDistribution[axis] += 1;
  }

  return {
    faceRepetition,
    axisDistribution,
  };
}