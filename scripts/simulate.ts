// scripts/simulate.ts

import {
  SOLVED_STATE,
  applyMoves,
  applySingleMove,
  serializeCubeState,
  isSolvedState,
  type Move,
} from "../src/lib/cube/cube";

// -----------------------------
// ユーティリティ
// -----------------------------

function parseMoves(input: string): Move[] {
  return input
    .trim()
    .split(/\s+/)
    .filter(Boolean) as Move[];
}

function printState(state: any) {
  console.log(JSON.stringify(state, null, 2));
}

// -----------------------------
// メイン処理
// -----------------------------

function runSimulation(moves: Move[], stepMode: boolean) {
  console.log("=================================");
  console.log("Moves:", moves.join(" "));
  console.log("=================================");

  let state = SOLVED_STATE;

  if (stepMode) {
    moves.forEach((move, i) => {
      state = applySingleMove(state, move);

      console.log(`\nStep ${i + 1}: ${move}`);
      console.log(serializeCubeState(state));
    });
  } else {
    state = applyMoves(state, moves);
  }

  console.log("\n--- FINAL ---");
  console.log("Serialized:", serializeCubeState(state));
  console.log("Is Solved:", isSolvedState(state));
}

// -----------------------------
// CLI入力処理
// -----------------------------

const args = process.argv.slice(2);

// 例:
// pnpm simulate "R U R' U'"
// pnpm simulate "R U R' U'" --step
// pnpm simulate --tperm

if (args.includes("--help")) {
  console.log(`
Usage:
  pnpm simulate "R U R' U'"
  pnpm simulate "R U R' U'" --step
  pnpm simulate --tperm

Options:
  --step     1手ずつ表示
  --tperm    T-perm ×2テスト
`);
  process.exit(0);
}

// -----------------------------
// T-permテスト
// -----------------------------

const tPerm: Move[] = [
  "R", "U", "R'", "U'",
  "R'", "F", "R2", "U'", "R'", "U'",
  "R", "U", "R'", "F'"
];

if (args.includes("--tperm")) {
  console.log("=== T-PERM x2 TEST ===");

  const result = applyMoves(SOLVED_STATE, [...tPerm, ...tPerm]);

  console.log("Serialized:", serializeCubeState(result));
  console.log("Is Solved:", isSolvedState(result));

  process.exit(0);
}

// -----------------------------
// 通常実行
// -----------------------------

const input = args.find((a) => !a.startsWith("--"));

if (!input) {
  console.log("❌ 手順を入力してください");
  console.log(`例: pnpm simulate "R U R' U'"`);
  process.exit(1);
}

const moves = parseMoves(input);
const stepMode = args.includes("--step");

runSimulation(moves, stepMode);