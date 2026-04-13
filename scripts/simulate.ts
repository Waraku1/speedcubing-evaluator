// scripts/simulate.ts

import {
  SOLVED_STATE,
  applyMoves,
  applySingleMove,
  serializeCubeState,
  isSolvedState,
} from "../src/lib/cube/cube";

// -----------------------------
// 入力（ここを自由に変える）
// -----------------------------

// 例①：sexy move
const moves1 = ["R", "U", "R'", "U'"];

// 例②：T-perm
const tPerm = [
  "R", "U", "R'", "U'",
  "R'", "F", "R2", "U'", "R'", "U'",
  "R", "U", "R'", "F'"
];

// -----------------------------
// 実行関数
// -----------------------------

function runSimulation(moves: string[]) {
  console.log("=================================");
  console.log("Moves:", moves.join(" "));
  console.log("=================================");

  let state = SOLVED_STATE;

  moves.forEach((move, i) => {
    state = applySingleMove(state, move as any);

    console.log(`\nStep ${i + 1}: ${move}`);
    console.log(serializeCubeState(state));
  });

  console.log("\n--- FINAL ---");
  console.log("Serialized:", serializeCubeState(state));
  console.log("Is Solved:", isSolvedState(state));
}

// -----------------------------
// 実行
// -----------------------------

// 単発テスト
runSimulation(moves1);

// T-perm × 2（バグ検証）
console.log("\n\n=== T-PERM x2 TEST ===");

const result = applyMoves(SOLVED_STATE, [...tPerm, ...tPerm]);

console.log("Result:", serializeCubeState(result));
console.log("Is Solved:", isSolvedState(result));