import { describe, expect, it } from "vitest";

import {
  applyMoves,
  SOLVED_STATE,
} from "../cube/moves";

import {
  getCrossCanonicalRuleCount,
} from "./cross";

import { getCanonicalF2LCaseCount, registeredF2LCases } from "./f2l";

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
  it("contains the semantic Cross rule set", () => {
    expect(getCrossCanonicalRuleCount()).toBe(6);
  });

  it("contains one canonical 41-case F2L registry", () => {
    expect(getCanonicalF2LCaseCount()).toBe(41);
    expect(new Set(registeredF2LCases.map((entry) => entry.id)).size).toBe(41);
    expect(registeredF2LCases.filter((entry) => entry.category === "top-layer-pair")).toHaveLength(24);
    expect(registeredF2LCases.filter((entry) => entry.category === "corner-in-slot")).toHaveLength(6);
    expect(registeredF2LCases.filter((entry) => entry.category === "edge-in-slot")).toHaveLength(6);
    expect(registeredF2LCases.filter((entry) => entry.category === "both-in-slot")).toHaveLength(5);
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
