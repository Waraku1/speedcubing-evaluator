import { describe, expect, it } from "vitest";

import {
  applyMoves,
  SOLVED_STATE,
} from "../cube/moves";

import {
  getCrossCaseTableSize,
} from "./cross";

import { getTopF2LCaseTableSize } from "./f2l";

import {
  getOLLLookupSize,
  getPLLLookupSize,
  registeredOLLMacros,
  registeredPLLMacros,
} from "./oll-pll";

import {
  isF2LSolved,
  isOLLSolved,
} from "./detection";

describe("CFOP finite phase coverage", () => {
  it("contains finite protected-edge Cross actions", () => {
    expect(getCrossCaseTableSize()).toBe(672);
  });

  it("contains the 24 normalized top-pair cases for each slot and AUF", () => {
    expect(getTopF2LCaseTableSize()).toBe(4 * 24 * 4);
  });

  it("contains all 216 OLL orientations", () => {
    expect(getOLLLookupSize()).toBe(216);
  });

  it("contains all 288 PLL permutations", () => {
    expect(getPLLLookupSize()).toBe(288);
  });

  it("every registered OLL macro preserves F2L", () => {
    for (const macro of registeredOLLMacros) {
      const state = applyMoves(SOLVED_STATE, macro.moves);
      expect(isF2LSolved(state).solved, macro.id).toBe(true);
    }
  });

  it("every registered PLL macro preserves F2L and OLL", () => {
    for (const macro of registeredPLLMacros) {
      const state = applyMoves(SOLVED_STATE, macro.moves);
      expect(isF2LSolved(state).solved, macro.id).toBe(true);
      expect(isOLLSolved(state), macro.id).toBe(true);
    }
  });
});
