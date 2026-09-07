import type { DomainDemandV1 } from "../lib/evaluator/demand/DomainDemandV1";
import type { MoveV1 } from "./solver-v1";

export const EVALUATE_SCHEMA_VERSION_V1 = "1.0" as const;
export const EVALUATE_RELEASE_V1 = "2026-09-10-rc" as const;

export type EvaluateRequestV1 = Readonly<{
  schemaVersion: typeof EVALUATE_SCHEMA_VERSION_V1;
  cubeState: Readonly<{
    format: "URFDLB_FACELETS_V1";
    facelets: string;
  }>;
  clientRequestId?: string;
}>;

export type CubeStateBoundaryV1 = Readonly<{
  boundaryId: string;
  ordinal: number;
  stateId: string;
  format: "URFDLB_FACELETS_V1";
}>;

export type SolutionTransitionV1 = Readonly<{
  ordinal: number;
  transitionId: string;
  beforeCubeStateId: string;
  afterCubeStateId: string;
  moveEventId: string;
  move: MoveV1;
}>;

export type HumanStateObservationBoundaryV1 = Readonly<{
  boundaryId: string;
  ordinal: number;
  status: "NOT_OBSERVED";
  reason: "HUMAN_STATE_SOURCE_NOT_PROVIDED";
  sourceVersionId: string;
}>;

export type TransitionTraceV1 = Readonly<{
  schemaId: "TransitionTraceV1";
  schemaVersion: typeof EVALUATE_SCHEMA_VERSION_V1;
  executionId: string;
  solutionId: string;
  cubeStateBoundaries: readonly CubeStateBoundaryV1[];
  solutionTransitions: readonly SolutionTransitionV1[];
  humanStateObservationBoundaries:
    readonly HumanStateObservationBoundaryV1[];
}>;

export const DOWNSTREAM_UNAVAILABLE_STATUS_V1 =
  "NOT_SEMANTICALLY_AVAILABLE" as const;
export const DOWNSTREAM_UNAVAILABLE_REASON_V1 =
  "ENTROPY_SEMANTICS_UNCLOSED" as const;

export type UnavailableSemanticStageV1 = Readonly<{
  status: typeof DOWNSTREAM_UNAVAILABLE_STATUS_V1;
  reason: typeof DOWNSTREAM_UNAVAILABLE_REASON_V1;
}>;

export type DownstreamAvailabilityV1 = Readonly<{
  schemaId: "DownstreamAvailabilityV1";
  schemaVersion: typeof EVALUATE_SCHEMA_VERSION_V1;
  demandArtifactId: string;
  demandSchemaId: "SPEC-DM-001";
  demandSchemaVersion: "1.0";
  provenance: Readonly<{
    executionId: string;
    release: typeof EVALUATE_RELEASE_V1;
    buildCommit: string;
  }>;
  entropy: UnavailableSemanticStageV1;
  interpretation: UnavailableSemanticStageV1;
  evaluation: UnavailableSemanticStageV1;
}>;

export type HumanStateNotObservedWarningV1 = Readonly<{
  code: "HUMAN_STATE_NOT_OBSERVED";
  executionId: string;
  transitionIds: readonly string[];
}>;

export type EvaluateResultV1 = Readonly<{
  cubeState: Readonly<{
    stateId: string;
    format: "URFDLB_FACELETS_V1";
  }>;
  solution: Readonly<{
    solutionId: string;
    moves: readonly MoveV1[];
    htm: number;
    qtm: number;
    verified: true;
    solver: Readonly<{
      solverRunId: string;
      id: "cubejs";
      version: "1.3.2";
      adapterVersion: "1.0";
      cacheHit: boolean;
      cacheKeyVersion: "1";
    }>;
  }>;
  transitionTrace: TransitionTraceV1;
  domainDemand: DomainDemandV1;
  downstreamAvailability: DownstreamAvailabilityV1;
  warnings: readonly HumanStateNotObservedWarningV1[];
  timings: Readonly<{
    solverDurationMs: number;
  }>;
  build: Readonly<{
    release: typeof EVALUATE_RELEASE_V1;
    commit: string;
  }>;
}>;

export type EvaluateApiSuccessV1 = Readonly<{
  schemaVersion: typeof EVALUATE_SCHEMA_VERSION_V1;
  requestId: string;
  result: EvaluateResultV1;
}>;

export const EVALUATE_ERROR_CODES_V1 = [
  "INVALID_JSON",
  "REQUEST_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "METHOD_NOT_ALLOWED",
  "INVALID_CUBE_STATE",
  "UNSOLVABLE_CUBE",
  "SOLVER_UNAVAILABLE",
  "SOLVER_TIMEOUT",
  "SOLUTION_VERIFICATION_FAILED",
  "TRANSITION_GENERATION_FAILED",
  "DEMAND_CONTRACT_FAILED",
  "INTERNAL_FAILURE",
] as const;

export type EvaluateErrorCodeV1 =
  (typeof EVALUATE_ERROR_CODES_V1)[number];

export type EvaluateErrorStageV1 =
  | "REQUEST"
  | "VALIDATION"
  | "SOLVER"
  | "VERIFICATION"
  | "TRANSITION"
  | "DEMAND"
  | "INTERNAL";

export type EvaluateErrorValueV1 = Readonly<{
  code: EvaluateErrorCodeV1;
  message: string;
  stage: EvaluateErrorStageV1;
  retryable: boolean;
}>;

export type EvaluateApiErrorV1 = Readonly<{
  schemaVersion: typeof EVALUATE_SCHEMA_VERSION_V1;
  requestId: string;
  error: EvaluateErrorValueV1;
}>;

export type EvaluateApiResponseV1 =
  | EvaluateApiSuccessV1
  | EvaluateApiErrorV1;
