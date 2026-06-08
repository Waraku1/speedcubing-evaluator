import { Move } from "../../cube/cube";

import { HumanState } from "../state/HumanState";

import { Transition } from "./Transition";

import { applyMovePhysics }
from "../physics/TransitionPhysics";

export function generateTransitions(
  initialState: HumanState,
  moves: Move[]
): Transition[] {
  const transitions: Transition[] = [];

  let current =
    initialState;

  for (const move of moves) {
    const next =
      applyMovePhysics(
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