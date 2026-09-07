import type {
  CubeStateBoundaryV1,
  HumanStateObservationBoundaryV1,
  SolutionTransitionV1,
  TransitionTraceV1,
} from "../../types/evaluate-v1";
import type {
  CubeFaceletStateV1,
  SolverResultV1,
} from "../../types/solver-v1";
import { applyMove, type Move } from "../cube/moves";
import { createCubeFaceletStateV1 } from "../cube/cubeStateV1";
import {
  HUMAN_STATE_SOURCE_NOT_PROVIDED_REASON_V1,
  UNOBSERVED_HUMAN_STATE_SOURCE_VERSION_ID_V1,
} from "../evaluator/demand/DemandAdvanceInputV1";
import { stableIdentity } from "../evaluator/demand/StableIdentity";
import type { VerifiedSolutionV1 } from "../solver/solutionVerifierV1";

export type BuiltSolutionTraceV1 = TransitionTraceV1 &
  Readonly<{ solutionTraceId: string }>;

function solutionIdFor(
  input: CubeFaceletStateV1,
  solverResult: SolverResultV1,
  verified: VerifiedSolutionV1
): string {
  return stableIdentity("solution", {
    stateId: input.stateId,
    engine: solverResult.engine,
    solverRunId: solverResult.solverRunId,
    cacheKeyVersion: solverResult.cache.keyVersion,
    verifiedMoveTokens: verified.moves,
  });
}

function cubeBoundary(
  solutionId: string,
  ordinal: number,
  state: CubeFaceletStateV1
): CubeStateBoundaryV1 {
  return Object.freeze({
    boundaryId: stableIdentity("cube-state-boundary", {
      solutionId,
      ordinal,
      stateId: state.stateId,
    }),
    ordinal,
    stateId: state.stateId,
    format: state.format,
  });
}

function humanStateBoundary(
  solutionTraceId: string,
  ordinal: number
): HumanStateObservationBoundaryV1 {
  return Object.freeze({
    boundaryId: stableIdentity("human-state-observation-boundary", {
      solutionTraceId,
      ordinal,
      status: "NOT_OBSERVED",
      reason: HUMAN_STATE_SOURCE_NOT_PROVIDED_REASON_V1,
      sourceVersionId: UNOBSERVED_HUMAN_STATE_SOURCE_VERSION_ID_V1,
    }),
    ordinal,
    status: "NOT_OBSERVED",
    reason: HUMAN_STATE_SOURCE_NOT_PROVIDED_REASON_V1,
    sourceVersionId: UNOBSERVED_HUMAN_STATE_SOURCE_VERSION_ID_V1,
  });
}

export class SolutionTraceBuilderV1 {
  build(
    input: CubeFaceletStateV1,
    solverResult: SolverResultV1,
    verified: VerifiedSolutionV1
  ): BuiltSolutionTraceV1 {
    const solutionId = solutionIdFor(input, solverResult, verified);
    const cubeStateBoundaries: CubeStateBoundaryV1[] = [];
    const solutionTransitions: SolutionTransitionV1[] = [];
    let beforeState = input;

    cubeStateBoundaries.push(cubeBoundary(solutionId, 0, beforeState));

    verified.moves.forEach((move, ordinal) => {
      const afterState = createCubeFaceletStateV1(
        applyMove(beforeState.facelets, move as Move)
      );
      const moveEventId = stableIdentity("solution-move-event", {
        solutionId,
        ordinal,
        move,
      });
      const transitionId = stableIdentity("solution-transition", {
        solutionId,
        ordinal,
        beforeCubeStateId: beforeState.stateId,
        afterCubeStateId: afterState.stateId,
        moveEventId,
      });

      solutionTransitions.push(
        Object.freeze({
          ordinal,
          transitionId,
          beforeCubeStateId: beforeState.stateId,
          afterCubeStateId: afterState.stateId,
          moveEventId,
          move,
        })
      );
      cubeStateBoundaries.push(
        cubeBoundary(solutionId, ordinal + 1, afterState)
      );
      beforeState = afterState;
    });

    const solutionTraceId = stableIdentity("solution-trace", {
      solutionId,
      cubeBoundaryIds: cubeStateBoundaries.map(
        (boundary) => boundary.boundaryId
      ),
      solutionTransitionIds: solutionTransitions.map(
        (transition) => transition.transitionId
      ),
    });
    const humanStateObservationBoundaries = cubeStateBoundaries.map(
      (_boundary, ordinal) => humanStateBoundary(solutionTraceId, ordinal)
    );
    const executionId = stableIdentity("execution", {
      kind: "UNOBSERVED_HUMAN_STATE",
      solutionTraceId,
      solutionTransitionIds: solutionTransitions.map(
        (transition) => transition.transitionId
      ),
      humanStateBoundaryIds: humanStateObservationBoundaries.map(
        (boundary) => boundary.boundaryId
      ),
    });

    return Object.freeze({
      schemaId: "TransitionTraceV1",
      schemaVersion: "1.0",
      solutionTraceId,
      executionId,
      solutionId,
      cubeStateBoundaries: Object.freeze(cubeStateBoundaries),
      solutionTransitions: Object.freeze(solutionTransitions),
      humanStateObservationBoundaries: Object.freeze(
        humanStateObservationBoundaries
      ),
    });
  }
}
