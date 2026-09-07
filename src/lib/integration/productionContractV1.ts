import type { Move as TransitionMove } from "../cube/cube";
import {
  DOMAIN_DEMAND_VALIDITY_STATUSES,
  type DomainDemandV1,
} from "../evaluator/demand/DomainDemandV1";
import {
  canonicalIdentityContent,
  stableIdentity,
} from "../evaluator/demand/StableIdentity";
import type { HumanState } from "../evaluator/state/HumanState";
import type { Transition } from "../evaluator/transition/Transition";
import { EvaluateV1Error } from "./evaluateErrorsV1";

const FINGER_IDS = [
  "L_THUMB",
  "L_INDEX",
  "L_MIDDLE",
  "R_THUMB",
  "R_INDEX",
  "R_MIDDLE",
] as const;

const OBSERVATION_SCOPES = [
  "GRIP_ENDPOINTS",
  "FINGER_ENDPOINTS",
  "ORIENTATION_CONFIGURATION_ENDPOINTS",
  "ORIENTATION_CERTAINTY_QUARANTINE",
  "CONTINUITY_ENDPOINTS",
  "VELOCITY_QUARANTINE",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isHumanState(value: unknown): value is HumanState {
  if (!isRecord(value)) {
    return false;
  }

  const { orientation, grip, fingers, momentum } = value;

  if (
    !isRecord(orientation) ||
    !isRecord(grip) ||
    !isRecord(fingers) ||
    !isRecord(momentum)
  ) {
    return false;
  }

  const available = fingers.available;
  const fatigue = fingers.fatigue;

  if (!isRecord(available) || !isRecord(fatigue)) {
    return false;
  }

  return (
    [
      orientation.x,
      orientation.y,
      orientation.z,
      orientation.certainty,
      grip.leftContactCount,
      grip.rightContactCount,
      fingers.coordination,
      momentum.continuity,
      momentum.velocity,
      ...FINGER_IDS.map((fingerId) => fatigue[fingerId]),
    ].every(isFiniteNumber) &&
    [
      grip.leftStabilizing,
      grip.rightStabilizing,
      ...FINGER_IDS.map((fingerId) => available[fingerId]),
    ].every((field) => typeof field === "boolean")
  );
}

export function assertTransitionTraceV1(
  value: unknown,
  initialState: HumanState,
  moves: readonly TransitionMove[]
): asserts value is Transition[] {
  if (!Array.isArray(value) || value.length !== moves.length) {
    throw new EvaluateV1Error("TRANSITION_FAILED");
  }

  let expectedBefore = canonicalIdentityContent(initialState);

  for (let ordinal = 0; ordinal < value.length; ordinal += 1) {
    const transition = value[ordinal];

    if (
      !isRecord(transition) ||
      transition.move !== moves[ordinal] ||
      !isHumanState(transition.before) ||
      !isHumanState(transition.after) ||
      canonicalIdentityContent(transition.before) !== expectedBefore
    ) {
      throw new EvaluateV1Error("TRANSITION_FAILED");
    }

    expectedBefore = canonicalIdentityContent(transition.after);
  }
}

function demandFailure(): never {
  throw new EvaluateV1Error("DEMAND_CONTRACT_FAILED");
}

function arrayField(
  record: Record<string, unknown>,
  field: string
): unknown[] {
  const value = record[field];

  if (!Array.isArray(value)) {
    return demandFailure();
  }

  return value;
}

function isGovernedStatus(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.provenance)) {
    return false;
  }

  return (
    DOMAIN_DEMAND_VALIDITY_STATUSES.some(
      (status) => status === value.status
    ) &&
    isNonEmptyString(value.reason) &&
    isNonEmptyString(value.provenance.sourceVersionId)
  );
}

function isJsonCompatible(
  value: unknown,
  ancestors = new Set<object>()
): boolean {
  if (value === null) {
    return true;
  }

  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    isFiniteNumber(value)
  ) {
    return true;
  }

  if (typeof value !== "object") {
    return false;
  }

  if (ancestors.has(value)) {
    return false;
  }

  ancestors.add(value);
  const compatible = Array.isArray(value)
    ? value.every((item) => isJsonCompatible(item, ancestors))
    : Object.values(value).every((item) =>
        isJsonCompatible(item, ancestors)
      );
  ancestors.delete(value);

  return compatible;
}

function containsForbiddenSemanticKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsForbiddenSemanticKey);
  }

  if (!isRecord(value)) {
    return false;
  }

  const forbidden = new Set([
    "move",
    "moves",
    "entropy",
    "interpretation",
    "evaluation",
    "score",
    "rank",
    "penalty",
    "cost",
    "metric",
    "metrics",
    "normalization",
    "weightedAggregation",
  ]);

  return Object.entries(value).some(
    ([key, nested]) =>
      forbidden.has(key) || containsForbiddenSemanticKey(nested)
  );
}

type IdentifiedRecord = Record<string, unknown> & {
  transitionId: string;
};

function recordsByTransition(
  values: unknown[],
  knownTransitionIds: ReadonlySet<string>
): IdentifiedRecord[] {
  return values.map((value) => {
    if (
      !isRecord(value) ||
      !isNonEmptyString(value.transitionId) ||
      !knownTransitionIds.has(value.transitionId)
    ) {
      return demandFailure();
    }

    return value as IdentifiedRecord;
  });
}

function assertChannel(
  value: unknown,
  semanticOwner: string,
  propositionCountPerTransition: number,
  transitionCount: number,
  knownTransitionIds: ReadonlySet<string>,
  eventIds: ReadonlySet<string>,
  observationIds: ReadonlySet<string>,
  windowIds: ReadonlySet<string>
): IdentifiedRecord[] {
  if (!isRecord(value) || value.semanticOwner !== semanticOwner) {
    demandFailure();
  }

  const propositions = arrayField(value, "propositionRecords");

  if (propositions.length !== propositionCountPerTransition * transitionCount) {
    demandFailure();
  }

  if (transitionCount === 0) {
    if (
      !isGovernedStatus(value.statusOnlyRecord) ||
      !isRecord(value.statusOnlyRecord) ||
      value.statusOnlyRecord.status !== "NOT_OBSERVED" ||
      !isNonEmptyString(value.statusOnlyRecord.statusRecordId)
    ) {
      demandFailure();
    }
  } else if (value.statusOnlyRecord !== null) {
    demandFailure();
  }

  const identified = recordsByTransition(
    propositions,
    knownTransitionIds
  );

  for (const proposition of identified) {
    if (
      !isGovernedStatus(proposition) ||
      proposition.semanticOwner !== semanticOwner ||
      !isNonEmptyString(proposition.propositionId) ||
      !isNonEmptyString(proposition.eventId) ||
      !eventIds.has(proposition.eventId) ||
      !isNonEmptyString(proposition.observationId) ||
      !observationIds.has(proposition.observationId) ||
      !isNonEmptyString(proposition.windowId) ||
      !windowIds.has(proposition.windowId)
    ) {
      demandFailure();
    }
  }

  return identified;
}

export function assertDomainDemandV1(
  value: unknown,
  transitionCount: number
): asserts value is DomainDemandV1 {
  if (
    !isRecord(value) ||
    value.schemaId !== "SPEC-DM-001" ||
    value.schemaVersion !== "1.0" ||
    value.architecture !== "P-C" ||
    value.claimClass !== "T3_BOUNDED_DOMAIN_DEMAND" ||
    !isNonEmptyString(value.artifactId) ||
    !isRecord(value.executionEpisode)
  ) {
    demandFailure();
  }

  const episode = value.executionEpisode;
  const transitionRefs = arrayField(episode, "transitionRefs");
  const eventRecords = arrayField(episode, "eventRecords");
  const observationRecords = arrayField(episode, "observationRecords");
  const windowRecords = arrayField(episode, "windowRecords");
  const evidenceEdges = arrayField(episode, "evidenceEdges");
  const sourceManifest = arrayField(episode, "sourceVersionManifest");

  if (
    !isNonEmptyString(episode.executionId) ||
    transitionRefs.length !== transitionCount ||
    eventRecords.length !== transitionCount ||
    observationRecords.length !== transitionCount * OBSERVATION_SCOPES.length ||
    windowRecords.length !== transitionCount ||
    evidenceEdges.length !== transitionCount * 10 ||
    sourceManifest.length < 3 ||
    !isRecord(episode.t3Consequences)
  ) {
    demandFailure();
  }

  const sourceVersionIds = sourceManifest.map((source) => {
    if (!isRecord(source) || !isNonEmptyString(source.sourceVersionId)) {
      return demandFailure();
    }
    return source.sourceVersionId;
  });

  if (new Set(sourceVersionIds).size !== sourceVersionIds.length) {
    demandFailure();
  }

  const transitionIds: string[] = [];

  transitionRefs.forEach((reference, ordinal) => {
    if (
      !isRecord(reference) ||
      reference.ordinal !== ordinal ||
      !isNonEmptyString(reference.transitionId) ||
      !isNonEmptyString(reference.beforeHumanStateRef) ||
      !isNonEmptyString(reference.afterHumanStateRef) ||
      !isNonEmptyString(reference.sourceVersionId) ||
      !sourceVersionIds.includes(reference.sourceVersionId)
    ) {
      demandFailure();
    }

    transitionIds.push(reference.transitionId);
  });

  const knownTransitionIds = new Set(transitionIds);
  if (knownTransitionIds.size !== transitionIds.length) {
    demandFailure();
  }

  const events = recordsByTransition(eventRecords, knownTransitionIds);
  const eventIds = new Set<string>();

  events.forEach((event, ordinal) => {
    const reference = transitionRefs[ordinal] as Record<string, unknown>;

    if (
      !isGovernedStatus(event) ||
      event.ordinal !== ordinal ||
      event.eventType !== "TRANSITION_OCCURRENCE" ||
      !isNonEmptyString(event.eventId) ||
      event.transitionId !== reference.transitionId ||
      event.beforeHumanStateRef !== reference.beforeHumanStateRef ||
      event.afterHumanStateRef !== reference.afterHumanStateRef
    ) {
      demandFailure();
    }
    eventIds.add(event.eventId);
  });

  if (eventIds.size !== events.length) {
    demandFailure();
  }

  const windows = recordsByTransition(windowRecords, knownTransitionIds);
  const windowIds = new Set<string>();

  for (const window of windows) {
    if (
      !isGovernedStatus(window) ||
      !isNonEmptyString(window.windowId) ||
      !isNonEmptyString(window.eventId) ||
      !eventIds.has(window.eventId)
    ) {
      demandFailure();
    }
    windowIds.add(window.windowId);
  }

  if (windowIds.size !== windows.length) {
    demandFailure();
  }

  const observations = recordsByTransition(
    observationRecords,
    knownTransitionIds
  );
  const observationIds = new Set<string>();
  const scopeCountByTransition = new Map<string, Set<unknown>>();

  for (const observation of observations) {
    if (
      !isGovernedStatus(observation) ||
      !isNonEmptyString(observation.observationId) ||
      !isNonEmptyString(observation.eventId) ||
      !eventIds.has(observation.eventId) ||
      !OBSERVATION_SCOPES.some((scope) => scope === observation.scope) ||
      !Array.isArray(observation.fields)
    ) {
      demandFailure();
    }

    observationIds.add(observation.observationId);
    const scopes = scopeCountByTransition.get(observation.transitionId) ??
      new Set<unknown>();
    scopes.add(observation.scope);
    scopeCountByTransition.set(observation.transitionId, scopes);
  }

  if (
    observationIds.size !== observations.length ||
    [...scopeCountByTransition.values()].some(
      (scopes) => scopes.size !== OBSERVATION_SCOPES.length
    )
  ) {
    demandFailure();
  }

  const edges = recordsByTransition(evidenceEdges, knownTransitionIds);
  const edgeIds = new Set<string>();

  for (const edge of edges) {
    if (
      !isGovernedStatus(edge) ||
      edge.role !== "REALIZES" ||
      !isNonEmptyString(edge.evidenceEdgeId) ||
      !isNonEmptyString(edge.eventId) ||
      !eventIds.has(edge.eventId) ||
      !isNonEmptyString(edge.observationId) ||
      !observationIds.has(edge.observationId) ||
      !isNonEmptyString(edge.propositionId)
    ) {
      demandFailure();
    }
    edgeIds.add(edge.evidenceEdgeId);
  }

  if (edgeIds.size !== edges.length) {
    demandFailure();
  }

  const channelArguments = [
    [episode.t3Consequences.grip, "G-H-GR1", 2],
    [episode.t3Consequences.finger, "F-H-FR1", 6],
    [episode.t3Consequences.orientation, "O-H-OR1", 1],
    [episode.t3Consequences.continuity, "C-H-CR1", 1],
  ] as const;
  const propositions = channelArguments.flatMap(
    ([channel, semanticOwner, count]) =>
      assertChannel(
        channel,
        semanticOwner,
        count,
        transitionCount,
        knownTransitionIds,
        eventIds,
        observationIds,
        windowIds
      )
  );
  const propositionsById = new Map<string, IdentifiedRecord>();

  for (const proposition of propositions) {
    const propositionId = proposition.propositionId as string;
    if (propositionsById.has(propositionId)) {
      demandFailure();
    }
    propositionsById.set(propositionId, proposition);
  }

  for (const edge of edges) {
    const proposition = propositionsById.get(edge.propositionId as string);

    if (
      !proposition ||
      edge.transitionId !== proposition.transitionId ||
      edge.eventId !== proposition.eventId ||
      edge.observationId !== proposition.observationId
    ) {
      demandFailure();
    }
  }

  if (propositionsById.size !== edges.length) {
    demandFailure();
  }

  const expectedExecutionId = stableIdentity("execution", {
    architecture: "P-C",
    schemaId: "SPEC-DM-001",
    schemaVersion: "1.0",
    orderedTransitionIds: transitionIds,
    sourceVersionIds,
  });
  const expectedArtifactId = stableIdentity("domain-demand", {
    executionId: expectedExecutionId,
    schemaId: "SPEC-DM-001",
    schemaVersion: "1.0",
    architecture: "P-C",
    claimClass: "T3_BOUNDED_DOMAIN_DEMAND",
  });

  if (
    episode.executionId !== expectedExecutionId ||
    value.artifactId !== expectedArtifactId
  ) {
    demandFailure();
  }

  for (const planeName of ["t1Plane", "t2Plane"] as const) {
    const plane = value[planeName];
    const planeNumber = planeName === "t1Plane" ? "T1" : "T2";

    if (
      !isGovernedStatus(plane) ||
      !isRecord(plane) ||
      plane.plane !== planeNumber ||
      plane.status !== "NOT_OBSERVED" ||
      plane.planeId !==
        stableIdentity("plane", {
          executionId: expectedExecutionId,
          plane: planeNumber,
        })
    ) {
      demandFailure();
    }
  }

  if (!isJsonCompatible(value) || containsForbiddenSemanticKey(value)) {
    demandFailure();
  }
}
