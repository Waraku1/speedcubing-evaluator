import { describe, expect, it } from "vitest";

import {
  formatSolveResult,
  solveCFOPFromString,
  verifySolveResult,
} from "./cfop-solver";

import { SOLVED_STATE } from "../cube/moves";

const DEFAULT_SCRAMBLE =
  "U' L' U2 L U' L' U' L F U' F' F2 B";

describe("CFOP manual run", () => {
  it("prints an actual CFOP solution", () => {
    const scramble = process.env.SCRAMBLE?.trim() || DEFAULT_SCRAMBLE;

    const result = solveCFOPFromString(scramble);

    console.log("\n");
    console.log(formatSolveResult(result));
    console.log("");

    expect(result.stateAfter).toBe(SOLVED_STATE);
    expect(verifySolveResult(result)).toBe(true);
  });
});