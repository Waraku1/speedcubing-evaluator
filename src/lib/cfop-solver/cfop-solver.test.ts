import { describe, expect, it } from "vitest";

import {
  applyMoves,
  cancelMoves,
  invertMoves,
  SOLVED_STATE,
  type Move,
} from "../cube/moves";

import {
  ALL_F2L_SLOTS,
  countSolvedF2LSlots,
  isAlignedCrossSolved,
  isF2LSolved,
  isF2LSlotSolved,
  isOLLSolved,
  isPLLSolved,
} from "./detection";

import {
  formatSolveResult,
  solveCFOP,
  verifySolveResult,
} from "./cfop-solver";

const SHOWCASE: Move[] = [
  "U'", "L'", "U2", "L",
  "U'", "L'", "U'", "L",
  "F", "U'", "F'", "F2", "B",
];

const STRESS_SCRAMBLES: readonly Move[][] = [
  ["R", "B", "D", "F", "D", "F", "R2", "D", "F'", "U2", "F'", "R2", "L", "R'", "B2", "D", "B", "D", "F'", "D2"],
  ["L", "F'", "B2", "R2", "U", "R'", "F", "D'", "F2", "B2", "U", "B'", "U", "L", "F'", "D", "B'", "U", "R'", "L2"],
  ["R'", "L", "F", "D'", "U2", "F'", "B2", "D'", "U", "D", "F", "R", "B'", "F2", "U2", "R", "U2", "B2", "U", "L"],
  ["L", "B'", "L'", "R", "F2", "U'", "D2", "F2", "L'", "D", "U'", "R2", "L2", "D'", "B'", "R'", "U'", "F'", "D'", "L'"],
  ["U", "B", "D2", "B'", "F'", "U", "F2", "L2", "D", "B2", "U'", "L", "D'", "R2", "U", "B2", "L", "F", "B'", "F2"],
  ["U", "L", "F", "B'", "R", "U", "R2", "B", "D'", "F'", "U2", "R2", "D'", "B'", "R2", "F", "U'", "R", "F", "B"],
  ["R'", "F2", "D2", "B'", "D2", "R2", "U2", "D2", "L'", "B", "L2", "F'", "B", "U'", "B", "U2", "R2", "L", "F2", "U"],
  ["B'", "R'", "L'", "F", "U'", "B2", "R'", "U'", "R'", "B2", "U2", "B2", "D'", "U", "R", "U", "R", "F2", "D", "U'"],
  ["F", "B", "U2", "D'", "B'", "F'", "D", "R", "L'", "U'", "B'", "F'", "B'", "U'", "F", "R'", "D2", "R", "F'", "B"],
  ["F", "D", "F'", "R", "D'", "U", "B'", "L2", "U'", "R'", "D", "U2", "F", "U'", "F2", "U'", "F2", "U", "D2", "U"],
  ["B'", "D2", "R'", "F'", "U'", "R", "L'", "U'", "D", "U'", "R2", "U'", "D", "L2", "B", "D2", "U'", "D2", "U2", "F'"],
  ["R", "D2", "L2", "F'", "R'", "U2", "L'", "R'", "F2", "R2", "F'", "U", "D", "L", "R", "D2", "R2", "F'", "L", "B'"],
];

function reduced(moves: readonly Move[]): string {
  return cancelMoves(moves).join(" ");
}

describe("solveCFOP — physically valid human phase separation", () => {
  it("solves the showcase through four genuine non-skip phases", () => {
    const result = solveCFOP(SHOWCASE);

    console.log("\n" + formatSolveResult(result));

    expect(result.phases.cross.moves.length).toBeGreaterThan(0);
    expect(result.phases.f2l.moves.length).toBeGreaterThan(0);
    expect(result.phases.oll.moves.length).toBeGreaterThan(0);
    expect(result.phases.pll.moves.length).toBeGreaterThan(0);

    expect(isAlignedCrossSolved(result.phases.cross.stateAfter).solved).toBe(true);
    expect(countSolvedF2LSlots(result.phases.cross.stateAfter)).toBeLessThanOrEqual(
      countSolvedF2LSlots(result.scrambledState),
    );

    let f2lState = result.phases.cross.stateAfter;
    const completed = new Set(
      ALL_F2L_SLOTS.filter((slot) => isF2LSlotSolved(f2lState, slot)),
    );

    for (const stage of result.f2l.stages) {
      const beforeCount = countSolvedF2LSlots(f2lState);
      const nextState = applyMoves(f2lState, stage.moves);

      expect(stage.stateBefore).toBe(f2lState);
      expect(stage.stateAfter).toBe(nextState);
      expect(isAlignedCrossSolved(nextState).solved).toBe(true);
      expect(isF2LSlotSolved(nextState, stage.slot)).toBe(true);
      expect(countSolvedF2LSlots(nextState)).toBe(beforeCount + 1);

      for (const slot of completed) {
        expect(isF2LSlotSolved(nextState, slot)).toBe(true);
      }

      completed.add(stage.slot);
      f2lState = nextState;
    }

    expect(f2lState).toBe(result.phases.f2l.stateAfter);
    expect(isF2LSolved(f2lState).solved).toBe(true);

    expect(isF2LSolved(result.phases.oll.stateAfter).solved).toBe(true);
    expect(isOLLSolved(result.phases.oll.stateAfter)).toBe(true);

    expect(isPLLSolved(result.phases.pll.stateAfter)).toBe(true);
    expect(result.stateAfter).toBe(SOLVED_STATE);
    expect(verifySolveResult(result)).toBe(true);

    expect(reduced(result.solution)).not.toBe(reduced(invertMoves(SHOWCASE)));
  }, 10_000);

  it.each(
    STRESS_SCRAMBLES.map((scramble) => [scramble] as const),
  )(
    "solves fixed stress scramble %# without phase corruption",
    (scramble) => {
      const result = solveCFOP(scramble);

      expect(result.stateAfter).toBe(SOLVED_STATE);
      expect(verifySolveResult(result)).toBe(true);
      expect(reduced(result.solution)).not.toBe(reduced(invertMoves(scramble)));
    },
    10_000,
  );

  it.each([
    [["U"] as Move[]],
    [["U2"] as Move[]],
    [["R"] as Move[]],
  ])(
    "accepts a valid CFOP solution even when it equals the literal inverse for a trivial scramble %#",
    (scramble) => {
      const result = solveCFOP(scramble);

      expect(result.stateAfter).toBe(SOLVED_STATE);
      expect(verifySolveResult(result)).toBe(true);
      expect(applyMoves(result.scrambledState, result.solution)).toBe(SOLVED_STATE);
    },
    10_000,
  );
});
