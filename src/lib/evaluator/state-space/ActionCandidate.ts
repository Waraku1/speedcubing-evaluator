import { Move } from "../../cube/cube";

export type ActionCandidate = {
  move: Move;

  /**
   * Relative likelihood of selecting
   * this action from current state.
   *
   * Not a score.
   * Not a quality metric.
   */
  feasibility: number;
};