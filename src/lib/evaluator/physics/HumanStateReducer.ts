import { HumanState } from "../state/HumanState";

import { TransitionEffect } from "../transition-effects/TransitionEffect";

function clamp01(
  value: number
): number {
  return Math.max(
    0,
    Math.min(1, value)
  );
}

export function reduceHumanState(
  state: HumanState,
  effect: TransitionEffect
): HumanState {
  return {
    ...state,

    grip: {
      ...state.grip,

      rightContactCount: Math.max(
        1,
        state.grip.rightContactCount +
          effect.gripDelta
      ),
    },

    orientation: {
      ...state.orientation,

      certainty: clamp01(
        state.orientation.certainty -
        effect.orientationUncertaintyDelta
      ),
    },
  };
}