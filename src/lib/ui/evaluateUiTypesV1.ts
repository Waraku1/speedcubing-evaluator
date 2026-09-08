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

export const UI_MOVE_TOKENS_V1 = [
  "U", "U'", "U2", "R", "R'", "R2", "F", "F'", "F2",
  "D", "D'", "D2", "L", "L'", "L2", "B", "B'", "B2",
] as const;

export type UiMoveV1 = (typeof UI_MOVE_TOKENS_V1)[number];

export type UiSolutionV1 = Readonly<{
  solutionId: string;
  moves: readonly UiMoveV1[];
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

export const UI_DEMAND_VALIDITY_STATUSES_V1 = [
  "VALID",
  "MISSING",
  "INVALID",
  "CENSORED",
  "SATURATED",
  "NOT_OBSERVED",
  "PATH_UNKNOWN",
  "QUALITY_UNKNOWN",
] as const;

export type UiDemandValidityStatusV1 =
  (typeof UI_DEMAND_VALIDITY_STATUSES_V1)[number];

export type UiDemandProvenanceV1 = Readonly<{
  sourceVersionId: string;
  transitionId: string | null;
  beforeHumanStateRef: string | null;
  afterHumanStateRef: string | null;
  eventId: string | null;
  observationId: string | null;
  windowId: string | null;
}>;

export type UiGovernedStatusV1 = Readonly<{
  status: UiDemandValidityStatusV1;
  reason: string;
  provenance: UiDemandProvenanceV1;
}>;

export type UiCubeStateBoundaryV1 = Readonly<{
  boundaryId: string;
  ordinal: number;
  stateId: string;
  format: "URFDLB_FACELETS_V1";
}>;

export type UiSolutionTransitionV1 = Readonly<{
  ordinal: number;
  transitionId: string;
  beforeCubeStateId: string;
  afterCubeStateId: string;
  moveEventId: string;
  move: UiMoveV1;
}>;

export type UiHumanStateBoundaryV1 = Readonly<{
  boundaryId: string;
  ordinal: number;
  status: "NOT_OBSERVED";
  reason: "HUMAN_STATE_SOURCE_NOT_PROVIDED";
  sourceVersionId: string;
}>;

export type UiTransitionTraceV1 = Readonly<{
  schemaId: "TransitionTraceV1";
  schemaVersion: "1.0";
  executionId: string;
  solutionId: string;
  cubeStateBoundaries: readonly UiCubeStateBoundaryV1[];
  solutionTransitions: readonly UiSolutionTransitionV1[];
  humanStateObservationBoundaries: readonly UiHumanStateBoundaryV1[];
}>;

export type UiDemandPropositionBaseV1 = UiGovernedStatusV1 &
  Readonly<{
    propositionId: string;
    transitionId: string;
    eventId: string;
    observationId: string;
    windowId: string;
  }>;

export type UiNumericDirectionV1 =
  | "INCREASE"
  | "DECREASE"
  | "UNCHANGED"
  | "UNKNOWN";

export type UiAvailabilityDirectionV1 =
  | "GAINED"
  | "LOST"
  | "UNCHANGED"
  | "UNKNOWN";

export type UiGripPropositionV1 = UiDemandPropositionBaseV1 &
  Readonly<{
    semanticOwner: "G-H-GR1";
    side: "LEFT" | "RIGHT";
    contactCountDirection: UiNumericDirectionV1;
    stabilizationDirection: UiAvailabilityDirectionV1;
    sourceFields: readonly string[];
    contactIdentity: UiGovernedStatusV1;
    attribution: UiGovernedStatusV1;
    path: UiGovernedStatusV1;
  }>;

export type UiFingerIdV1 =
  | "L_THUMB"
  | "L_INDEX"
  | "L_MIDDLE"
  | "R_THUMB"
  | "R_INDEX"
  | "R_MIDDLE";

export type UiFingerResourceDirectionV1 =
  | "DEPLETION"
  | "RECOVERY"
  | "UNCHANGED"
  | "UNKNOWN";

export type UiFingerPropositionV1 = UiDemandPropositionBaseV1 &
  Readonly<{
    semanticOwner: "F-H-FR1";
    fingerId: UiFingerIdV1;
    fatigueSourceDirection: UiFingerResourceDirectionV1;
    availabilityDirection: UiAvailabilityDirectionV1;
    sourceFields: readonly string[];
    resourceSemantics: UiGovernedStatusV1;
    path: UiGovernedStatusV1;
  }>;

export type UiOrientationPropositionV1 = UiDemandPropositionBaseV1 &
  Readonly<{
    semanticOwner: "O-H-OR1";
    xDirection: UiNumericDirectionV1;
    yDirection: UiNumericDirectionV1;
    zDirection: UiNumericDirectionV1;
    sourceFields: readonly string[];
    frame: UiGovernedStatusV1;
    transform: UiGovernedStatusV1;
    equivalence: UiGovernedStatusV1;
    path: UiGovernedStatusV1;
  }>;

export type UiContinuityDirectionV1 =
  | "LOSS"
  | "GAIN_OR_RECOVERY"
  | "UNCHANGED"
  | "UNKNOWN";

export type UiContinuityPropositionV1 = UiDemandPropositionBaseV1 &
  Readonly<{
    semanticOwner: "C-H-CR1";
    continuityDirection: UiContinuityDirectionV1;
    sourceFields: readonly string[];
    recoveryClassification: UiGovernedStatusV1;
    path: UiGovernedStatusV1;
  }>;

export type UiChannelStatusOnlyRecordV1 = UiGovernedStatusV1 &
  Readonly<{
    statusRecordId: string;
    scope: "grip" | "finger" | "orientation" | "continuity";
  }>;

export type UiDemandChannelV1<T> = Readonly<{
  semanticOwner: "G-H-GR1" | "F-H-FR1" | "O-H-OR1" | "C-H-CR1";
  propositionRecords: readonly T[];
  statusOnlyRecord: UiChannelStatusOnlyRecordV1 | null;
}>;

export type UiTemporalEvidencePlaneV1 = UiGovernedStatusV1 &
  Readonly<{
    planeId: string;
    plane: "T1" | "T2";
  }>;

export type UiSourceVersionRecordV1 = Readonly<{
  sourceVersionId: string;
  sourceName: string;
  sourceVersion: string;
  role:
    | "HUMAN_STATE_SOURCE"
    | "TRANSITION_SOURCE"
    | "SUPPLEMENTAL_EVIDENCE"
    | "DOMAIN_DERIVATION";
}>;

export type UiDomainDemandV1 = Readonly<{
  artifactId: string;
  schemaId: "SPEC-DM-001";
  schemaVersion: "1.0";
  architecture: "P-C";
  claimClass: "T3_BOUNDED_DOMAIN_DEMAND";
  executionEpisode: Readonly<{
    executionId: string;
    t3Consequences: Readonly<{
      grip: UiDemandChannelV1<UiGripPropositionV1>;
      finger: UiDemandChannelV1<UiFingerPropositionV1>;
      orientation: UiDemandChannelV1<UiOrientationPropositionV1>;
      continuity: UiDemandChannelV1<UiContinuityPropositionV1>;
    }>;
    sourceVersionManifest: readonly UiSourceVersionRecordV1[];
  }>;
  t1Plane: UiTemporalEvidencePlaneV1;
  t2Plane: UiTemporalEvidencePlaneV1;
}>;

export type UiUnavailableSemanticStageV1 = Readonly<{
  status: "NOT_SEMANTICALLY_AVAILABLE";
  reason: "ENTROPY_SEMANTICS_UNCLOSED";
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
  entropy: UiUnavailableSemanticStageV1;
  interpretation: UiUnavailableSemanticStageV1;
  evaluation: UiUnavailableSemanticStageV1;
}>;

export type UiHumanStateNotObservedWarningV1 = Readonly<{
  code: "HUMAN_STATE_NOT_OBSERVED";
  executionId: string;
  transitionIds: readonly string[];
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
  warnings: readonly UiHumanStateNotObservedWarningV1[];
  timings: Readonly<{ solverDurationMs: number }>;
  build: Readonly<{
    release: "2026-09-10-rc";
    commit: string;
  }>;
}>;
