import { describe, expect, it } from "vitest";
import { applyMoves, SOLVED_STATE, type Move } from "../cube/moves";
import { applyMoves as applyEvaluatorCubeMoves, serializeCubeState, SOLVED_STATE as EVALUATOR_SOLVED, type Move as EvaluatorMove } from "../cube/cube";
import { evaluateMoves } from "../evaluator/legacy/evaluator";
import { ALL_F2L_SLOTS, isAlignedCrossSolved, isF2LSolved, isF2LSlotSolved, isOLLSolved } from "./detection";
import { buildWorkbenchResult, type WorkbenchGoal } from "./workbench";

const scramble: Move[] = ["U'", "L'", "U2", "L", "U'", "L'", "U'", "L", "F", "U'", "F'", "F2", "B"];
const initial = applyMoves(SOLVED_STATE, scramble);

describe("CFOP workbench contract", () => {
  it("uses identical 18 face-turn notation and semantics at the evaluator boundary", () => {
    const moves: Move[] = ["U", "U'", "U2", "R", "R'", "R2", "F", "F'", "F2", "D", "D'", "D2", "L", "L'", "L2", "B", "B'", "B2"];
    for (const move of moves) {
      expect(serializeCubeState(applyEvaluatorCubeMoves(EVALUATOR_SOLVED, [move as EvaluatorMove]))).toBe(applyMoves(SOLVED_STATE, [move]));
    }
    expect(serializeCubeState(applyEvaluatorCubeMoves(EVALUATOR_SOLVED, scramble))).toBe(initial);
    const result = buildWorkbenchResult({ facelets: initial, mode: "partial", goal: "cross" });
    const cube = Object.fromEntries(["U", "R", "F", "D", "L", "B"].map((face, index) => [face, initial.slice(index * 9, index * 9 + 9).split("")]));
    expect(evaluateMoves(cube as typeof EVALUATOR_SOLVED, result.moves).humanEfficiencyScore).toBe(result.evaluator.humanEfficiencyScore);
  });
  it("replays a complete solve through each verified phase", () => {
    const result = buildWorkbenchResult({ facelets: initial, mode: "complete", goal: "pll" });
    expect(result.phases.map((phase) => phase.phase)).toEqual(["cross", "f2l", "oll", "pll"]);
    expect(result.steps.flatMap((step) => step.moves)).toEqual(result.moves);
    expect(result.evaluator.evaluatedMoves).toEqual(result.moves);
    let state = initial;
    for (const step of result.steps) {
      expect(step.stateBefore).toBe(state);
      state = applyMoves(state, step.moves);
      expect(state).toBe(step.stateAfter);
    }
    expect(state).toBe(SOLVED_STATE);
    expect(result.solved).toBe(true);
  });

  it.each(["cross", "f2l", "oll"] as WorkbenchGoal[])("stops at the %s goal and evaluates only displayed moves", (goal) => {
    const result = buildWorkbenchResult({ facelets: initial, mode: "partial", goal });
    expect(result.phases.at(-1)?.phase).toBe(goal);
    expect(result.steps.every((step) => ["cross", "f2l", "oll"].indexOf(step.phase) <= ["cross", "f2l", "oll"].indexOf(goal))).toBe(true);
    expect(result.evaluator.evaluatedMoves).toEqual(result.moves);
    expect(applyMoves(initial, result.moves)).toBe(result.finalState);
    expect(isAlignedCrossSolved(result.finalState).solved).toBe(true);
    if (goal !== "cross") expect(isF2LSolved(result.finalState).solved).toBe(true);
    if (goal === "oll") expect(isOLLSolved(result.finalState)).toBe(true);
    if (goal === "f2l") {
      const completed = new Set(ALL_F2L_SLOTS.filter((slot) => isF2LSlotSolved(result.phases[0].stateAfter, slot)));
      for (const step of result.steps.filter((part) => part.phase === "f2l")) {
        for (const slot of completed) expect(isF2LSlotSolved(step.stateAfter, slot)).toBe(true);
        for (const slot of ALL_F2L_SLOTS) if (isF2LSlotSolved(step.stateAfter, slot)) completed.add(slot);
      }
    }
  });

  it("does not invent moves for an already reached goal or solved cube", () => {
    const cross = buildWorkbenchResult({ facelets: SOLVED_STATE, mode: "partial", goal: "cross" });
    const complete = buildWorkbenchResult({ facelets: SOLVED_STATE, mode: "complete", goal: "pll" });
    for (const result of [cross, complete]) {
      expect(result.alreadyReached).toBe(true);
      expect(result.steps).toEqual([]);
      expect(result.moves).toEqual([]);
      expect(result.evaluator.evaluatedMoves).toEqual([]);
      expect(result.finalState).toBe(SOLVED_STATE);
    }
  });

  it("returns an empty partial solution for a reached goal even while PLL is unsolved", () => {
    const state = applyMoves(SOLVED_STATE, ["U"]);
    const result = buildWorkbenchResult({ facelets: state, mode: "partial", goal: "f2l" });
    expect(result.alreadyReached).toBe(true);
    expect(result.solved).toBe(false);
    expect(result.moves).toEqual([]);
    expect(result.finalState).toBe(state);
  });

  it("compares only verified candidates and evaluates the selected sequence", () => {
    const result = buildWorkbenchResult({ facelets: initial, mode: "complete", goal: "pll" });
    expect(result.optimization.validCandidates).toBe(2);
    expect(result.evaluator.evaluatedMoves).toEqual(result.moves);
    expect(result.finalState).toBe(SOLVED_STATE);
  });
});
