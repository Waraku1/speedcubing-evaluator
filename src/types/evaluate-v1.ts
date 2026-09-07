import type { DomainDemandV1 } from "../lib/evaluator/demand/DomainDemandV1";
import type {
  CubeFaceletStateV1,
  SolverResultV1,
} from "./solver-v1";

export type EvaluateRequestV1 = {
  facelets: string;
};

export const DOWNSTREAM_UNAVAILABLE_STATUS_V1 =
  "NOT_SEMANTICALLY_AVAILABLE" as const;
export const DOWNSTREAM_UNAVAILABLE_REASON_V1 =
  "ENTROPY_SEMANTICS_UNCLOSED" as const;

export type UnavailableSemanticStageV1 = {
  status: typeof DOWNSTREAM_UNAVAILABLE_STATUS_V1;
  reason: typeof DOWNSTREAM_UNAVAILABLE_REASON_V1;
  demandArtifactId: string;
};

export type DownstreamAvailabilityV1 = {
  schemaId: "DownstreamAvailabilityV1";
  demandArtifactId: string;
  entropy: UnavailableSemanticStageV1;
  interpretation: UnavailableSemanticStageV1;
  evaluation: UnavailableSemanticStageV1;
};

export type TransitionTraceV1 = {
  executionId: string;
  count: number;
  transitionIds: readonly string[];
};

export type EvaluateSuccessV1 = {
  schemaId: "EvaluateSuccessV1";
  semanticStop: "DEMAND";
  input: CubeFaceletStateV1;
  solver: SolverResultV1;
  transitionTrace: TransitionTraceV1;
  demand: DomainDemandV1;
  downstreamAvailability: DownstreamAvailabilityV1;
};

export const EVALUATE_ERROR_CODES_V1 = [
  "INVALID_REQUEST",
  "INVALID_CUBE_STATE",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "METHOD_NOT_ALLOWED",
  "UNSOLVABLE_CUBE",
  "SOLVER_UNAVAILABLE",
  "SOLVER_TIMEOUT",
  "SOLUTION_VERIFICATION_FAILED",
  "TRANSITION_FAILED",
  "DEMAND_CONTRACT_FAILED",
  "INTERNAL_FAILURE",
] as const;

export type EvaluateErrorCodeV1 =
  (typeof EVALUATE_ERROR_CODES_V1)[number];

export type EvaluateErrorValueV1 = {
  code: EvaluateErrorCodeV1;
  message: string;
  retryable: boolean;
};

export type EvaluateApiSuccessV1 = {
  success: true;
  data: EvaluateSuccessV1;
};

export type EvaluateApiErrorV1 = {
  success: false;
  error: EvaluateErrorValueV1;
};

export type EvaluateApiResponseV1 =
  | EvaluateApiSuccessV1
  | EvaluateApiErrorV1;
