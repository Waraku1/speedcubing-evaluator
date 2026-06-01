import { Move } from "../../cube/cube";
import { HumanState } from "../state/HumanState";
import { Transition } from "./Transition";

function applyMoveToHumanState(
  state: HumanState,
  move: Move
): HumanState {
  return {
    ...state,
  };
}

export function generateTransitions(
  initialState: HumanState,
  moves: Move[]
): Transition[] {
  const transitions: Transition[] = [];

  let current = initialState;

  for (const move of moves) {
    const next = applyMoveToHumanState(
      current,
      move
    );

    transitions.push({
      before: current,
      move,
      after: next,
    });

    current = next;
  }

  return transitions;
}