import { describe, it, expect } from "vitest";

import {
  evaluateMoves,
  analyzeMovePatterns,
  type EvaluationResult,
  type MovePatternAnalysis,
} from "../../src/lib/evaluator/evaluator";

import type {
  CubeState,
  Move,
  Face,
} from "../../src/lib/cube/cube";

import {
  SOLVED_STATE,
  cancelMoves,
} from "../../src/lib/cube/cube";

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

/**
 * Create a fully isolated immutable cube copy.
 *
 * IMPORTANT:
 * evaluator.ts must NEVER mutate caller state.
 * These tests intentionally rely on structural cloning.
 */
function createCube(): CubeState {
  return {
    U: [...SOLVED_STATE.U],
    R: [...SOLVED_STATE.R],
    F: [...SOLVED_STATE.F],
    D: [...SOLVED_STATE.D],
    L: [...SOLVED_STATE.L],
    B: [...SOLVED_STATE.B],
  };
}

/**
 * Strongly typed evaluation wrapper.
 *
 * Centralizing the call:
 * - improves maintainability
 * - simplifies future instrumentation
 * - ensures all tests use identical setup
 */
function evalMoves(moves: Move[]): EvaluationResult {
  return evaluateMoves(createCube(), moves);
}

/**
 * Assert numeric range inclusively.
 */
function expectInRange(
  value: number,
  min: number,
  max: number
): void {
  expect(value).toBeGreaterThanOrEqual(min);
  expect(value).toBeLessThanOrEqual(max);
}

/**
 * Deep freeze utility.
 *
 * Used to ensure evaluator never mutates input arrays.
 */
function deepFreeze<T>(obj: T): T {
  Object.freeze(obj);

  for (const key of Object.keys(obj as object)) {
    const value = (obj as Record<string, unknown>)[key];

    if (
      value !== null &&
      (typeof value === "object" || typeof value === "function") &&
      !Object.isFrozen(value)
    ) {
      deepFreeze(value);
    }
  }

  return obj;
}

// -----------------------------------------------------------------------------
// Shared Test Data
// -----------------------------------------------------------------------------

const ALL_TEST_CASES: Move[][] = [
  [],
  ["R"],
  ["R2"],
  ["R", "R'"],
  ["R", "R", "R", "R"],
  ["R", "U", "R'", "U'"],
  [
    "R", "U", "R'", "U'",
    "R'", "F", "R2", "U'",
    "R'", "U'", "R", "U",
    "R'", "F'",
  ],
  ["B", "B'", "B2", "B", "B'"],
  [
    "R", "F", "B", "U", "D", "L",
    "R'", "F'", "B'", "U'", "D'", "L'",
    "R2", "F2", "B2", "U2", "D2", "L2",
    "R", "U",
  ],
  ["R", "R", "R"],
];

// -----------------------------------------------------------------------------
// evaluateMoves
// -----------------------------------------------------------------------------

describe("evaluateMoves", () => {

  // ---------------------------------------------------------------------------
  // API Contract
  // ---------------------------------------------------------------------------

  describe("API Contract", () => {

    it("returns a structurally valid EvaluationResult", () => {
      const r = evalMoves(["R"]);

      // numeric fields
      const numericFields: (keyof EvaluationResult)[] = [
        "moveCount",
        "effectiveMoveCount",
        "cancelCount",
        "cancelRatio",
        "totalCost",
        "costPerMove",
        "axisSwitchCount",
        "axisEfficiencyScore",
        "flowScore",
        "regripCount",
        "regripPenaltyScore",
        "redundancyScore",
        "efficiencyScore",
        "humanEfficiencyScore",
      ];

      for (const field of numericFields) {
        expect(typeof r[field]).toBe("number");
        expect(Number.isFinite(r[field] as number)).toBe(true);
      }

      // boolean fields
      expect(typeof r.isSolved).toBe("boolean");
      expect(typeof r.hasImmediateCancel).toBe("boolean");
      expect(typeof r.hasTripleMove).toBe("boolean");

      // normalized sequence
      expect(Array.isArray(r.normalizedMoves)).toBe(true);
    });

    it("does not mutate input move array", () => {
      const moves: Move[] = ["R", "U", "R'", "U'"];

      const frozenMoves = deepFreeze([...moves]);

      const before = JSON.stringify(frozenMoves);

      evalMoves(frozenMoves);

      const after = JSON.stringify(frozenMoves);

      expect(after).toBe(before);
    });

    it("does not mutate input cube state", () => {
      const cube = createCube();

      const frozenCube = deepFreeze(createCube());

      const before = JSON.stringify(frozenCube);

      evaluateMoves(frozenCube, ["R", "U"]);

      const after = JSON.stringify(frozenCube);

      expect(after).toBe(before);

      // sanity check
      expect(cube.U).toEqual(SOLVED_STATE.U);
    });

  });

  // ---------------------------------------------------------------------------
  // Deterministic / Golden Tests
  // ---------------------------------------------------------------------------

  describe("Golden Tests", () => {

    it("single R move", () => {
      const r = evalMoves(["R"]);

      expect(r.moveCount).toBe(1);
      expect(r.effectiveMoveCount).toBe(1);

      expect(r.totalCost).toBeCloseTo(1.0);
      expect(r.costPerMove).toBeCloseTo(1.0);

      expect(r.axisSwitchCount).toBe(0);
      expect(r.axisEfficiencyScore).toBe(1);

      expect(r.flowScore).toBe(1);

      expect(r.regripCount).toBe(0);
      expect(r.regripPenaltyScore).toBe(0);

      expect(r.normalizedMoves).toEqual(["R"]);
    });

    it("single B move", () => {
      const r = evalMoves(["B"]);

      expect(r.totalCost).toBeCloseTo(1.5);
      expect(r.regripCount).toBeGreaterThan(0);
    });

    it("R R normalizes to R2", () => {
      const r = evalMoves(["R", "R"]);

      expect(r.normalizedMoves).toEqual(["R2"]);
    });

    it("R R R normalizes to R'", () => {
      const r = evalMoves(["R", "R", "R"]);

      expect(r.normalizedMoves).toEqual(["R'"]);
    });

    it("R R R R fully cancels", () => {
      const r = evalMoves(["R", "R", "R", "R"]);

      expect(r.normalizedMoves).toEqual([]);
    });

    it("R R' fully cancels", () => {
      const r = evalMoves(["R", "R'"]);

      expect(r.normalizedMoves).toEqual([]);
    });

  });

  // ---------------------------------------------------------------------------
  // Solved-State Behavior
  // ---------------------------------------------------------------------------

  describe("Solved-State Behavior", () => {

    it("empty sequence preserves solved state", () => {
      const r = evalMoves([]);

      expect(r.isSolved).toBe(true);
    });

    it("single R move unsolves cube", () => {
      const r = evalMoves(["R"]);

      expect(r.isSolved).toBe(false);
    });

    it("R followed by R' returns solved state", () => {
      const r = evalMoves(["R", "R'"]);

      expect(r.isSolved).toBe(true);
    });

  });

  // ---------------------------------------------------------------------------
  // Cancellation Logic
  // ---------------------------------------------------------------------------

  describe("Cancellation Logic", () => {

    it("cancelCount matches normalization delta", () => {
      const r = evalMoves(["R", "R'"]);

      expect(r.cancelCount)
        .toBe(r.moveCount - r.effectiveMoveCount);
    });

    it("cancelRatio is mathematically correct", () => {
      const r = evalMoves(["R", "R'"]);

      expect(r.cancelRatio)
        .toBeCloseTo(r.cancelCount / r.moveCount);
    });

    it("normalizedMoves matches cancelMoves()", () => {
      for (const moves of ALL_TEST_CASES) {
        const r = evalMoves(moves);

        expect(r.normalizedMoves)
          .toEqual(cancelMoves(moves));
      }
    });

    it("detects immediate cancel", () => {
      const r = evalMoves(["R", "R'"]);

      expect(r.hasImmediateCancel).toBe(true);
    });

    it("detects triple move", () => {
      const r = evalMoves(["R", "R", "R"]);

      expect(r.hasTripleMove).toBe(true);
    });

  });

  // ---------------------------------------------------------------------------
  // Axis Metrics
  // ---------------------------------------------------------------------------

  describe("Axis Metrics", () => {

    it("R U R U has 3 axis switches", () => {
      const r = evalMoves(["R", "U", "R", "U"]);

      expect(r.axisSwitchCount).toBe(3);
    });

    it("same-axis moves minimize switches", () => {
      const sameAxis = evalMoves(["R", "L", "R", "L"]);
      const mixedAxis = evalMoves(["R", "U", "F", "R"]);

      expect(sameAxis.axisSwitchCount)
        .toBeLessThan(mixedAxis.axisSwitchCount);
    });

    it("axisEfficiencyScore stays in range", () => {
      for (const moves of ALL_TEST_CASES) {
        const r = evalMoves(moves);

        expectInRange(r.axisEfficiencyScore, 0, 1);
      }
    });

  });

  // ---------------------------------------------------------------------------
  // Flow Metrics
  // ---------------------------------------------------------------------------

  describe("Flow Metrics", () => {

    it("alternating moves improve flow", () => {
      const smooth = evalMoves(["R", "U", "R", "U"]);
      const awkward = evalMoves(["R", "R'", "U", "U'"]);

      expect(smooth.flowScore)
        .toBeGreaterThan(awkward.flowScore);
    });

    it("immediate cancel reduces flow", () => {
      const r = evalMoves(["R", "R'"]);

      expect(r.flowScore).toBeLessThan(1);
    });

    it("flowScore stays in range", () => {
      for (const moves of ALL_TEST_CASES) {
        const r = evalMoves(moves);

        expectInRange(r.flowScore, 0, 1);
      }
    });

  });

  // ---------------------------------------------------------------------------
  // Regrip Metrics
  // ---------------------------------------------------------------------------

  describe("Regrip Metrics", () => {

    it("F moves introduce regrip pressure", () => {
      const easy = evalMoves(["R", "U", "R'"]);
      const awkward = evalMoves(["F", "R", "F"]);

      expect(awkward.regripCount)
        .toBeGreaterThanOrEqual(easy.regripCount);
    });

    it("B moves are ergonomically expensive", () => {
      const r = evalMoves(["B"]);

      expect(r.regripCount).toBeGreaterThan(0);
      expect(r.totalCost).toBeGreaterThan(1);
    });

    it("regripPenaltyScore stays in range", () => {
      for (const moves of ALL_TEST_CASES) {
        const r = evalMoves(moves);

        expectInRange(r.regripPenaltyScore, 0, 1);
      }
    });

  });

  // ---------------------------------------------------------------------------
  // Efficiency Metrics
  // ---------------------------------------------------------------------------

  describe("Efficiency Metrics", () => {

    it("efficiencyScore complements redundancyScore", () => {
      const r = evalMoves(["R", "U"]);

      expect(r.efficiencyScore)
        .toBeCloseTo(1 - r.redundancyScore, 10);
    });

    it("clean algorithm scores better than cancel-heavy sequence", () => {
      const clean = evalMoves(["R", "U", "R'", "U'"]);

      const bad = evalMoves([
        "R", "R'",
        "U", "U'",
      ]);

      expect(clean.humanEfficiencyScore)
        .toBeGreaterThan(bad.humanEfficiencyScore);
    });

    it("humanEfficiencyScore stays normalized", () => {
      for (const moves of ALL_TEST_CASES) {
        const r = evalMoves(moves);

        expectInRange(r.humanEfficiencyScore, 0, 1);
      }
    });

  });

  // ---------------------------------------------------------------------------
  // Cost Metrics
  // ---------------------------------------------------------------------------

  describe("Cost Metrics", () => {

    it("costPerMove is mathematically correct", () => {
      const r = evalMoves(["R", "U", "R'"]);

      expect(r.costPerMove)
        .toBeCloseTo(r.totalCost / r.moveCount);
    });

    it("empty sequence has zero cost", () => {
      const r = evalMoves([]);

      expect(r.totalCost).toBe(0);
      expect(r.costPerMove).toBe(0);
    });

    it("all costs remain non-negative", () => {
      for (const moves of ALL_TEST_CASES) {
        const r = evalMoves(moves);

        expect(r.totalCost).toBeGreaterThanOrEqual(0);
        expect(r.costPerMove).toBeGreaterThanOrEqual(0);
      }
    });

  });

  // ---------------------------------------------------------------------------
  // Stability / Robustness
  // ---------------------------------------------------------------------------

  describe("Stability", () => {

    it("never returns NaN", () => {
      for (const moves of ALL_TEST_CASES) {
        const r = evalMoves(moves);

        for (const value of Object.values(r)) {
          if (typeof value === "number") {
            expect(Number.isNaN(value)).toBe(false);
          }
        }
      }
    });

    it("never returns Infinity", () => {
      for (const moves of ALL_TEST_CASES) {
        const r = evalMoves(moves);

        for (const value of Object.values(r)) {
          if (typeof value === "number") {
            expect(Number.isFinite(value)).toBe(true);
          }
        }
      }
    });

  });

  // ---------------------------------------------------------------------------
  // Real Algorithms
  // ---------------------------------------------------------------------------

  describe("Real Algorithms", () => {

    it("Sexy Move", () => {
      const sexy: Move[] = [
        "R",
        "U",
        "R'",
        "U'",
      ];

      const r = evalMoves(sexy);

      expect(r.moveCount).toBe(4);
      expect(r.cancelCount).toBe(0);

      expect(r.flowScore).toBeGreaterThan(0.5);
    });

    it("T-Perm", () => {
      const tPerm: Move[] = [
        "R", "U", "R'", "U'",
        "R'", "F", "R2", "U'",
        "R'", "U'", "R", "U",
        "R'", "F'",
      ];

      const r = evalMoves(tPerm);

      expect(r.moveCount).toBe(14);

      expect(r.cancelCount).toBe(0);

      expect(r.humanEfficiencyScore)
        .toBeGreaterThan(0);
    });

  });

});

// -----------------------------------------------------------------------------
// analyzeMovePatterns
// -----------------------------------------------------------------------------

describe("analyzeMovePatterns", () => {

  it("returns structurally valid analysis", () => {
    const r: MovePatternAnalysis =
      analyzeMovePatterns(["R", "U", "F"]);

    expect(typeof r).toBe("object");

    expect(typeof r.faceRepetition).toBe("object");
    expect(typeof r.axisDistribution).toBe("object");
  });

  it("counts repeated faces correctly", () => {
    const r = analyzeMovePatterns([
      "R",
      "R'",
      "R2",
    ]);

    expect(r.faceRepetition.R).toBe(3);
  });

  it("counts multiple faces correctly", () => {
    const r = analyzeMovePatterns([
      "R",
      "U",
      "F",
    ]);

    expect(r.faceRepetition.R).toBe(1);
    expect(r.faceRepetition.U).toBe(1);
    expect(r.faceRepetition.F).toBe(1);
  });

  it("tracks axis distribution", () => {
    const r = analyzeMovePatterns([
      "R",
      "L",
      "U",
      "F",
    ]);

    expect(r.axisDistribution.RL).toBe(2);
    expect(r.axisDistribution.UD).toBe(1);
    expect(r.axisDistribution.FB).toBe(1);
  });

  it("empty input returns zeroed distribution", () => {
    const r = analyzeMovePatterns([]);

    const faces: Face[] = [
      "U",
      "R",
      "F",
      "D",
      "L",
      "B",
    ];

    for (const face of faces) {
      expect(r.faceRepetition[face]).toBe(0);
    }

    expect(r.axisDistribution.UD).toBe(0);
    expect(r.axisDistribution.RL).toBe(0);
    expect(r.axisDistribution.FB).toBe(0);
  });

});