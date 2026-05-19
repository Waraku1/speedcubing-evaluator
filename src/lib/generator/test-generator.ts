import {
  SOLVED_STATE,
  applyMoves,
  type Move,
} from "../cube/cube";

import {
  generateSolutions,
  verifySolution,
} from "./generator";

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

const NUMBER_OF_SOLUTIONS = 10;

// ─────────────────────────────────────────────────────────────
// Scramble
// ─────────────────────────────────────────────────────────────

const scramble: Move[] = [
  "R", "U", "R'", "U'",
  "F2", "L", "D'",
  "B2", "R2", "U",
  "F", "L2", "D",
  "R", "B'", "U2",
  "L'", "F2", "D2",
];

// ─────────────────────────────────────────────────────────────
// Create scrambled state
// ─────────────────────────────────────────────────────────────

const scrambled = applyMoves(
  SOLVED_STATE,
  scramble
);

// ─────────────────────────────────────────────────────────────
// Generate solutions
// ─────────────────────────────────────────────────────────────

const results =
  generateSolutions(
    scrambled,
    NUMBER_OF_SOLUTIONS
  );

// ─────────────────────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────────────────────

console.log("");

console.log("scramble:");
console.log(scramble);

console.log("");

console.log(
  `requested solutions: ${NUMBER_OF_SOLUTIONS}`
);

console.log(
  `generated solutions: ${results.length}`
);

console.log("");

results.forEach(
  (
    result,
    index
  ) => {

    console.log(
      `solution ${index + 1}:`
    );

    console.log(
      result.solution
    );

    console.log(
      `length: ${result.normalizedLength}`
    );

    console.log(
      "verified:"
    );

    console.log(
      verifySolution(
        scrambled,
        result.solution
      )
    );

    console.log("");
  }
);