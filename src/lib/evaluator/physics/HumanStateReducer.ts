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

function clamp(
  value: number,
  min: number,
  max: number
): number {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

export function reduceHumanState(
  state: HumanState,
  effect: TransitionEffect
): HumanState {
  const nextLeft =
    Math.max(
      1,
      state.grip.leftContactCount +
      effect.gripDelta
    );

  const nextRight =
    Math.max(
      1,
      state.grip.rightContactCount +
      effect.gripDelta
    );

  return {
    ...state,

    grip: {
      ...state.grip,

      leftContactCount:
        nextLeft,

      rightContactCount:
        nextRight,

      leftStabilizing:
        nextLeft >= 2,

      rightStabilizing:
        nextRight >= 2,
    },

    orientation: {
      ...state.orientation,

      certainty: clamp01(
        state.orientation.certainty -
        effect.orientationUncertaintyDelta
      ),
    },
    momentum: {
      continuity: Math.max(
        0,
        state.momentum.continuity +
          effect.continuityDelta
      ),

      velocity: Math.max(
        0,
        state.momentum.velocity +
          effect.velocityDelta
      ),
    },
    fingers: {
      ...state.fingers,

      coordination: clamp(
        state.fingers.coordination -
          effect.fingerDelta * 0.05,
        0,
        1
      ),

      fatigue: {
        L_THUMB:
          state.fingers.fatigue.L_THUMB +
          effect.fingerDelta * 0.1,

        L_INDEX:
          state.fingers.fatigue.L_INDEX +
          effect.fingerDelta * 0.1,

        L_MIDDLE:
          state.fingers.fatigue.L_MIDDLE +
          effect.fingerDelta * 0.1,

        R_THUMB:
          state.fingers.fatigue.R_THUMB +
          effect.fingerDelta * 0.1,

        R_INDEX:
          state.fingers.fatigue.R_INDEX +
          effect.fingerDelta * 0.1,

        R_MIDDLE:
          state.fingers.fatigue.R_MIDDLE +
          effect.fingerDelta * 0.1,
      },
    },
  };
}