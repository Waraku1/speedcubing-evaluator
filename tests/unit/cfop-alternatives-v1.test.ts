import { describe, expect, it } from "vitest";

import {
  solveCFOPAlternativesFromState,
  solveCFOPFromState,
  verifyStateSolveResult,
} from "../../src/lib/cfop-solver/cfop-solver";
import {
  solveCross,
  solveCrossCandidates,
} from "../../src/lib/cfop-solver/cross";
import {
  ALL_F2L_SLOTS,
  countSolvedF2LSlots,
  isAlignedCrossSolved,
  isF2LSolved,
  isF2LSlotSolved,
} from "../../src/lib/cfop-solver/detection";
import { solveF2L } from "../../src/lib/cfop-solver/f2l";
import { applyMoves, SOLVED_STATE } from "../../src/lib/cube/moves";
import { CFOPAlternativesServiceV1 } from "../../src/lib/integration/CFOPAlternativesServiceV1";
import {
  parseCFOPAlternativesResponseV1,
  serializeCFOPAlternativesRequestV1,
} from "../../src/lib/ui/cfopAlternativesCube";

const REPRESENTATIVE = applyMoves(SOLVED_STATE, ["R", "U"]);

describe("bounded verified CFOP alternative generation", () => {
  it("keeps the canonical result first and returns distinct verified solutions", () => {
    const canonical = solveCFOPFromState(REPRESENTATIVE);
    const alternatives = solveCFOPAlternativesFromState(REPRESENTATIVE, 4);

    expect(alternatives[0]).toEqual({ strategy: "DEFAULT", result: canonical });
    expect(alternatives.length).toBeGreaterThanOrEqual(2);
    expect(alternatives.length).toBeLessThanOrEqual(4);
    expect(new Set(
      alternatives.map((candidate) => candidate.result.solution.join(" ")),
    ).size).toBe(alternatives.length);

    for (const candidate of alternatives) {
      expect(verifyStateSolveResult(candidate.result)).toBe(true);
      expect(applyMoves(REPRESENTATIVE, candidate.result.solution)).toBe(SOLVED_STATE);
    }
  });

  it("is deterministic and never pads a solved input", () => {
    const first = solveCFOPAlternativesFromState(REPRESENTATIVE, 3);
    const second = solveCFOPAlternativesFromState(REPRESENTATIVE, 3);
    expect(second.map((candidate) => ({
      strategy: candidate.strategy,
      moves: candidate.result.solution,
    }))).toEqual(first.map((candidate) => ({
      strategy: candidate.strategy,
      moves: candidate.result.solution,
    })));

    const solved = solveCFOPAlternativesFromState(SOLVED_STATE, 4);
    expect(solved).toHaveLength(1);
    expect(solved[0].result.solution).toEqual([]);
  });

  it.each([1, 2, 3, 4])("never exceeds requested solver bound %i", (limit) => {
    expect(solveCFOPAlternativesFromState(REPRESENTATIVE, limit).length)
      .toBeLessThanOrEqual(limit);
  });
});

describe("bounded Cross candidate enumeration", () => {
  it("is phase-safe, distinct, bounded, and deterministic", () => {
    const first = solveCrossCandidates(REPRESENTATIVE, 4);
    const second = solveCrossCandidates(REPRESENTATIVE, 4);

    expect(first.length).toBeGreaterThanOrEqual(2);
    expect(first.length).toBeLessThanOrEqual(4);
    expect(first[0].moves).toEqual(solveCross(REPRESENTATIVE).moves);
    expect(second.map((candidate) => candidate.moves)).toEqual(
      first.map((candidate) => candidate.moves),
    );
    expect(new Set(first.map((candidate) => candidate.moves.join(" "))).size)
      .toBe(first.length);

    for (const candidate of first) {
      expect(isAlignedCrossSolved(candidate.stateAfter).solved).toBe(true);
      expect(countSolvedF2LSlots(candidate.stateAfter)).toBeLessThanOrEqual(
        countSolvedF2LSlots(REPRESENTATIVE),
      );
      expect(candidate.depth).toBe(first[0].depth);
    }
  });
});

describe("optional F2L first-slot strategy", () => {
  it("leaves default behavior unchanged and protects completed slots", () => {
    const crossState = solveCFOPFromState(REPRESENTATIVE).cross.stateAfter;
    const defaultResult = solveF2L(crossState);
    expect(solveF2L(crossState, {})).toEqual(defaultResult);

    const protectedSlots = ALL_F2L_SLOTS.filter(
      (slot) => isF2LSlotSolved(crossState, slot),
    );
    const forced = solveF2L(crossState, { firstSlot: "FR" });

    expect(forced.solvedOrder[0]).toBe("FR");
    expect(isAlignedCrossSolved(forced.stateAfter).solved).toBe(true);
    expect(isF2LSolved(forced.stateAfter).solved).toBe(true);
    for (const stage of forced.stages) {
      for (const slot of protectedSlots) {
        expect(isF2LSlotSolved(stage.stateAfter, slot)).toBe(true);
      }
    }
  });
});

describe("CFOP alternatives public contract", () => {
  it("serializes and parses a closed independently verified response", () => {
    const request = serializeCFOPAlternativesRequestV1(REPRESENTATIVE, 3);
    expect(request).toEqual({
      schemaVersion: "1.0",
      inputMode: "FACELET_STATE",
      cubeState: {
        format: "URFDLB_FACELETS_V1",
        facelets: REPRESENTATIVE,
      },
      maxAlternatives: 3,
    });

    const result = new CFOPAlternativesServiceV1({
      now: () => 10,
    }).execute(request);
    expect(parseCFOPAlternativesResponseV1(result, true)).toEqual(result);
    expect(result.generatedCount).toBeGreaterThanOrEqual(2);
    expect(result.alternatives[0].strategy).toBe("DEFAULT");
  });
});
