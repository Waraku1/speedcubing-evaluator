import { FingerState } from "./FingerState";
import { GripState } from "./GripState";
import { OrientationState } from "./OrientationState";

export type HumanState = {
  orientation: OrientationState;

  grip: GripState;

  fingers: FingerState;
};