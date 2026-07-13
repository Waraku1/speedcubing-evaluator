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

import { solveCFOP } from "./cfop-solver";

const SCRAMBLE: Move[] = [
  "U'", "L'", "U2", "L",
  "U'", "L'", "U'", "L",
  "F", "U'", "F'", "F2", "B",
];

function reduced(moves: readonly Move[]): string {
  return cancelMoves(moves).join(" ");
}

describe("CFOP integrity", () => {
  it("does not disguise the inverse scramble", () => {
    const result = solveCFOP(SCRAMBLE);

    expect(reduced(result.solution)).not.toBe(
      reduced(invertMoves(SCRAMBLE)),
    );
  });

  it("records genuine one-slot-at-a-time F2L work", () => {
    const result = solveCFOP(SCRAMBLE);
    let state = result.phases.cross.stateAfter;
    const completed = new Set(
      ALL_F2L_SLOTS.filter((slot) => isF2LSlotSolved(state, slot)),
    );

    expect(isAlignedCrossSolved(state).solved).toBe(true);

    for (const stage of result.f2l.stages) {
      const beforeCount = countSolvedF2LSlots(state);
      const nextState = applyMoves(state, stage.moves);

      expect(stage.stateBefore).toBe(state);
      expect(stage.stateAfter).toBe(nextState);
      expect(isAlignedCrossSolved(nextState).solved).toBe(true);
      expect(isF2LSlotSolved(nextState, stage.slot)).toBe(true);
      expect(countSolvedF2LSlots(nextState)).toBe(beforeCount + 1);

      for (const protectedSlot of completed) {
        expect(isF2LSlotSolved(nextState, protectedSlot)).toBe(true);
      }

      completed.add(stage.slot);
      state = nextState;
    }

    expect(state).toBe(result.phases.f2l.stateAfter);
    expect(isF2LSolved(state).solved).toBe(true);
  });

  it("solves only after Cross, F2L, OLL, and PLL validation", () => {
    const result = solveCFOP(SCRAMBLE);

    expect(applyMoves(SOLVED_STATE, SCRAMBLE)).toBe(result.scrambledState);
    expect(isF2LSolved(result.phases.f2l.stateAfter).solved).toBe(true);
    expect(isOLLSolved(result.phases.oll.stateAfter)).toBe(true);
    expect(isPLLSolved(result.phases.pll.stateAfter)).toBe(true);
    expect(result.stateAfter).toBe(SOLVED_STATE);
  });
});
