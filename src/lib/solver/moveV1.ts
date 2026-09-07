import {
  MOVE_V1_TOKENS,
  type MoveV1,
} from "../../types/solver-v1";
import { SolverV1Error } from "./solverErrorsV1";

const MOVE_V1_SET = new Set<string>(MOVE_V1_TOKENS);

export function parseMoveV1(value: unknown): MoveV1 {
  if (typeof value !== "string" || !MOVE_V1_SET.has(value)) {
    throw new SolverV1Error("SOLUTION_VERIFICATION_FAILED");
  }

  return value as MoveV1;
}

export function parseMoveSequenceV1(value: unknown): readonly MoveV1[] {
  let tokens: unknown[];

  if (typeof value === "string") {
    const trimmed = value.trim();
    tokens = trimmed === "" ? [] : trimmed.split(/\s+/);
  } else if (Array.isArray(value)) {
    tokens = [...value];
  } else {
    throw new SolverV1Error("SOLUTION_VERIFICATION_FAILED");
  }

  return Object.freeze(tokens.map(parseMoveV1));
}
