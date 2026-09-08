export const UI_EVALUATE_ERROR_CODES_V1 = [
  "INVALID_CUBE_STATE",
  "UNSOLVABLE_CUBE",
  "SOLVER_UNAVAILABLE",
  "SOLVER_TIMEOUT",
  "SOLUTION_VERIFICATION_FAILED",
  "TRANSITION_GENERATION_FAILED",
  "DEMAND_CONTRACT_FAILED",
  "INVALID_JSON",
  "REQUEST_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "METHOD_NOT_ALLOWED",
  "INTERNAL_FAILURE",
  "NETWORK_UNAVAILABLE",
  "INCOMPATIBLE_RESPONSE",
  "REQUEST_CANCELLED",
] as const;

export type UiEvaluateErrorCodeV1 =
  (typeof UI_EVALUATE_ERROR_CODES_V1)[number];

export type UiErrorFocusV1 =
  | "CUBE_VALIDATION"
  | "ERROR_SUMMARY"
  | "RUN_BUTTON";

export type UiPublicErrorV1 = Readonly<{
  code: UiEvaluateErrorCodeV1;
  title: string;
  explanation: string;
  retryable: boolean;
  focus: UiErrorFocusV1;
  requestId?: string;
}>;

export type UiSolutionV1 = Readonly<{
  solutionId: string;
  moves: readonly string[];
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

export type UiTransitionTraceV1 = Readonly<{
  schemaId: "TransitionTraceV1";
  schemaVersion: "1.0";
  executionId: string;
  solutionId: string;
  cubeStateBoundaries: readonly Readonly<Record<string, unknown>>[];
  solutionTransitions: readonly Readonly<Record<string, unknown>>[];
  humanStateObservationBoundaries:
    readonly Readonly<Record<string, unknown>>[];
}>;

export type UiDomainDemandV1 = Readonly<{
  artifactId: string;
  schemaId: "SPEC-DM-001";
  schemaVersion: "1.0";
  architecture: "P-C";
  claimClass: "T3_BOUNDED_DOMAIN_DEMAND";
  executionEpisode: Readonly<Record<string, unknown>>;
  t1Plane: Readonly<Record<string, unknown>>;
  t2Plane: Readonly<Record<string, unknown>>;
}>;

export type UiDownstreamAvailabilityV1 = Readonly<{
  schemaId: "DownstreamAvailabilityV1";
  schemaVersion: "1.0";
  demandArtifactId: string;
  demandSchemaId: "SPEC-DM-001";
  demandSchemaVersion: "1.0";
  provenance: Readonly<{
    executionId: string;
    release: "2026-09-10-rc";
    buildCommit: string;
  }>;
  entropy: Readonly<Record<string, string>>;
  interpretation: Readonly<Record<string, string>>;
  evaluation: Readonly<Record<string, string>>;
}>;

export type UiEvaluateResultV1 = Readonly<{
  requestId: string;
  cube: Readonly<{
    stateId: string;
    format: "URFDLB_FACELETS_V1";
  }>;
  solution: UiSolutionV1;
  demand: UiDomainDemandV1;
  availability: UiDownstreamAvailabilityV1;
  trace: UiTransitionTraceV1;
  warnings: readonly Readonly<Record<string, unknown>>[];
  timings: Readonly<{ solverDurationMs: number }>;
  build: Readonly<{
    release: "2026-09-10-rc";
    commit: string;
  }>;
}>;
