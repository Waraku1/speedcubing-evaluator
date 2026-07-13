/**
 * cfop-solver.ts — physically validated human-style CFOP orchestrator
 *
 * Pipeline:
 *   optimal aligned Cross
 *   → four genuine F2L stages
 *   → finite-macro 2-look OLL
 *   → finite-macro PLL
 *
 * This file never imports cubejs or complete-solver.ts.
 */

import {
  applyMoves,
  countHTM,
  countQTM,
  parseMoveString,
  SOLVED_STATE,
  type CubeState,
  type Move,
} from "../cube/moves";

import {
  ALL_F2L_SLOTS,
  countSolvedF2LSlots,
  getCFOPProgress,
  isAlignedCrossSolved,
  isF2LSolved,
  isF2LSlotSolved,
  isOLLSolved,
  isPLLSolved,
  type F2LSlot,
} from "./detection";

import {
  solveCross,
  type CrossResult,
} from "./cross";

import {
  solveF2L,
  type F2LResult,
} from "./f2l";

import {
  solveOLL,
  solvePLL,
  type OLLResult,
  type PLLResult,
} from "./oll-pll";

export type CFOPPhase = "cross" | "f2l" | "oll" | "pll";

export type PhaseResult = {
  phase: CFOPPhase;
  moves: Move[];
  htm: number;
  qtm: number;
  stateBefore: CubeState;
  stateAfter: CubeState;
};

export type CFOPSolveResult = {
  scramble: Move[];
  scrambledState: CubeState;

  cross: CrossResult;
  f2l: F2LResult;
  oll: OLLResult;
  pll: PLLResult;

  phases: {
    cross: PhaseResult;
    f2l: PhaseResult & {
      slotMoves: Record<F2LSlot, Move[]>;
      solvedOrder: F2LSlot[];
    };
    oll: PhaseResult;
    pll: PhaseResult;
  };

  solution: Move[];
  totalHTM: number;
  totalQTM: number;

  solvedState: CubeState;
  stateAfter: CubeState;
  progress: ReturnType<typeof getCFOPProgress>;
};

export type SolveResult = CFOPSolveResult;


const VALID_MOVES = new Set<string>([
  "U", "U'", "U2",
  "R", "R'", "R2",
  "F", "F'", "F2",
  "D", "D'", "D2",
  "L", "L'", "L2",
  "B", "B'", "B2",
]);

function validateMoveArray(
  moves: readonly Move[],
  label: string,
): Move[] {
  if (!Array.isArray(moves)) {
    throw new TypeError(
      `[cfop-solver] ${label} must be an array of moves; ` +
        `use solveCFOPFromString for string input`,
    );
  }

  const result: Move[] = [];

  for (let index = 0; index < moves.length; index++) {
    const move = moves[index] as unknown;

    if (typeof move !== "string" || !VALID_MOVES.has(move)) {
      throw new TypeError(
        `[cfop-solver] ${label}[${index}] is not a valid move: ${String(move)}`,
      );
    }

    result.push(move as Move);
  }

  return result;
}

function makePhase(
  phase: CFOPPhase,
  stateBefore: CubeState,
  moves: readonly Move[],
): PhaseResult {
  return {
    phase,
    moves: [...moves],
    htm: countHTM(moves),
    qtm: countQTM(moves),
    stateBefore,
    stateAfter: applyMoves(stateBefore, moves),
  };
}

function assertSameState(
  actual: CubeState,
  expected: CubeState,
  label: string,
): void {
  if (actual !== expected) {
    throw new Error(`[cfop-solver] ${label}: reported stateAfter does not match moves`);
  }
}


function assertCrossPhase(
  before: CubeState,
  after: CubeState,
): void {
  const status = isAlignedCrossSolved(after);

  if (!status.solved) {
    throw new Error(
      `[cfop-solver] Cross incomplete: ${status.unsolved.join(", ")}`,
    );
  }

  const beforeSlots = countSolvedF2LSlots(before);
  const afterSlots = countSolvedF2LSlots(after);

  if (afterSlots > beforeSlots) {
    throw new Error(
      `[cfop-solver] Cross performed F2L work: ${beforeSlots} -> ${afterSlots}`,
    );
  }
}
function assertF2LStages(
  beforeF2L: CubeState,
  result: F2LResult,
): void {
  let currentState = beforeF2L;

  const initiallySolved = ALL_F2L_SLOTS.filter(
    (slot) => isF2LSlotSolved(beforeF2L, slot),
  );
  const initiallyUnsolved = ALL_F2L_SLOTS.filter(
    (slot) => !isF2LSlotSolved(beforeF2L, slot),
  );
  const completed = new Set<F2LSlot>(initiallySolved);

  if (result.stages.length !== initiallyUnsolved.length) {
    throw new Error(
      `[cfop-solver] F2L stage count mismatch: ` +
        `expected ${initiallyUnsolved.length}, got ${result.stages.length}`,
    );
  }

  if (result.stages.length !== result.solvedOrder.length) {
    throw new Error(`[cfop-solver] F2L stage/order length mismatch`);
  }

  const uniqueOrder = new Set(result.solvedOrder);
  if (uniqueOrder.size !== result.solvedOrder.length) {
    throw new Error(`[cfop-solver] F2L solvedOrder contains duplicates`);
  }

  for (const slot of initiallyUnsolved) {
    if (!uniqueOrder.has(slot)) {
      throw new Error(`[cfop-solver] F2L did not record unsolved slot ${slot}`);
    }
  }

  const reproducedMoves: Move[] = [];

  for (let index = 0; index < result.stages.length; index++) {
    const stage = result.stages[index];
    const expectedSlot = result.solvedOrder[index];

    if (stage.slot !== expectedSlot) {
      throw new Error(
        `[cfop-solver] F2L stage ${index} slot mismatch: ` +
          `${stage.slot}/${expectedSlot}`,
      );
    }

    if (completed.has(stage.slot)) {
      throw new Error(
        `[cfop-solver] F2L attempted to solve ${stage.slot} more than once`,
      );
    }

    if (stage.moves.length === 0) {
      throw new Error(`[cfop-solver] ${stage.slot} was recorded without moves`);
    }

    if (stage.stateBefore !== currentState) {
      throw new Error(`[cfop-solver] ${stage.slot} stateBefore mismatch`);
    }

    const solvedCountBefore = countSolvedF2LSlots(currentState);
    const nextState = applyMoves(currentState, stage.moves);

    if (nextState !== stage.stateAfter) {
      throw new Error(`[cfop-solver] ${stage.slot} stateAfter mismatch`);
    }

    if (!isAlignedCrossSolved(nextState).solved) {
      throw new Error(`[cfop-solver] ${stage.slot} broke the aligned Cross`);
    }

    for (const protectedSlot of completed) {
      if (!isF2LSlotSolved(nextState, protectedSlot)) {
        throw new Error(
          `[cfop-solver] ${stage.slot} broke completed slot ${protectedSlot}`,
        );
      }
    }

    if (!isF2LSlotSolved(nextState, stage.slot)) {
      throw new Error(`[cfop-solver] recorded moves did not solve ${stage.slot}`);
    }

    const solvedCountAfter = countSolvedF2LSlots(nextState);
    if (solvedCountAfter !== solvedCountBefore + 1) {
      throw new Error(
        `[cfop-solver] ${stage.slot} did not add exactly one F2L slot: ` +
          `${solvedCountBefore} -> ${solvedCountAfter}`,
      );
    }

    const recordedSlotMoves = result.slotMoves[stage.slot];
    if (recordedSlotMoves.join(" ") !== stage.moves.join(" ")) {
      throw new Error(`[cfop-solver] ${stage.slot} slotMoves mismatch`);
    }

    reproducedMoves.push(...stage.moves);
    completed.add(stage.slot);
    currentState = nextState;
  }

  if (reproducedMoves.join(" ") !== result.moves.join(" ")) {
    throw new Error(`[cfop-solver] F2L stages do not reproduce result.moves`);
  }

  if (currentState !== result.stateAfter) {
    throw new Error(`[cfop-solver] F2L stages do not reproduce stateAfter`);
  }

  if (!isAlignedCrossSolved(currentState).solved) {
    throw new Error(`[cfop-solver] F2L final state broke the aligned Cross`);
  }

  if (!isF2LSolved(currentState).solved) {
    throw new Error(`[cfop-solver] F2L stages did not finish all four slots`);
  }
}


function assertOLLPhase(before: CubeState, after: CubeState): void {
  if (!isF2LSolved(before).solved) {
    throw new Error(`[cfop-solver] OLL started before F2L completion`);
  }

  if (!isF2LSolved(after).solved) {
    throw new Error(`[cfop-solver] OLL broke F2L`);
  }

  if (!isOLLSolved(after)) {
    throw new Error(`[cfop-solver] OLL did not orient the U face`);
  }
}

function assertPLLPhase(before: CubeState, after: CubeState): void {
  if (!isF2LSolved(before).solved || !isOLLSolved(before)) {
    throw new Error(`[cfop-solver] PLL started before F2L/OLL completion`);
  }

  if (after !== SOLVED_STATE || !isPLLSolved(after)) {
    throw new Error(`[cfop-solver] PLL did not reach SOLVED_STATE`);
  }
}

export function solveCFOP(scramble: readonly Move[]): CFOPSolveResult {
  const scrambleMoves = validateMoveArray(scramble, "scramble");
  const scrambledState = applyMoves(SOLVED_STATE, scrambleMoves);

  const cross = solveCross(scrambledState);
  const crossPhase = makePhase("cross", scrambledState, cross.moves);
  assertSameState(crossPhase.stateAfter, cross.stateAfter, "Cross");
  assertCrossPhase(scrambledState, crossPhase.stateAfter);

  const f2l = solveF2L(crossPhase.stateAfter);
  const f2lBasePhase = makePhase("f2l", crossPhase.stateAfter, f2l.moves);
  assertSameState(f2lBasePhase.stateAfter, f2l.stateAfter, "F2L");
  assertF2LStages(crossPhase.stateAfter, f2l);

  const oll = solveOLL(f2lBasePhase.stateAfter);
  const ollPhase = makePhase("oll", f2lBasePhase.stateAfter, oll.moves);
  assertSameState(ollPhase.stateAfter, oll.stateAfter, "OLL");
  assertOLLPhase(f2lBasePhase.stateAfter, ollPhase.stateAfter);

  const pll = solvePLL(ollPhase.stateAfter);
  const pllPhase = makePhase("pll", ollPhase.stateAfter, pll.moves);
  assertSameState(pllPhase.stateAfter, pll.stateAfter, "PLL");
  assertPLLPhase(ollPhase.stateAfter, pllPhase.stateAfter);

  const solution: Move[] = [
    ...cross.moves,
    ...f2l.moves,
    ...oll.moves,
    ...pll.moves,
  ];

  const solvedState = applyMoves(scrambledState, solution);
  if (solvedState !== SOLVED_STATE) {
    throw new Error(`[cfop-solver] complete solution did not solve the cube`);
  }

  const f2lPhase: CFOPSolveResult["phases"]["f2l"] = {
    ...f2lBasePhase,
    slotMoves: f2l.slotMoves,
    solvedOrder: f2l.solvedOrder,
  };

  return {
    scramble: scrambleMoves,
    scrambledState,

    cross,
    f2l,
    oll,
    pll,

    phases: {
      cross: crossPhase,
      f2l: f2lPhase,
      oll: ollPhase,
      pll: pllPhase,
    },

    solution,
    totalHTM: countHTM(solution),
    totalQTM: countQTM(solution),

    solvedState,
    stateAfter: solvedState,
    progress: getCFOPProgress(solvedState),
  };
}

export function solveCFOPFromString(scramble: string): CFOPSolveResult {
  return solveCFOP(parseMoveString(scramble));
}


export function verifySolveResult(result: CFOPSolveResult): boolean {
  try {
    const expectedSolution: Move[] = [
      ...result.phases.cross.moves,
      ...result.phases.f2l.moves,
      ...result.phases.oll.moves,
      ...result.phases.pll.moves,
    ];

    if (expectedSolution.join(" ") !== result.solution.join(" ")) {
      return false;
    }

    if (countHTM(result.solution) !== result.totalHTM) {
      return false;
    }

    if (countQTM(result.solution) !== result.totalQTM) {
      return false;
    }

    const expectedScrambledState = applyMoves(SOLVED_STATE, result.scramble);
    if (expectedScrambledState !== result.scrambledState) {
      return false;
    }

    const crossState = applyMoves(
      result.scrambledState,
      result.phases.cross.moves,
    );

    if (crossState !== result.phases.cross.stateAfter) return false;
    if (result.phases.cross.stateBefore !== result.scrambledState) return false;
    assertCrossPhase(result.scrambledState, crossState);

    const f2lState = applyMoves(crossState, result.phases.f2l.moves);
    if (f2lState !== result.phases.f2l.stateAfter) return false;
    if (result.phases.f2l.stateBefore !== crossState) return false;
    assertF2LStages(crossState, result.f2l);

    const ollState = applyMoves(f2lState, result.phases.oll.moves);
    if (ollState !== result.phases.oll.stateAfter) return false;
    if (result.phases.oll.stateBefore !== f2lState) return false;
    assertOLLPhase(f2lState, ollState);

    const pllState = applyMoves(ollState, result.phases.pll.moves);
    if (pllState !== result.phases.pll.stateAfter) return false;
    if (result.phases.pll.stateBefore !== ollState) return false;
    assertPLLPhase(ollState, pllState);

    const finalState = applyMoves(result.scrambledState, result.solution);

    return (
      finalState === SOLVED_STATE &&
      result.solvedState === SOLVED_STATE &&
      result.stateAfter === SOLVED_STATE &&
      result.progress.pll.solved
    );
  } catch {
    return false;
  }
}

export function formatMoves(moves: readonly Move[]): string {
  return moves.length === 0 ? "(none)" : moves.join(" ");
}

export function formatSolveResult(result: CFOPSolveResult): string {
  const lines: string[] = [];

  lines.push("── CFOP 解法 ──────────────────────────────");
  lines.push(`Scramble : ${formatMoves(result.scramble)}`);
  lines.push("");
  lines.push(
    `Cross : ${formatMoves(result.phases.cross.moves)}  ` +
      `(${result.phases.cross.htm}手, PDB=${result.cross.pdbDistance})`,
  );
  lines.push(
    `F2L   : ${formatMoves(result.phases.f2l.moves)}  ` +
      `(${result.phases.f2l.htm}手)`,
  );
  lines.push("F2L slots:");

  for (const slot of ALL_F2L_SLOTS) {
    lines.push(`  ${slot}: ${formatMoves(result.phases.f2l.slotMoves[slot])}`);
  }

  lines.push(
    `F2L order: ${result.phases.f2l.solvedOrder.join(" -> ") || "(none)"}`,
  );
  lines.push(
    `OLL   : ${formatMoves(result.phases.oll.moves)}  ` +
      `(${result.phases.oll.htm}手)`,
  );
  lines.push(`  OLL macros: ${result.oll.algorithmIds.join(" -> ") || "skip"}`);
  lines.push(
    `PLL   : ${formatMoves(result.phases.pll.moves)}  ` +
      `(${result.phases.pll.htm}手)`,
  );
  lines.push(`  PLL macros: ${result.pll.algorithmIds.join(" -> ") || "skip"}`);
  lines.push("");
  lines.push(`Solution : ${formatMoves(result.solution)}`);
  lines.push(`Total    : ${result.totalHTM}手`);
  lines.push("");
  lines.push(
    `Cross OK        : ${isAlignedCrossSolved(result.phases.cross.stateAfter).solved}`,
  );
  lines.push(
    `F2L OK          : ${isF2LSolved(result.phases.f2l.stateAfter).solved}`,
  );
  lines.push(`OLL OK          : ${isOLLSolved(result.phases.oll.stateAfter)}`);
  lines.push(`PLL OK          : ${isPLLSolved(result.phases.pll.stateAfter)}`);
  lines.push("──────────────────────────────────────────");

  return lines.join("\n");
}

export function formatCrossF2LResult(result: CFOPSolveResult): string {
  return formatSolveResult(result);
}

export function solveCrossF2L(scramble: readonly Move[]): CFOPSolveResult {
  return solveCFOP(scramble);
}

export function solveCrossF2LFromString(scramble: string): CFOPSolveResult {
  return solveCFOPFromString(scramble);
}

export type { CubeState, Move } from "../cube/moves";
export type { CrossResult } from "./cross";
export type { F2LResult } from "./f2l";
export type { OLLResult, PLLResult } from "./oll-pll";
export type { F2LSlot } from "./detection";
