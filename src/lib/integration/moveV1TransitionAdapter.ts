import type { Move as TransitionMove } from "../cube/cube";
import {
  MOVE_V1_TOKENS,
  type MoveV1,
} from "../../types/solver-v1";
import { EvaluateV1Error } from "./evaluateErrorsV1";

const MOVE_V1_SET = new Set<string>(MOVE_V1_TOKENS);

export function adaptMoveV1ToTransitionMove(
  move: unknown
): TransitionMove {
  if (typeof move !== "string" || !MOVE_V1_SET.has(move)) {
    throw new EvaluateV1Error("SOLUTION_VERIFICATION_FAILED");
  }

  return move as MoveV1 as TransitionMove;
}

export function adaptVerifiedMovesForTransitionsV1(
  moves: readonly MoveV1[]
): TransitionMove[] {
  return Array.from(moves, adaptMoveV1ToTransitionMove);
}
