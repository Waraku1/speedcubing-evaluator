import {
  applyMoves,
  SOLVED_STATE as INDEPENDENT_SOLVED_STATE,
  type Move as IndependentMove,
} from "../cube/moves";
import {
  SOLVED_FACELETS_V1,
  type CubeFaceletStateV1,
  type MoveV1,
} from "../../types/solver-v1";
import { parseMoveSequenceV1 } from "./moveV1";
import { SolverV1Error } from "./solverErrorsV1";

export type VerifiedSolutionV1 = {
  moves: readonly MoveV1[];
  htm: number;
  qtm: number;
  verified: true;
};

export function verifySolutionV1(
  input: CubeFaceletStateV1,
  untrustedMoves: unknown
): VerifiedSolutionV1 {
  try {
    if (INDEPENDENT_SOLVED_STATE !== SOLVED_FACELETS_V1) {
      throw new Error("Independent solved-state convention mismatch");
    }

    const moves = parseMoveSequenceV1(untrustedMoves);
    const finalState = applyMoves(
      input.facelets,
      moves as readonly IndependentMove[]
    );

    if (finalState !== SOLVED_FACELETS_V1) {
      throw new SolverV1Error("SOLUTION_VERIFICATION_FAILED");
    }

    return Object.freeze({
      moves,
      htm: moves.length,
      qtm: moves.reduce(
        (total, move) => total + (move.endsWith("2") ? 2 : 1),
        0
      ),
      verified: true as const,
    });
  } catch {
    throw new SolverV1Error("SOLUTION_VERIFICATION_FAILED");
  }
}
