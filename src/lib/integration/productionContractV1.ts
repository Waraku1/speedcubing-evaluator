import type {
  TransitionTraceV1,
} from "../../types/evaluate-v1";
import type {
  CubeFaceletStateV1,
  SolverResultV1,
} from "../../types/solver-v1";
import { applyMove, type Move } from "../cube/moves";
import { createCubeFaceletStateV1 } from "../cube/cubeStateV1";
import type { DomainDemandV1 } from "../evaluator/demand/DomainDemandV1";
import {
  HUMAN_STATE_SOURCE_NOT_PROVIDED_REASON_V1,
  UNOBSERVED_HUMAN_STATE_SOURCE_VERSION_ID_V1,
} from "../evaluator/demand/DemandAdvanceInputV1";
import { stableIdentity } from "../evaluator/demand/StableIdentity";
import type { VerifiedSolutionV1 } from "../solver/solutionVerifierV1";
import { EvaluateV1Error } from "./evaluateErrorsV1";
import type { BuiltSolutionTraceV1 } from "./SolutionTraceBuilderV1";

const DOMAIN_KEYS = [
  "architecture",
  "artifactId",
  "claimClass",
  "executionEpisode",
  "schemaId",
  "schemaVersion",
  "t1Plane",
  "t2Plane",
] as const;

const EPISODE_KEYS = [
  "eventRecords",
  "evidenceEdges",
  "executionId",
  "observationRecords",
  "sourceVersionManifest",
  "t3Consequences",
  "transitionRefs",
  "windowRecords",
] as const;

const TRACE_KEYS = [
  "cubeStateBoundaries",
  "executionId",
  "humanStateObservationBoundaries",
  "schemaId",
  "schemaVersion",
  "solutionId",
  "solutionTraceId",
  "solutionTransitions",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[]
): boolean {
  return (
    Object.keys(record).sort().join("|") === [...keys].sort().join("|")
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function traceFailure(): never {
  throw new EvaluateV1Error("TRANSITION_GENERATION_FAILED");
}

function demandFailure(): never {
  throw new EvaluateV1Error("DEMAND_CONTRACT_FAILED");
}

function expectedSolutionId(
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

export function assertSolutionTraceV1(
  value: unknown,
  input: CubeFaceletStateV1,
  solverResult: SolverResultV1,
  verified: VerifiedSolutionV1
): asserts value is BuiltSolutionTraceV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, TRACE_KEYS) ||
    value.schemaId !== "TransitionTraceV1" ||
    value.schemaVersion !== "1.0" ||
    value.solutionId !== expectedSolutionId(input, solverResult, verified) ||
    !isNonEmptyString(value.solutionTraceId) ||
    !isNonEmptyString(value.executionId) ||
    !Array.isArray(value.cubeStateBoundaries) ||
    !Array.isArray(value.solutionTransitions) ||
    !Array.isArray(value.humanStateObservationBoundaries) ||
    value.solutionTransitions.length !== verified.moves.length ||
    value.cubeStateBoundaries.length !== verified.moves.length + 1 ||
    value.humanStateObservationBoundaries.length !== verified.moves.length + 1
  ) {
    traceFailure();
  }

  const cubeStateIds: string[] = [];
  const cubeBoundaryIds: string[] = [];
  let expectedFacelets = input.facelets;

  value.cubeStateBoundaries.forEach((boundary, ordinal) => {
    if (ordinal > 0) {
      expectedFacelets = applyMove(
        expectedFacelets,
        verified.moves[ordinal - 1] as Move
      );
    }
    const expectedState = createCubeFaceletStateV1(expectedFacelets);

    if (
      !isRecord(boundary) ||
      !hasExactKeys(boundary, ["boundaryId", "format", "ordinal", "stateId"]) ||
      boundary.ordinal !== ordinal ||
      boundary.format !== "URFDLB_FACELETS_V1" ||
      boundary.stateId !== expectedState.stateId ||
      !isNonEmptyString(boundary.boundaryId) ||
      boundary.boundaryId !==
        stableIdentity("cube-state-boundary", {
          solutionId: value.solutionId,
          ordinal,
          stateId: boundary.stateId,
        })
    ) {
      traceFailure();
    }

    cubeStateIds.push(boundary.stateId);
    cubeBoundaryIds.push(boundary.boundaryId);
  });

  if (
    cubeStateIds[0] !== input.stateId ||
    new Set(cubeBoundaryIds).size !== cubeBoundaryIds.length
  ) {
    traceFailure();
  }

  const solutionTransitionIds: string[] = [];

  value.solutionTransitions.forEach((transition, ordinal) => {
    if (
      !isRecord(transition) ||
      !hasExactKeys(transition, [
        "afterCubeStateId",
        "beforeCubeStateId",
        "move",
        "moveEventId",
        "ordinal",
        "transitionId",
      ]) ||
      transition.ordinal !== ordinal ||
      transition.move !== verified.moves[ordinal] ||
      transition.beforeCubeStateId !== cubeStateIds[ordinal] ||
      transition.afterCubeStateId !== cubeStateIds[ordinal + 1] ||
      transition.moveEventId !==
        stableIdentity("solution-move-event", {
          solutionId: value.solutionId,
          ordinal,
          move: transition.move,
        }) ||
      transition.transitionId !==
        stableIdentity("solution-transition", {
          solutionId: value.solutionId,
          ordinal,
          beforeCubeStateId: transition.beforeCubeStateId,
          afterCubeStateId: transition.afterCubeStateId,
          moveEventId: transition.moveEventId,
        })
    ) {
      traceFailure();
    }

    solutionTransitionIds.push(transition.transitionId as string);
  });

  if (new Set(solutionTransitionIds).size !== solutionTransitionIds.length) {
    traceFailure();
  }

  const expectedSolutionTraceId = stableIdentity("solution-trace", {
    solutionId: value.solutionId,
    cubeBoundaryIds,
    solutionTransitionIds,
  });
  const humanStateBoundaryIds: string[] = [];

  value.humanStateObservationBoundaries.forEach((boundary, ordinal) => {
    if (
      !isRecord(boundary) ||
      !hasExactKeys(boundary, [
        "boundaryId",
        "ordinal",
        "reason",
        "sourceVersionId",
        "status",
      ]) ||
      boundary.ordinal !== ordinal ||
      boundary.status !== "NOT_OBSERVED" ||
      boundary.reason !== HUMAN_STATE_SOURCE_NOT_PROVIDED_REASON_V1 ||
      boundary.sourceVersionId !==
        UNOBSERVED_HUMAN_STATE_SOURCE_VERSION_ID_V1 ||
      boundary.boundaryId !==
        stableIdentity("human-state-observation-boundary", {
          solutionTraceId: expectedSolutionTraceId,
          ordinal,
          status: "NOT_OBSERVED",
          reason: HUMAN_STATE_SOURCE_NOT_PROVIDED_REASON_V1,
          sourceVersionId: UNOBSERVED_HUMAN_STATE_SOURCE_VERSION_ID_V1,
        })
    ) {
      traceFailure();
    }

    humanStateBoundaryIds.push(boundary.boundaryId as string);
  });

  const expectedExecutionId = stableIdentity("execution", {
    kind: "UNOBSERVED_HUMAN_STATE",
    solutionTraceId: expectedSolutionTraceId,
    solutionTransitionIds,
    humanStateBoundaryIds,
  });

  if (
    value.solutionTraceId !== expectedSolutionTraceId ||
    value.executionId !== expectedExecutionId
  ) {
    traceFailure();
  }
}

function containsForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsForbiddenKey);
  }

  if (!isRecord(value)) {
    return false;
  }

  const forbidden = new Set([
    "move",
    "moveToken",
    "score",
    "rank",
    "total",
    "weight",
    "entropy",
    "interpretation",
    "evaluation",
  ]);

  return Object.entries(value).some(
    ([key, nested]) => forbidden.has(key) || containsForbiddenKey(nested)
  );
}

function containsNumber(value: unknown): boolean {
  if (typeof value === "number") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some(containsNumber);
  }

  return isRecord(value) && Object.values(value).some(containsNumber);
}

function assertProvenance(
  value: unknown,
  sourceVersionIds: ReadonlySet<string>
): void {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "afterHumanStateRef",
      "beforeHumanStateRef",
      "eventId",
      "observationId",
      "sourceVersionId",
      "transitionId",
      "windowId",
    ]) ||
    !isNonEmptyString(value.sourceVersionId) ||
    !sourceVersionIds.has(value.sourceVersionId) ||
    [
      value.afterHumanStateRef,
      value.beforeHumanStateRef,
      value.eventId,
      value.observationId,
      value.transitionId,
      value.windowId,
    ].some((field) => field !== null)
  ) {
    demandFailure();
  }
}

export function assertStatusOnlyDomainDemandV1(
  value: unknown,
  trace: TransitionTraceV1
): asserts value is DomainDemandV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, DOMAIN_KEYS) ||
    value.schemaId !== "SPEC-DM-001" ||
    value.schemaVersion !== "1.0" ||
    value.architecture !== "P-C" ||
    value.claimClass !== "T3_BOUNDED_DOMAIN_DEMAND" ||
    !isRecord(value.executionEpisode) ||
    !hasExactKeys(value.executionEpisode, EPISODE_KEYS) ||
    value.executionEpisode.executionId !== trace.executionId
  ) {
    demandFailure();
  }

  const episode = value.executionEpisode;

  if (
    !Array.isArray(episode.transitionRefs) ||
    episode.transitionRefs.length !== 0 ||
    !Array.isArray(episode.eventRecords) ||
    episode.eventRecords.length !== 0 ||
    !Array.isArray(episode.observationRecords) ||
    episode.observationRecords.length !== 0 ||
    !Array.isArray(episode.windowRecords) ||
    episode.windowRecords.length !== 0 ||
    !Array.isArray(episode.evidenceEdges) ||
    episode.evidenceEdges.length !== 0 ||
    !Array.isArray(episode.sourceVersionManifest) ||
    episode.sourceVersionManifest.length < 2 ||
    !isRecord(episode.t3Consequences) ||
    !hasExactKeys(episode.t3Consequences, [
      "continuity",
      "finger",
      "grip",
      "orientation",
    ])
  ) {
    demandFailure();
  }

  const sourceVersionIds = new Set<string>();

  for (const source of episode.sourceVersionManifest) {
    if (
      !isRecord(source) ||
      !hasExactKeys(source, [
        "role",
        "sourceName",
        "sourceVersion",
        "sourceVersionId",
      ]) ||
      !isNonEmptyString(source.sourceVersionId) ||
      !isNonEmptyString(source.sourceName) ||
      !isNonEmptyString(source.sourceVersion) ||
      ![
        "HUMAN_STATE_SOURCE",
        "TRANSITION_SOURCE",
        "SUPPLEMENTAL_EVIDENCE",
        "DOMAIN_DERIVATION",
      ].includes(source.role as string)
    ) {
      demandFailure();
    }
    sourceVersionIds.add(source.sourceVersionId);
  }

  if (
    sourceVersionIds.size !== episode.sourceVersionManifest.length ||
    !sourceVersionIds.has(UNOBSERVED_HUMAN_STATE_SOURCE_VERSION_ID_V1)
  ) {
    demandFailure();
  }

  const channelContracts = [
    ["grip", "G-H-GR1"],
    ["finger", "F-H-FR1"],
    ["orientation", "O-H-OR1"],
    ["continuity", "C-H-CR1"],
  ] as const;

  for (const [scope, semanticOwner] of channelContracts) {
    const channel = episode.t3Consequences[scope];

    if (
      !isRecord(channel) ||
      !hasExactKeys(channel, [
        "propositionRecords",
        "semanticOwner",
        "statusOnlyRecord",
      ]) ||
      channel.semanticOwner !== semanticOwner ||
      !Array.isArray(channel.propositionRecords) ||
      channel.propositionRecords.length !== 0 ||
      !isRecord(channel.statusOnlyRecord) ||
      !hasExactKeys(channel.statusOnlyRecord, [
        "provenance",
        "reason",
        "scope",
        "status",
        "statusRecordId",
      ]) ||
      channel.statusOnlyRecord.scope !== scope ||
      channel.statusOnlyRecord.status !== "NOT_OBSERVED" ||
      channel.statusOnlyRecord.reason !==
        HUMAN_STATE_SOURCE_NOT_PROVIDED_REASON_V1 ||
      channel.statusOnlyRecord.statusRecordId !==
        stableIdentity("status-only", {
          scope,
          semanticOwner,
          executionId: trace.executionId,
          reason: HUMAN_STATE_SOURCE_NOT_PROVIDED_REASON_V1,
        })
    ) {
      demandFailure();
    }

    assertProvenance(
      channel.statusOnlyRecord.provenance,
      sourceVersionIds
    );
  }

  for (const [planeName, plane] of [
    ["T1", value.t1Plane],
    ["T2", value.t2Plane],
  ] as const) {
    if (
      !isRecord(plane) ||
      !hasExactKeys(plane, [
        "plane",
        "planeId",
        "provenance",
        "reason",
        "status",
      ]) ||
      plane.plane !== planeName ||
      plane.status !== "NOT_OBSERVED" ||
      plane.reason !== HUMAN_STATE_SOURCE_NOT_PROVIDED_REASON_V1 ||
      plane.planeId !==
        stableIdentity("plane", {
          executionId: trace.executionId,
          plane: planeName,
        })
    ) {
      demandFailure();
    }
    assertProvenance(plane.provenance, sourceVersionIds);
  }

  const expectedArtifactId = stableIdentity("domain-demand", {
    executionId: trace.executionId,
    schemaId: "SPEC-DM-001",
    schemaVersion: "1.0",
    architecture: "P-C",
    claimClass: "T3_BOUNDED_DOMAIN_DEMAND",
  });

  if (
    value.artifactId !== expectedArtifactId ||
    containsNumber(value) ||
    containsForbiddenKey(value)
  ) {
    demandFailure();
  }
}
