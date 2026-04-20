import { describe, it, expect } from "vitest";
import { evaluateMoves, analyzeMovePatterns } from "../../src/lib/evaluator/evaluator";
import { CubeState } from "../../src/lib/cube/cube";
import type { Move } from "../../src/lib/cube/cube";

const newCube = () => new CubeState();

const ALL_TEST_CASES: Move[][] = [
  [],
  ["R"],
  ["R2"],
  ["R", "R'"],
  ["R", "R", "R", "R"],
  ["R", "U", "R'", "U'"],
  ["R", "U", "R'", "U'", "R'", "F", "R2", "U'", "R'", "U'", "R", "U", "R'", "F'"],
  ["B", "B'", "B2", "B", "B'"],
  ["R", "F", "B", "U", "D", "L", "R'", "F'", "B'", "U'", "D'", "L'", "R2", "F2", "B2", "U2", "D2", "L2", "R", "U"],
  ["R", "R", "R"],
];

describe("evaluateMoves - FULL SUITE", () => {

  // ─────────────────────────────────────────────
  // 1. GOLDEN TESTS（確定値検証）
  // ─────────────────────────────────────────────
  describe("Golden Tests (deterministic)", () => {
    it("single R move exact values", () => {
      const r = evaluateMoves(newCube(), ["R"]);

      expect(r.totalCost).toBeCloseTo(1.0);
      expect(r.costPerMove).toBeCloseTo(1.0);
      expect(r.axisEfficiencyScore).toBe(1);
      expect(r.flowScore).toBe(1);
      expect(r.regripPenaltyScore).toBe(0);
    });

    it("single B move exact values", () => {
      const r = evaluateMoves(newCube(), ["B"]);

      expect(r.totalCost).toBeCloseTo(1.5);
      expect(r.regripCount).toBeGreaterThan(0);
    });

    it("R R cancels to R2 (normalized)", () => {
      const r = evaluateMoves(newCube(), ["R", "R"]);
      expect(r.normalizedMoves).toContain("R2");
    });

    it("R R' cancels to empty", () => {
      const r = evaluateMoves(newCube(), ["R", "R'"]);
      expect(r.normalizedMoves).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────
  // 2. HUMAN SCORE FORMULA VALIDATION
  // ─────────────────────────────────────────────
  describe("Human Efficiency Formula", () => {
    it("matches weighted formula exactly", () => {
      const r = evaluateMoves(newCube(), ["R", "U"]);

      const expected =
        0.25 * r.efficiencyScore +
        0.20 * r.axisEfficiencyScore +
        0.25 * r.flowScore +
        0.15 * (1 - Math.min(r.totalCost / 30, 1)) +
        0.15 * (1 - r.regripPenaltyScore);

      expect(r.humanEfficiencyScore).toBeCloseTo(expected, 10);
    });
  });

  // ─────────────────────────────────────────────
  // 3. FLOW / AXIS / REGRIP 精密検証
  // ─────────────────────────────────────────────
  describe("Detailed Metric Behavior", () => {

    it("R R' is poor flow", () => {
      const r = evaluateMoves(newCube(), ["R", "R'"]);
      expect(r.flowScore).toBeLessThan(0.5);
    });

    it("alternating moves improve flow", () => {
      const r = evaluateMoves(newCube(), ["R", "U", "R", "U"]);
      expect(r.flowScore).toBeGreaterThan(0.8);
    });

    it("axis switches counted correctly", () => {
      const r = evaluateMoves(newCube(), ["R", "U", "R", "U"]);
      expect(r.axisSwitchCount).toBe(3);
    });

    it("F + R causes regrip", () => {
      const r = evaluateMoves(newCube(), ["F", "R"]);
      expect(r.regripCount).toBeGreaterThan(0);
    });

  });

  // ─────────────────────────────────────────────
  // 4. v1 COMPATIBILITY
  // ─────────────────────────────────────────────
  describe("v1 Compatibility", () => {
    it("moveCount matches input", () => {
      const r = evaluateMoves(newCube(), ["R", "U"]);
      expect(r.moveCount).toBe(2);
    });

    it("cancelCount consistency", () => {
      const r = evaluateMoves(newCube(), ["R", "R'"]);
      expect(r.cancelCount).toBe(r.moveCount - r.effectiveMoveCount);
    });

    it("efficiencyScore relation", () => {
      const r = evaluateMoves(newCube(), ["R", "U"]);
      expect(r.efficiencyScore).toBeCloseTo(1 - r.redundancyScore, 10);
    });
  });

  // ─────────────────────────────────────────────
  // 5. INVARIANTS
  // ─────────────────────────────────────────────
  describe("Invariants", () => {
    ALL_TEST_CASES.forEach((moves, i) => {
      it(`case #${i}`, () => {
        const r = evaluateMoves(newCube(), moves);

        expect(r.effectiveMoveCount).toBeLessThanOrEqual(r.moveCount);
        expect(r.cancelCount).toBe(r.moveCount - r.effectiveMoveCount);
        expect(r.normalizedMoves.length).toBe(r.effectiveMoveCount);

        expect(r.totalCost).toBeGreaterThanOrEqual(0);
        expect(r.costPerMove).toBeGreaterThanOrEqual(0);

        expect(r.axisEfficiencyScore).toBeGreaterThanOrEqual(0);
        expect(r.axisEfficiencyScore).toBeLessThanOrEqual(1);

        expect(r.flowScore).toBeGreaterThanOrEqual(0);
        expect(r.flowScore).toBeLessThanOrEqual(1);

        expect(r.regripPenaltyScore).toBeGreaterThanOrEqual(0);
        expect(r.regripPenaltyScore).toBeLessThanOrEqual(1);

        expect(r.humanEfficiencyScore).toBeGreaterThanOrEqual(0);
        expect(r.humanEfficiencyScore).toBeLessThanOrEqual(1);

        expect(r.efficiencyScore).toBeGreaterThanOrEqual(0);
        expect(r.efficiencyScore).toBeLessThanOrEqual(1);
      });
    });
  });

  // ─────────────────────────────────────────────
  // 6. EDGE CASES
  // ─────────────────────────────────────────────
  describe("Edge Cases", () => {
    it("empty input", () => {
      const r = evaluateMoves(newCube(), []);
      expect(r.moveCount).toBe(0);
      expect(r.humanEfficiencyScore).toBe(1);
    });

    it("no NaN anywhere", () => {
      for (const moves of ALL_TEST_CASES) {
        const r = evaluateMoves(newCube(), moves);
        Object.values(r).forEach((v) => {
          if (typeof v === "number") {
            expect(isNaN(v)).toBe(false);
          }
        });
      }
    });
  });

  // ─────────────────────────────────────────────
  // 7. RELATIVE TESTS
  // ─────────────────────────────────────────────
  describe("Relative Comparisons", () => {

    it("clean > cancel-heavy", () => {
      const clean = evaluateMoves(newCube(), ["R", "U", "R'", "U'"]);
      const bad = evaluateMoves(newCube(), ["R", "R'", "U", "U'"]);
      expect(clean.humanEfficiencyScore).toBeGreaterThan(bad.humanEfficiencyScore);
    });

    it("R-heavy > B-heavy", () => {
      const r = evaluateMoves(newCube(), ["R", "R", "R"]);
      const b = evaluateMoves(newCube(), ["B", "B", "B"]);
      expect(r.humanEfficiencyScore).toBeGreaterThanOrEqual(b.humanEfficiencyScore);
    });

  });

  // ─────────────────────────────────────────────
  // 8. REAL ALGORITHMS
  // ─────────────────────────────────────────────
  describe("Real Algorithms", () => {

    it("Sexy Move", () => {
      const r = evaluateMoves(newCube(), ["R", "U", "R'", "U'"]);
      expect(r.moveCount).toBe(4);
      expect(r.cancelCount).toBe(0);
    });

    it("T-Perm", () => {
      const t: Move[] = ["R", "U", "R'", "U'", "R'", "F", "R2", "U'", "R'", "U'", "R", "U", "R'", "F'"];
      const r = evaluateMoves(newCube(), t);
      expect(r.moveCount).toBe(14);
      expect(r.cancelCount).toBe(0);
    });

  });

});

// ─────────────────────────────────────────────
// analyzeMovePatterns
// ─────────────────────────────────────────────

describe("analyzeMovePatterns", () => {
  it("counts correctly", () => {
    const r = analyzeMovePatterns(["R", "R'", "R2"]);
    expect(r.faceRepetition["R"]).toBe(3);
  });

  it("empty input", () => {
    const r = analyzeMovePatterns([]);
    expect(Object.keys(r.faceRepetition).length).toBe(0);
  });

  it("multiple faces", () => {
    const r = analyzeMovePatterns(["R", "U", "F"]);
    expect(r.faceRepetition["R"]).toBe(1);
    expect(r.faceRepetition["U"]).toBe(1);
    expect(r.faceRepetition["F"]).toBe(1);
  });
});