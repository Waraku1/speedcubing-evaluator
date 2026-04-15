import { describe, it, expect } from "vitest";

import {
  evaluateMoves,
  analyzeMovePatterns,
} from "../../src/lib/evaluator/evaluator";

import {
  SOLVED_STATE,
  Move,
} from "../../src/lib/cube/cube";

// ---------------------------------------------------------------------------
// evaluateMoves
// ---------------------------------------------------------------------------

describe("evaluateMoves", () => {
  describe("basic metrics", () => {
    it("reports moveCount correctly", () => {
      const result = evaluateMoves(SOLVED_STATE, ["R", "U", "F"] as Move[]);
      expect(result.moveCount).toBe(3);
    });

    it("handles empty sequence", () => {
      const result = evaluateMoves(SOLVED_STATE, []);
      expect(result.moveCount).toBe(0);
    });

    it("R R → effective 1", () => {
      const result = evaluateMoves(SOLVED_STATE, ["R", "R"] as Move[]);
      expect(result.effectiveMoveCount).toBe(1);
    });

    it("R R' → effective 0", () => {
      const result = evaluateMoves(SOLVED_STATE, ["R", "R'"] as Move[]);
      expect(result.effectiveMoveCount).toBe(0);
    });

    it("cancelCount identity holds", () => {
      const moves = ["R", "R", "R", "U", "U'", "F"] as Move[];
      const result = evaluateMoves(SOLVED_STATE, moves);

      expect(result.cancelCount).toBe(
        result.moveCount - result.effectiveMoveCount
      );
    });
  });

  // -------------------------------------------------------------------------
  // Solved detection
  // -------------------------------------------------------------------------
  describe("solved detection", () => {
    it("empty → solved", () => {
      expect(evaluateMoves(SOLVED_STATE, []).isSolved).toBe(true);
    });

    it("R R' → solved", () => {
      expect(
        evaluateMoves(SOLVED_STATE, ["R", "R'"] as Move[]).isSolved
      ).toBe(true);
    });

    it("single move → not solved", () => {
      expect(evaluateMoves(SOLVED_STATE, ["R"] as Move[]).isSolved).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Immediate cancel
  // -------------------------------------------------------------------------
  describe("hasImmediateCancel", () => {
    it("detects R R'", () => {
      expect(
        evaluateMoves(SOLVED_STATE, ["R", "R'"] as Move[]).hasImmediateCancel
      ).toBe(true);
    });

    it("does not detect for R U", () => {
      expect(
        evaluateMoves(SOLVED_STATE, ["R", "U"] as Move[]).hasImmediateCancel
      ).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Triple move
  // -------------------------------------------------------------------------
  describe("hasTripleMove", () => {
    it("detects R R R", () => {
      expect(
        evaluateMoves(SOLVED_STATE, ["R", "R", "R"] as Move[]).hasTripleMove
      ).toBe(true);
    });

    it("does not detect for R R", () => {
      expect(
        evaluateMoves(SOLVED_STATE, ["R", "R"] as Move[]).hasTripleMove
      ).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Normalization
  // -------------------------------------------------------------------------
  describe("normalizedMoves", () => {
    it("R R → R2", () => {
      expect(
        evaluateMoves(SOLVED_STATE, ["R", "R"] as Move[]).normalizedMoves
      ).toEqual(["R2"]);
    });

    it("R R R → R'", () => {
      expect(
        evaluateMoves(SOLVED_STATE, ["R", "R", "R"] as Move[]).normalizedMoves
      ).toEqual(["R'"]);
    });

    it("R R R R → []", () => {
      expect(
        evaluateMoves(
          SOLVED_STATE,
          ["R", "R", "R", "R"] as Move[]
        ).normalizedMoves
      ).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Scoring
  // -------------------------------------------------------------------------
  describe("scoring", () => {
    it("scores are within range", () => {
      const result = evaluateMoves(SOLVED_STATE, ["R", "U"] as Move[]);

      expect(result.redundancyScore).toBeGreaterThanOrEqual(0);
      expect(result.redundancyScore).toBeLessThanOrEqual(1);
      expect(result.efficiencyScore).toBeGreaterThanOrEqual(0);
      expect(result.efficiencyScore).toBeLessThanOrEqual(1);
    });

    it("high redundancy for R R'", () => {
      const result = evaluateMoves(SOLVED_STATE, ["R", "R'"] as Move[]);

      expect(result.redundancyScore).toBeGreaterThan(0.8);
      expect(result.efficiencyScore).toBeLessThan(0.2);
    });

    it("efficiency ≈ 1 - redundancy", () => {
      const result = evaluateMoves(SOLVED_STATE, ["R", "R'"] as Move[]);

      expect(result.efficiencyScore).toBeCloseTo(
        1 - result.redundancyScore,
        5
      );
    });
  });

  // -------------------------------------------------------------------------
  // Real algorithms
  // -------------------------------------------------------------------------
  describe("real algorithms", () => {
    it("sexy move ×6 = solved", () => {
      const sexy = ["R", "U", "R'", "U'"] as Move[];
      const seq = Array(6).fill(sexy).flat() as Move[];

      expect(evaluateMoves(SOLVED_STATE, seq).isSolved).toBe(true);
    });

    it("T-perm ×2 = solved", () => {
      const tPerm = [
        "R","U","R'","U'","R'","F","R2","U'","R'","U'","R","U","R'","F'"
      ] as Move[];

      const seq = [...tPerm, ...tPerm] as Move[];

      expect(evaluateMoves(SOLVED_STATE, seq).isSolved).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// analyzeMovePatterns
// ---------------------------------------------------------------------------

describe("analyzeMovePatterns", () => {
  it("empty → {}", () => {
    expect(analyzeMovePatterns([]).faceRepetition).toEqual({});
  });

  it("counts correctly", () => {
    const result = analyzeMovePatterns(["R", "R", "U"] as Move[]);
    expect(result.faceRepetition).toEqual({ R: 2, U: 1 });
  });

  it("handles primes and doubles", () => {
    const result = analyzeMovePatterns(["R", "R'", "R2"] as Move[]);
    expect(result.faceRepetition["R"]).toBe(3);
  });
});