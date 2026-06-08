import { HumanState } from "../state/HumanState";

export function createInitialHumanState(): HumanState {
  return {
    orientation: {
      x: 0,
      y: 0,
      z: 0,

      certainty: 1,
    },

    grip: {
      leftContactCount: 3,
      rightContactCount: 3,

      leftStabilizing: true,
      rightStabilizing: true,
    },

    fingers: {
      available: {
        L_THUMB: true,
        L_INDEX: true,
        L_MIDDLE: true,

        R_THUMB: true,
        R_INDEX: true,
        R_MIDDLE: true,
      },

      fatigue: {
        L_THUMB: 0,
        L_INDEX: 0,
        L_MIDDLE: 0,

        R_THUMB: 0,
        R_INDEX: 0,
        R_MIDDLE: 0,
      },

      coordination: 1,
    },

    momentum: {
      continuity: 1,

      velocity: 1,
    },
  };
}