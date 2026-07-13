import { describe, expect, it } from "vitest";

import {
  SOLVED_STATE,
  type Move,
} from "../cube/moves";

import {
  solveCFOP,
  verifySolveResult,
} from "./cfop-solver";

const MOVES: readonly Move[] = [
  "U", "U'", "U2",
  "R", "R'", "R2",
  "F", "F'", "F2",
  "D", "D'", "D2",
  "L", "L'", "L2",
  "B", "B'", "B2",
];

function makeRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function generateScramble(random: () => number, length: number): Move[] {
  const result: Move[] = [];
  let previousFace = "";

  while (result.length < length) {
    const move = MOVES[Math.floor(random() * MOVES.length)];
    if (move[0] === previousFace) continue;
    result.push(move);
    previousFace = move[0];
  }

  return result;
}

describe("solveCFOP — deterministic random stress", () => {
  it("solves 50 deterministic 20-move scrambles", () => {
    const random = makeRandom(0x5eedc0de);

    for (let index = 0; index < 50; index++) {
      const scramble = generateScramble(random, 20);
      const result = solveCFOP(scramble);

      expect(result.stateAfter, `scramble ${index}: ${scramble.join(" ")}`).toBe(
        SOLVED_STATE,
      );
      expect(
        verifySolveResult(result),
        `verification ${index}: ${scramble.join(" ")}`,
      ).toBe(true);
    }
  }, 30_000);
});
