import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  applyMoves,
  invertMoves,
  SOLVED_STATE,
  type Move,
} from "../cube/moves";

import {
  CFOP_FACELET_FORMAT,
  InvalidCubeStateError,
  solveCFOP,
  solveCFOPFacelets,
  solveCFOPState,
  verifySolveResult,
} from "./cfop-solver";

import {
  ALL_F2L_SLOTS,
  countSolvedF2LSlots,
  isAlignedCrossSolved,
  isF2LSolved,
  isF2LSlotSolved,
  isOLLSolved,
} from "./detection";

const SCRAMBLES: readonly Move[][] = [
  ["R", "U", "R'", "U'", "F2", "L", "D2", "B'", "U", "R2"],
  ["L", "F'", "B2", "R2", "U", "R'", "F", "D'", "F2", "B2", "U", "B'"],
  ["R'", "L", "F", "D'", "U2", "F'", "B2", "D'", "U", "D", "F", "R"],
  ["U", "B", "D2", "B'", "F'", "U", "F2", "L2", "D", "B2", "U'", "L"],
  ["B'", "R'", "L'", "F", "U'", "B2", "R'", "U'", "R'", "B2", "U2", "B2"],
  ["F", "D", "F'", "R", "D'", "U", "B'", "L2", "U'", "R'", "D", "U2"],
];

describe("solveCFOPState", () => {
  it.each(SCRAMBLES.map((scramble) => [scramble] as const))(
    "solves an arbitrary valid facelet state %# with inspectable human stages",
    (scramble) => {
      const state = applyMoves(SOLVED_STATE, scramble);
      const result = solveCFOPState(state);

      expect(result.input).toEqual({
        kind: "state",
        format: CFOP_FACELET_FORMAT,
        facelets: state,
      });
      expect(result.scramble).toEqual([]);
      expect(result.scrambledState).toBe(state);
      expect(verifySolveResult(result)).toBe(true);

      for (const action of result.cross.actions) {
        expect(applyMoves(action.stateBefore, action.algorithm)).toBe(action.stateAfter);
        expect(action.target).toMatch(/^D[FRBL]$/);
      }
      expect(isAlignedCrossSolved(result.cross.stateAfter).solved).toBe(true);

      let f2lState = result.cross.stateAfter;
      for (const stage of result.f2l.stages) {
        const solvedBefore = countSolvedF2LSlots(f2lState);
        expect(stage.stateBefore).toBe(f2lState);
        expect(applyMoves(f2lState, stage.algorithm)).toBe(stage.stateAfter);
        expect(isAlignedCrossSolved(stage.stateAfter).solved).toBe(true);
        expect(isF2LSlotSolved(stage.stateAfter, stage.slot)).toBe(true);
        expect(countSolvedF2LSlots(stage.stateAfter)).toBeGreaterThan(solvedBefore);
        expect(stage.caseId).toMatch(/^F2L-/);
        expect(stage.category).toBeTruthy();
        f2lState = stage.stateAfter;
      }

      expect(isF2LSolved(result.f2l.stateAfter).solved).toBe(true);
      expect(isF2LSolved(result.oll.stateAfter).solved).toBe(true);
      expect(isOLLSolved(result.oll.stateAfter)).toBe(true);
      expect(result.oll.algorithm).toEqual(result.oll.moves);
      expect(result.pll.algorithm).toEqual(result.pll.moves);
      expect(result.stateAfter).toBe(SOLVED_STATE);
    },
    10_000,
  );

  it("accepts the release branch facelet boundary without conversion", () => {
    const state = applyMoves(SOLVED_STATE, SCRAMBLES[0]);
    const result = solveCFOPFacelets({
      format: "URFDLB_FACELETS_V1",
      facelets: state,
    });

    expect(result.input.facelets).toBe(state);
    expect(result.stateAfter).toBe(SOLVED_STATE);
  });

  it("rejects a physically impossible facelet state", () => {
    const facelets = SOLVED_STATE.split("");
    [facelets[5], facelets[7]] = [facelets[7], facelets[5]];
    [facelets[10], facelets[19]] = [facelets[19], facelets[10]];

    expect(() => solveCFOPState(facelets.join(""))).toThrow(InvalidCubeStateError);
  });

  it("keeps scramble compatibility routed through the state engine", () => {
    const scramble = SCRAMBLES[1];
    const result = solveCFOP(scramble);

    expect(result.input.kind).toBe("scramble");
    expect(result.scrambledState).toBe(applyMoves(SOLVED_STATE, scramble));
    expect(result.solution.join(" ")).not.toBe(invertMoves(scramble).join(" "));
  });

  it("skips and protects F2L slots already solved after Cross", () => {
    const state = applyMoves(SOLVED_STATE, [
      "F", "U", "F'",
      "B", "U", "B'",
    ]);
    const initiallySolved = ALL_F2L_SLOTS.filter((slot) => isF2LSlotSolved(state, slot));
    expect(initiallySolved.length).toBeGreaterThan(0);
    expect(initiallySolved.length).toBeLessThan(4);

    const result = solveCFOPState(state);
    expect(result.cross.moves).toEqual([]);
    for (const slot of initiallySolved) {
      expect(result.f2l.solvedOrder).not.toContain(slot);
      for (const stage of result.f2l.stages) {
        expect(isF2LSlotSolved(stage.stateAfter, slot)).toBe(true);
      }
    }
  });

  it("keeps an F2L pair that the semantic Cross completes naturally", () => {
    const state = applyMoves(SOLVED_STATE, [
      "F'", "D2", "U2", "B", "D'", "R2", "D'", "F'", "D2", "F",
      "D'", "L", "F'", "R'", "L2", "B2", "R", "B", "F'", "D",
    ]);
    const result = solveCFOPState(state);
    const crossSolvedSlots = ALL_F2L_SLOTS.filter(
      (slot) => isF2LSlotSolved(result.cross.stateAfter, slot),
    );

    expect(countSolvedF2LSlots(state)).toBe(0);
    expect(crossSolvedSlots).toHaveLength(1);
    for (const slot of crossSolvedSlots) {
      expect(result.f2l.solvedOrder).not.toContain(slot);
      for (const stage of result.f2l.stages) {
        expect(isF2LSlotSolved(stage.stateAfter, slot)).toBe(true);
      }
    }
  });
});

describe("human execution path boundaries", () => {
  it("contains no prohibited solver imports or Cross/F2L state exploration", () => {
    const orchestrator = readFileSync(new URL("./cfop-solver.ts", import.meta.url), "utf8");
    const cross = readFileSync(new URL("./cross.ts", import.meta.url), "utf8");
    const f2l = readFileSync(new URL("./f2l.ts", import.meta.url), "utf8");
    const engine = `${orchestrator}\n${cross}\n${f2l}`;

    expect(engine).not.toMatch(/from\s+["'][^"']*cubejs/);
    expect(engine).not.toMatch(/from\s+["'][^"']*complete-solver/);
    expect(cross).not.toMatch(/getCrossPattern|crossDistances|searchedNodes/);
    expect(cross).not.toMatch(/CROSS_CASE_ALGORITHMS|PHASE_BOUNDARY_ADJUSTMENTS/);
    expect(f2l).not.toMatch(/SearchNode|visited|queue|searchedNodes/);
    expect(f2l).not.toMatch(/TOP_F2L_CASE_ALGORITHMS|getF2LPairKey/);
  });
});
