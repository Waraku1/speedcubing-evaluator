import { describe, expect, it } from "vitest";

import {
  applyMove,
  applyMoves,
  invertMoves,
  SOLVED_STATE,
  type CubeState,
  type Move,
} from "./moves";

const FACES: readonly Move[] = ["U", "R", "F", "D", "L", "B"];

const EDGE_POSITIONS: readonly (readonly [number, number])[] = [
  [7, 19], [5, 10], [1, 46], [3, 37],
  [23, 12], [21, 41], [48, 14], [50, 39],
  [28, 25], [32, 16], [34, 52], [30, 43],
];

const CORNER_POSITIONS: readonly (readonly [number, number, number])[] = [
  [8, 9, 20], [6, 18, 38], [2, 11, 45], [0, 36, 47],
  [29, 15, 26], [27, 24, 44], [35, 17, 51], [33, 42, 53],
];

function sortedColors(state: CubeState, indices: readonly number[]): string {
  return indices.map((index) => state[index]).sort().join("");
}

const LEGAL_EDGES = new Set(
  EDGE_POSITIONS.map((indices) => sortedColors(SOLVED_STATE, indices)),
);

const LEGAL_CORNERS = new Set(
  CORNER_POSITIONS.map((indices) => sortedColors(SOLVED_STATE, indices)),
);

function expectPhysicalCubies(state: CubeState): void {
  const edges = EDGE_POSITIONS.map((indices) => sortedColors(state, indices));
  const corners = CORNER_POSITIONS.map((indices) => sortedColors(state, indices));

  expect(new Set(edges).size).toBe(12);
  expect(new Set(corners).size).toBe(8);

  for (const edge of edges) expect(LEGAL_EDGES.has(edge), `illegal edge ${edge}`).toBe(true);
  for (const corner of corners) expect(LEGAL_CORNERS.has(corner), `illegal corner ${corner}`).toBe(true);
}

describe("moves.ts — physical cube invariants", () => {
  it.each(FACES)("%s quarter-turn preserves real cubies", (move) => {
    expectPhysicalCubies(applyMove(SOLVED_STATE, move));
  });

  it("preserves cubies under a mixed composition", () => {
    const sequence: Move[] = [
      "U'", "L'", "U2", "L", "U'", "L'", "U'", "L",
      "F", "U'", "F'", "F2", "B", "R", "D2", "B'",
    ];
    expectPhysicalCubies(applyMoves(SOLVED_STATE, sequence));
  });

  it.each(FACES)("%s^4 is identity", (move) => {
    expect(applyMoves(SOLVED_STATE, [move, move, move, move])).toBe(SOLVED_STATE);
  });

  it("sequence followed by its inverse is identity", () => {
    const sequence: Move[] = ["R", "U2", "F'", "L", "B2", "D", "R'"];
    expect(applyMoves(SOLVED_STATE, [...sequence, ...invertMoves(sequence)])).toBe(SOLVED_STATE);
  });

  it("the sexy move has order 6", () => {
    const sexy: Move[] = ["R", "U", "R'", "U'"];
    const six = Array.from({ length: 6 }, () => sexy).flat();
    expect(applyMoves(SOLVED_STATE, six)).toBe(SOLVED_STATE);
  });
});
