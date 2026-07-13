import { describe, expect, it } from "vitest";

import {
  getDirectOLLStateCount,
  getDirectPLLStateCount,
  getMaximumOLLHTM,
  getMaximumPLLHTM,
} from "./oll-pll";

import {
  solveCFOPFromString,
  verifySolveResult,
} from "./cfop-solver";

import { SOLVED_STATE } from "../cube/moves";

describe("direct OLL/PLL efficiency", () => {
  it("keeps complete finite coverage while preferring direct cases", () => {
    expect(getDirectOLLStateCount()).toBeGreaterThanOrEqual(140);
    expect(getDirectPLLStateCount()).toBeGreaterThanOrEqual(270);
    expect(getMaximumOLLHTM()).toBeLessThanOrEqual(21);
    expect(getMaximumPLLHTM()).toBeLessThanOrEqual(24);
  });

  it("shortens the demonstrated PLL-heavy solve", () => {
    const result = solveCFOPFromString(
      "R U R' U' F2 L D2 B' U R2",
    );

    expect(result.stateAfter).toBe(SOLVED_STATE);
    expect(verifySolveResult(result)).toBe(true);
    expect(result.pll.depth).toBeLessThanOrEqual(17);
    expect(result.totalHTM).toBeLessThanOrEqual(65);
  });
});
