import {
  SOLVED_STATE,
  applyMoves,
  serializeCubeState,
  parseCubeState,
  CubeState,
  Move,
} from "../src/lib/cube/cube";

/**
 * CLI:
 * pnpm simulate "R U R' U'"
 * pnpm simulate "R U" "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"
 */

// ─────────────────────────────────────────────────────────────
// Move parsing
// ─────────────────────────────────────────────────────────────

function parseMoves(input: string): Move[] {
  return input.trim().split(/\s+/) as Move[];
}

// ─────────────────────────────────────────────────────────────
// Color mapping (ANSI)
// ─────────────────────────────────────────────────────────────

const colorMap: Record<string, string> = {
  U: "\x1b[47m U \x1b[0m", // white
  R: "\x1b[41m R \x1b[0m", // red
  F: "\x1b[42m F \x1b[0m", // green
  D: "\x1b[43m D \x1b[0m", // yellow
  L: "\x1b[45m L \x1b[0m", // magenta
  B: "\x1b[44m B \x1b[0m", // blue
};

// fallback（万一）
function colorize(c: string): string {
  return colorMap[c] ?? ` ${c} `;
}

// ─────────────────────────────────────────────────────────────
// Cube Net Printer
// ─────────────────────────────────────────────────────────────

function printCubeNet(state: CubeState) {
  const row = (face: string[], i: number) =>
    `${colorize(face[i])}${colorize(face[i + 1])}${colorize(face[i + 2])}`;

  const U = state.U;
  const R = state.R;
  const F = state.F;
  const D = state.D;
  const L = state.L;
  const B = state.B;

  console.log("");

  // ── U face ──
  console.log("        " + row(U, 0));
  console.log("        " + row(U, 3));
  console.log("        " + row(U, 6));

  console.log("");

  // ── L F R B ──
  for (let i = 0; i < 3; i++) {
    const offset = i * 3;
    console.log(
      row(L, offset) + " " +
      row(F, offset) + " " +
      row(R, offset) + " " +
      row(B, offset)
    );
  }

  console.log("");

  // ── D face ──
  console.log("        " + row(D, 0));
  console.log("        " + row(D, 3));
  console.log("        " + row(D, 6));

  console.log("");
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("❌ 使用方法:");
    console.log('pnpm simulate "R U R\' U\'"');
    console.log(
      'pnpm simulate "R U" "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"'
    );
    process.exit(1);
  }

  const moves = parseMoves(args[0]);

  let state: CubeState = SOLVED_STATE;

  // 初期状態指定
  if (args[1]) {
    try {
      state = parseCubeState(args[1]);
    } catch (e) {
      console.error("❌ 初期状態が不正:", e);
      process.exit(1);
    }
  }

  console.log("▶ Moves:", moves.join(" "));

  const result = applyMoves(state, moves);

  // ── 出力 ──

  console.log("\n▶ Result (string):");
  console.log(serializeCubeState(result));

  console.log("\n▶ Result (JSON):");
  console.log(JSON.stringify(result, null, 2));

  console.log("\n▶ Cube Net (colored):");
  printCubeNet(result);
}

main();