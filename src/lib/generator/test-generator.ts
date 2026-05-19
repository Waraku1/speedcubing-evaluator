import {
  SOLVED_STATE,
  applyMoves,
  type Move,
} from "../cube/cube";

import {
  generateSolution,
  verifySolution,
} from "./generator";

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