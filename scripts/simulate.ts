import {
  SOLVED_STATE,
  applyMoves,
  serializeCubeState,
  parseCubeState,
  CubeState,
  Move,
} from "../src/lib/cube/cube";

// ─────────────────────────────────────────────────────────────
// Move parsing
// ─────────────────────────────────────────────────────────────

function parseMoves(input: string): Move[] {
  return input.trim().split(/\s+/) as Move[];
}

// ─────────────────────────────────────────────────────────────
// CLI option parsing
// ─────────────────────────────────────────────────────────────

type OutputMode = "both" | "text" | "visual";

function parseMode(args: string[]): OutputMode {
  if (args.includes("--text-only")) return "text";
  if (args.includes("--visual-only")) return "visual";
  return "both";
}

// ─────────────────────────────────────────────────────────────
// Color mapping（実キューブ配色）
// ─────────────────────────────────────────────────────────────

const colorMap: Record<string, string> = {
  U: "\x1b[43m U \x1b[0m", // yellow
  F: "\x1b[41m F \x1b[0m", // red
  R: "\x1b[42m R \x1b[0m", // green
  L: "\x1b[44m L \x1b[0m", // blue
  D: "\x1b[47m D \x1b[0m", // white
  B: "\x1b[48;5;208m B \x1b[0m", // orange
};

function colorize(c: string): string {
  return colorMap[c] ?? ` ${c} `;
}

// ─────────────────────────────────────────────────────────────
// Cube Net Printer（視覚）
// ─────────────────────────────────────────────────────────────

function printCubeNet(state: CubeState) {
  const row = (face: string[], i: number) =>
    `${colorize(face[i])}${colorize(face[i + 1])}${colorize(face[i + 2])}`;

  const { U, R, F, D, L, B } = state;

  console.log("");

  // U
  console.log("        " + row(U, 0));
  console.log("        " + row(U, 3));
  console.log("        " + row(U, 6));

  console.log("");

  // L F R B
  for (let i = 0; i < 3; i++) {
    const o = i * 3;
    console.log(
      row(L, o) + " " +
      row(F, o) + " " +
      row(R, o) + " " +
      row(B, o)
    );
  }

  console.log("");

  // D
  console.log("        " + row(D, 0));
  console.log("        " + row(D, 3));
  console.log("        " + row(D, 6));

  console.log("");
}

// ─────────────────────────────────────────────────────────────
// Text output（AI・ログ用）
// ─────────────────────────────────────────────────────────────

function printTextOutput(state: CubeState) {
  console.log("\n▶ Result (string):");
  console.log(serializeCubeState(state));

  console.log("\n▶ Result (JSON):");
  console.log(JSON.stringify(state, null, 2));
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

function main() {
  const rawArgs = process.argv.slice(2);

  if (rawArgs.length === 0) {
    console.log("❌ 使用方法:");
    console.log('pnpm simulate "R U R\' U\'"');
    console.log('pnpm simulate "R U" --text-only');
    console.log('pnpm simulate "R U" --visual-only');
    process.exit(1);
  }

  const mode = parseMode(rawArgs);

  // フラグ除去
  const args = rawArgs.filter(
    (a) => a !== "--text-only" && a !== "--visual-only"
  );

  const moves = parseMoves(args[0]);

  let state: CubeState = SOLVED_STATE;

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

  // ── 出力切替 ──

  if (mode === "both" || mode === "text") {
    printTextOutput(result);
  }

  if (mode === "both" || mode === "visual") {
    console.log("\n▶ Cube Net (colored):");
    printCubeNet(result);
  }
}

main();