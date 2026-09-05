export const DOMAIN_DEMAND_VALIDITY_STATUSES = [
  "VALID",
  "MISSING",
  "INVALID",
  "CENSORED",
  "SATURATED",
  "NOT_OBSERVED",
  "PATH_UNKNOWN",
  "QUALITY_UNKNOWN",
] as const;

export type DomainDemandValidityStatus =
  (typeof DOMAIN_DEMAND_VALIDITY_STATUSES)[number];

export type JsonScalar =
  | string
  | number
  | boolean
  | null;

export type DomainDemandProvenance = {
  sourceVersionId: string;
  transitionId: string | null;
  beforeHumanStateRef: string | null;
  afterHumanStateRef: string | null;
  eventId: string | null;
  observationId: string | null;
  windowId: string | null;
};

export type GovernedStatus = {
  status: DomainDemandValidityStatus;
  reason: string;
  provenance: DomainDemandProvenance;
};

export type GovernedValue = GovernedStatus & {
  value: JsonScalar;
};

export type SourceVersionRecord = {
  sourceVersionId: string;
  sourceName: string;
  sourceVersion: string;
  role:
    | "HUMAN_STATE_SOURCE"
    | "TRANSITION_SOURCE"
    | "SUPPLEMENTAL_EVIDENCE"
    | "DOMAIN_DERIVATION";
};

export type TransitionReference = {
  transitionId: string;
  ordinal: number;
  beforeHumanStateRef: string;
  afterHumanStateRef: string;
  sourceVersionId: string;
};

export type ExecutionEventRecord = GovernedStatus & {
  eventId: string;
  eventType: "TRANSITION_OCCURRENCE";
  transitionId: string;
  ordinal: number;
  beforeHumanStateRef: string;
  afterHumanStateRef: string;
};

export type ObservationFieldRecord = {
  sourceField: string;
  before: GovernedValue;
  after: GovernedValue;
};

export type ObservationScope =
  | "GRIP_ENDPOINTS"
  | "FINGER_ENDPOINTS"
  | "ORIENTATION_CONFIGURATION_ENDPOINTS"
  | "ORIENTATION_CERTAINTY_QUARANTINE"
  | "CONTINUITY_ENDPOINTS"
  | "VELOCITY_QUARANTINE";

export type ObservationRecord = GovernedStatus & {
  observationId: string;
  eventId: string;
  transitionId: string;
  scope: ObservationScope;
  semanticUse: "T3_EVIDENCE" | "QUARANTINED_CONTEXT";
  fields: ObservationFieldRecord[];
};

export type WindowRecord = GovernedStatus & {
  windowId: string;
  transitionId: string;
  eventId: string;
  startBoundaryId: string;
  endBoundaryId: string;
  pathIdentity: string | null;
};

export type EvidenceEdgeRole =
  | "CAUSES"
  | "CONTEXTUALIZES"
  | "INDICATES"
  | "REALIZES"
  | "OUTCOMES_IN"
  | "COMPARES_WITH";

export type EvidenceEdge = GovernedStatus & {
  evidenceEdgeId: string;
  role: EvidenceEdgeRole;
  eventId: string;
  observationId: string;
  propositionId: string;
  transitionId: string;
  beforeHumanStateRef: string;
  afterHumanStateRef: string;
};

export type NumericDirection =
  | "INCREASE"
  | "DECREASE"
  | "UNCHANGED"
  | "UNKNOWN";

export type AvailabilityDirection =
  | "GAINED"
  | "LOST"
  | "UNCHANGED"
  | "UNKNOWN";

export type StabilizationDirection =
  | "GAINED"
  | "LOST"
  | "UNCHANGED"
  | "UNKNOWN";

export type FingerResourceDirection =
  | "DEPLETION"
  | "RECOVERY"
  | "UNCHANGED"
  | "UNKNOWN";

export type ContinuityDirection =
  | "LOSS"
  | "GAIN_OR_RECOVERY"
  | "UNCHANGED"
  | "UNKNOWN";

export type DemandPropositionBase = GovernedStatus & {
  propositionId: string;
  transitionId: string;
  eventId: string;
  observationId: string;
  windowId: string;
};

export type GripProposition = DemandPropositionBase & {
  semanticOwner: "G-H-GR1";
  side: "LEFT" | "RIGHT";
  contactCountDirection: NumericDirection;
  stabilizationDirection: StabilizationDirection;
  sourceFields: string[];
  contactIdentity: GovernedStatus;
  attribution: GovernedStatus;
  path: GovernedStatus;
};

export type FingerId =
  | "L_THUMB"
  | "L_INDEX"
  | "L_MIDDLE"
  | "R_THUMB"
  | "R_INDEX"
  | "R_MIDDLE";

export type FingerProposition = DemandPropositionBase & {
  semanticOwner: "F-H-FR1";
  fingerId: FingerId;
  fatigueSourceDirection: FingerResourceDirection;
  availabilityDirection: AvailabilityDirection;
  sourceFields: string[];
  resourceSemantics: GovernedStatus;
  path: GovernedStatus;
};

export type OrientationProposition = DemandPropositionBase & {
  semanticOwner: "O-H-OR1";
  xDirection: NumericDirection;
  yDirection: NumericDirection;
  zDirection: NumericDirection;
  sourceFields: string[];
  frame: GovernedStatus;
  transform: GovernedStatus;
  equivalence: GovernedStatus;
  path: GovernedStatus;
};

export type ContinuityProposition = DemandPropositionBase & {
  semanticOwner: "C-H-CR1";
  continuityDirection: ContinuityDirection;
  sourceFields: string[];
  recoveryClassification: GovernedStatus;
  path: GovernedStatus;
};

export type ChannelStatusOnlyRecord = GovernedStatus & {
  statusRecordId: string;
  scope: "grip" | "finger" | "orientation" | "continuity";
};

export type ConsequenceChannel<T> = {
  semanticOwner:
    | "G-H-GR1"
    | "F-H-FR1"
    | "O-H-OR1"
    | "C-H-CR1";
  propositionRecords: T[];
  statusOnlyRecord: ChannelStatusOnlyRecord | null;
};

export type T3Consequences = {
  grip: ConsequenceChannel<GripProposition>;
  finger: ConsequenceChannel<FingerProposition>;
  orientation: ConsequenceChannel<OrientationProposition>;
  continuity: ConsequenceChannel<ContinuityProposition>;
};

export type TemporalEvidencePlane = GovernedStatus & {
  planeId: string;
  plane: "T1" | "T2";
};

export type ExecutionEpisode = {
  executionId: string;
  /** Ordered by Transition ordinal. */
  transitionRefs: TransitionReference[];
  /** Ordered by Transition ordinal, with one event per occurrence. */
  eventRecords: ExecutionEventRecord[];
  /**
   * Ordered by Transition ordinal, then GRIP, FINGER, ORIENTATION_CONFIG,
   * ORIENTATION_CERTAINTY_QUARANTINE, CONTINUITY, VELOCITY_QUARANTINE.
   */
  observationRecords: ObservationRecord[];
  /** Ordered by Transition ordinal. */
  windowRecords: WindowRecord[];
  /**
   * Ordered by Transition ordinal, then grip LEFT/RIGHT, fixed FingerId order,
   * orientation, and continuity.
   */
  evidenceEdges: EvidenceEdge[];
  t3Consequences: T3Consequences;
  /** Built-in sources first, then supplemental sources by sourceVersionId. */
  sourceVersionManifest: SourceVersionRecord[];
};

export type DomainDemandV1 = {
  artifactId: string;
  schemaId: "SPEC-DM-001";
  schemaVersion: "1.0";
  architecture: "P-C";
  claimClass: "T3_BOUNDED_DOMAIN_DEMAND";
  executionEpisode: ExecutionEpisode;
  t1Plane: TemporalEvidencePlane;
  t2Plane: TemporalEvidencePlane;
};

export type SourceValidityDeclaration = {
  phase: "BEFORE" | "AFTER";
  sourceField: string;
  status: DomainDemandValidityStatus;
  reason: string;
};

export type PathEvidenceDeclaration = {
  status: DomainDemandValidityStatus;
  reason: string;
  pathIdentity: string | null;
};

export type WindowEvidenceDeclaration = {
  status: DomainDemandValidityStatus;
  reason: string;
  startBoundaryId: string;
  endBoundaryId: string;
};

/**
 * Optional governed evidence carried alongside a Transition at runtime.
 * It never changes or evaluates the Move; it only qualifies source evidence.
 */
export type TransitionDemandEvidence = {
  sourceName: string;
  sourceVersion: string;
  fieldValidity: SourceValidityDeclaration[];
  path: PathEvidenceDeclaration | null;
  window: WindowEvidenceDeclaration | null;
};

export type DemandGovernedTransition = {
  domainDemandEvidence?: TransitionDemandEvidence;
};
