import {
  SOLVED_STATE,
  applyMoves,
  type Move,
} from "../cube";

import {
  generateSolution,
  verifySolution,
} from "./generator";

// ─────────────────────────────────────────────────────────────
// Scramble
// ─────────────────────────────────────────────────────────────

const scramble: Move[] = [
  "R",
  "U",
  "R'",
  "U'",
  "F2",
];

// ─────────────────────────────────────────────────────────────
// Create scrambled state
// ─────────────────────────────────────────────────────────────

const scrambled = applyMoves(
  SOLVED_STATE,
  scramble
);

// ─────────────────────────────────────────────────────────────
// Solve
// ─────────────────────────────────────────────────────────────

const result = generateSolution(
  scrambled
);

// ─────────────────────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────────────────────

console.log("scramble:");
console.log(scramble);

console.log("");

console.log("solution:");
console.log(result.solution);

console.log("");

console.log("verified:");
console.log(
  verifySolution(
    scrambled,
    result.solution
  )
);