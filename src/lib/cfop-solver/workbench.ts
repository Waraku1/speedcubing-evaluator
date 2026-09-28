import { applyMoves, cancelMoves, SOLVED_STATE, type CubeState, type Move } from "../cube/moves";
import { evaluateMoves } from "../evaluator/legacy/evaluator";
import type { CubeState as EvaluatorCubeState, Color, Move as EvaluatorMove } from "../cube/cube";
import { isAlignedCrossSolved, isF2LSolved, isF2LSlotSolved, isOLLSolved, ALL_F2L_SLOTS, type F2LSlot } from "./detection";
import { solveCFOPState, verifySolveResult, type CFOPPhase, type CFOPSolveResult } from "./cfop-solver";
import { assertValidCubeState } from "./state-adapter";

export type WorkbenchGoal = CFOPPhase;
export type WorkbenchMode = "complete" | "partial";
export type WorkbenchRequest = { facelets: string; mode: WorkbenchMode; goal: WorkbenchGoal };
export type WorkbenchStep = {
  phase: CFOPPhase;
  label: string;
  slot?: F2LSlot;
  caseId?: string;
  newlySolvedSlots?: F2LSlot[];
  moves: Move[];
  htm: number;
  stateBefore: CubeState;
  stateAfter: CubeState;
};
export type WorkbenchResult = {
  mode: WorkbenchMode;
  goal: WorkbenchGoal;
  initialState: CubeState;
  finalState: CubeState;
  goalReached: true;
  solved: boolean;
  alreadyReached: boolean;
  steps: WorkbenchStep[];
  phases: { phase: CFOPPhase; moves: Move[]; htm: number; stateBefore: CubeState; stateAfter: CubeState }[];
  moves: Move[];
  evaluator: { evaluatedMoves: Move[]; humanEfficiencyScore: number; totalCost: number; flowScore: number; regripCount: number; moveCount: number };
  optimization: { validCandidates: number; selected: "original" | "segment-normalized"; criterion: string };
};

const ORDER: readonly CFOPPhase[] = ["cross", "f2l", "oll", "pll"];

function goalReached(state: CubeState, goal: WorkbenchGoal): boolean {
  if (goal === "cross") return isAlignedCrossSolved(state).solved;
  if (goal === "f2l") return isAlignedCrossSolved(state).solved && isF2LSolved(state).solved;
  if (goal === "oll") return isAlignedCrossSolved(state).solved && isF2LSolved(state).solved && isOLLSolved(state);
  return state === SOLVED_STATE;
}

// The two Move unions have the same 18 face-turn literals. Keep the state-shape
// conversion and the public evaluator invocation together at this boundary.
function evaluateDisplayedMoves(initialState: CubeState, moves: Move[]) {
  const faces = ["U", "R", "F", "D", "L", "B"] as const;
  const cube = Object.fromEntries(faces.map((face, index) =>
    [face, initialState.slice(index * 9, index * 9 + 9).split("") as Color[]],
  )) as EvaluatorCubeState;
  const evaluatedMoves: EvaluatorMove[] = [...moves];
  const result = evaluateMoves(cube, evaluatedMoves);
  return {
    evaluatedMoves: [...moves],
    humanEfficiencyScore: result.humanEfficiencyScore,
    totalCost: result.totalCost,
    flowScore: result.flowScore,
    regripCount: result.regripCount,
    moveCount: result.moveCount,
  };
}

function sourceSteps(result: CFOPSolveResult, goal: WorkbenchGoal): WorkbenchStep[] {
  const steps: WorkbenchStep[] = [];
  for (const phase of ORDER) {
    if (ORDER.indexOf(phase) > ORDER.indexOf(goal)) break;
    const data = result.phases[phase];
    if (phase === "f2l") {
      for (const stage of result.f2l.stages) {
        steps.push({ phase, label: `F2L ${stage.slot} · ${stage.caseId}`, slot: stage.slot, caseId: stage.caseId, newlySolvedSlots: [...stage.newlySolvedSlots], moves: [...stage.moves], htm: stage.moves.length, stateBefore: stage.stateBefore, stateAfter: stage.stateAfter });
      }
    } else {
      if (data.moves.length > 0) steps.push({ phase, label: phase.toUpperCase(), moves: [...data.moves], htm: data.moves.length, stateBefore: data.stateBefore, stateAfter: data.stateAfter });
    }
  }
  return steps;
}

function verifySteps(initialState: CubeState, steps: WorkbenchStep[], goal: WorkbenchGoal, expected: CubeState): boolean {
  let state = initialState;
  const protectedSlots = new Set(ALL_F2L_SLOTS.filter((slot) => isF2LSlotSolved(state, slot)));
  for (const step of steps) {
    if (state !== step.stateBefore || step.htm !== step.moves.length) return false;
    state = applyMoves(state, step.moves);
    if (state !== step.stateAfter) return false;
    if (step.phase === "cross") {
      for (const slot of protectedSlots) if (!isF2LSlotSolved(state, slot)) return false;
    }
    if (step.phase === "f2l") {
      if (!isAlignedCrossSolved(state).solved) return false;
      for (const slot of protectedSlots) if (!isF2LSlotSolved(state, slot)) return false;
      for (const slot of ALL_F2L_SLOTS) if (isF2LSlotSolved(state, slot)) protectedSlots.add(slot);
    }
  }
  return state === expected && goalReached(state, goal) && (goal !== "pll" || state === SOLVED_STATE);
}

export function buildWorkbenchResult(request: WorkbenchRequest): WorkbenchResult {
  const { facelets, mode } = request;
  const goal: WorkbenchGoal = mode === "complete" ? "pll" : request.goal;
  assertValidCubeState(facelets);
  const alreadyReached = goalReached(facelets, goal);
  let original: WorkbenchStep[] = [];
  let solvedResult: CFOPSolveResult | null = null;
  let expected = facelets;
  if (!alreadyReached) {
    solvedResult = solveCFOPState(facelets);
    if (!verifySolveResult(solvedResult)) throw new Error("CFOP result failed phase verification");
    original = sourceSteps(solvedResult, goal);
    expected = solvedResult.phases[goal].stateAfter;
  }
  if (!verifySteps(facelets, original, goal, expected)) throw new Error("Displayed CFOP steps failed goal verification");

  const normalized = original.map((step) => {
    const moves = cancelMoves(step.moves);
    return { ...step, moves, htm: moves.length };
  });
  const candidates: { name: "original" | "segment-normalized"; steps: WorkbenchStep[] }[] = [{ name: "original", steps: original }];
  if (normalized.some((step, index) => step.moves.join(" ") !== original[index].moves.join(" ")) && verifySteps(facelets, normalized, goal, expected)) {
    candidates.push({ name: "segment-normalized" as const, steps: normalized });
  }
  const ranked = candidates.map((candidate) => {
    const moves = candidate.steps.flatMap((step) => step.moves);
    return { ...candidate, moves, evaluator: evaluateDisplayedMoves(facelets, moves) };
  }).sort((a, b) => b.evaluator.humanEfficiencyScore - a.evaluator.humanEfficiencyScore || a.moves.length - b.moves.length);
  const selected = ranked[0];
  if (!verifySteps(facelets, selected.steps, goal, expected)) throw new Error("Selected steps failed goal verification");
  if (applyMoves(facelets, selected.moves) !== expected || selected.evaluator.evaluatedMoves.join(" ") !== selected.moves.join(" ")) {
    throw new Error("Evaluator and displayed moves differ");
  }
  const phases = (alreadyReached ? [] : ORDER.filter((phase) => ORDER.indexOf(phase) <= ORDER.indexOf(goal))).map((phase) => {
    const steps = selected.steps.filter((step) => step.phase === phase);
    const moves = steps.flatMap((step) => step.moves);
    const source = solvedResult!.phases[phase];
    if (applyMoves(source.stateBefore, moves) !== source.stateAfter) throw new Error(`${phase} display moves do not reproduce phase state`);
    return { phase, moves, htm: moves.length, stateBefore: source.stateBefore, stateAfter: source.stateAfter };
  });
  return {
    mode, goal, initialState: facelets, finalState: expected, goalReached: true,
    solved: expected === SOLVED_STATE, alreadyReached,
    steps: selected.steps, phases, moves: selected.moves, evaluator: selected.evaluator,
    optimization: { validCandidates: candidates.length, selected: selected.name, criterion: "人間工学スコアを最大化。同点ならHTMを最小化" },
  };
}
