import { HumanState } from "../state/HumanState";

export function createInitialHumanState(): HumanState {
  return {
    orientation: {
      x: 0,
      y: 0,
      z: 0,
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
    },
  };
}