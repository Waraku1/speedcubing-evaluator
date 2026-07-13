export type FingerId =
  | "L_THUMB"
  | "L_INDEX"
  | "L_MIDDLE"
  | "R_THUMB"
  | "R_INDEX"
  | "R_MIDDLE";

export type FingerState = {
  available: Record<FingerId, boolean>;

  fatigue: Record<FingerId, number>;

  coordination: number;
};