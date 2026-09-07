import {
  type ChannelStatusOnlyRecord,
  type DomainDemandProvenance,
  type DomainDemandV1,
  type SourceVersionRecord,
  type T3Consequences,
} from "./DomainDemandV1";
import {
  HUMAN_STATE_SOURCE_NOT_PROVIDED_REASON_V1,
  UNOBSERVED_HUMAN_STATE_SOURCE_VERSION_ID_V1,
  type UnobservedDemandEpisodeV1,
} from "./DemandAdvanceInputV1";
import { stableIdentity } from "./StableIdentity";

const DOMAIN_DERIVATION_SOURCE: SourceVersionRecord = Object.freeze({
  sourceVersionId: stableIdentity("source-version", {
    sourceName: "StatusOnlyDomainDemandProducerV1",
    sourceVersion: "SPEC-DM-001/1.0",
  }),
  sourceName: "StatusOnlyDomainDemandProducerV1",
  sourceVersion: "SPEC-DM-001/1.0",
  role: "DOMAIN_DERIVATION",
});

const SOURCE_MANIFEST: readonly SourceVersionRecord[] = Object.freeze([
  Object.freeze({
    sourceVersionId: UNOBSERVED_HUMAN_STATE_SOURCE_VERSION_ID_V1,
    sourceName: "HumanStateObservationBoundaryV1",
    sourceVersion: "1.0",
    role: "HUMAN_STATE_SOURCE" as const,
  }),
  DOMAIN_DERIVATION_SOURCE,
]);

function provenance(): DomainDemandProvenance {
  return Object.freeze({
    sourceVersionId: DOMAIN_DERIVATION_SOURCE.sourceVersionId,
    transitionId: null,
    beforeHumanStateRef: null,
    afterHumanStateRef: null,
    eventId: null,
    observationId: null,
    windowId: null,
  });
}

function assertInput(input: UnobservedDemandEpisodeV1): void {
  if (
    input.kind !== "UNOBSERVED_HUMAN_STATE" ||
    typeof input.executionId !== "string" ||
    input.executionId.length === 0 ||
    typeof input.solutionTraceId !== "string" ||
    input.solutionTraceId.length === 0 ||
    !Array.isArray(input.solutionTransitionIds) ||
    new Set(input.solutionTransitionIds).size !==
      input.solutionTransitionIds.length ||
    input.solutionTransitionIds.some(
      (transitionId) =>
        typeof transitionId !== "string" || transitionId.length === 0
    ) ||
    !Array.isArray(input.humanStateBoundaries) ||
    input.humanStateBoundaries.length !==
      input.solutionTransitionIds.length + 1
  ) {
    throw new TypeError("Invalid unobserved Human-State episode.");
  }

  input.humanStateBoundaries.forEach((boundary, ordinal) => {
    if (
      typeof boundary !== "object" ||
      boundary === null ||
      boundary.ordinal !== ordinal ||
      typeof boundary.boundaryId !== "string" ||
      boundary.boundaryId.length === 0 ||
      boundary.status !== "NOT_OBSERVED" ||
      boundary.reason !== HUMAN_STATE_SOURCE_NOT_PROVIDED_REASON_V1 ||
      boundary.sourceVersionId !==
        UNOBSERVED_HUMAN_STATE_SOURCE_VERSION_ID_V1
    ) {
      throw new TypeError("Invalid unobserved Human-State boundary.");
    }
  });

  if (
    new Set(
      input.humanStateBoundaries.map((boundary) => boundary.boundaryId)
    ).size !== input.humanStateBoundaries.length
  ) {
    throw new TypeError("Duplicate unobserved Human-State boundary.");
  }
}

function statusOnlyRecord(
  scope: ChannelStatusOnlyRecord["scope"],
  semanticOwner: string,
  executionId: string
): ChannelStatusOnlyRecord {
  return Object.freeze({
    statusRecordId: stableIdentity("status-only", {
      scope,
      semanticOwner,
      executionId,
      reason: HUMAN_STATE_SOURCE_NOT_PROVIDED_REASON_V1,
    }),
    scope,
    status: "NOT_OBSERVED",
    reason: HUMAN_STATE_SOURCE_NOT_PROVIDED_REASON_V1,
    provenance: provenance(),
  });
}

export class StatusOnlyDomainDemandProducerV1 {
  produce(input: UnobservedDemandEpisodeV1): DomainDemandV1 {
    assertInput(input);

    const t3Consequences: T3Consequences = Object.freeze({
      grip: Object.freeze({
        semanticOwner: "G-H-GR1",
        propositionRecords: [],
        statusOnlyRecord: statusOnlyRecord(
          "grip",
          "G-H-GR1",
          input.executionId
        ),
      }),
      finger: Object.freeze({
        semanticOwner: "F-H-FR1",
        propositionRecords: [],
        statusOnlyRecord: statusOnlyRecord(
          "finger",
          "F-H-FR1",
          input.executionId
        ),
      }),
      orientation: Object.freeze({
        semanticOwner: "O-H-OR1",
        propositionRecords: [],
        statusOnlyRecord: statusOnlyRecord(
          "orientation",
          "O-H-OR1",
          input.executionId
        ),
      }),
      continuity: Object.freeze({
        semanticOwner: "C-H-CR1",
        propositionRecords: [],
        statusOnlyRecord: statusOnlyRecord(
          "continuity",
          "C-H-CR1",
          input.executionId
        ),
      }),
    });
    const planeProvenance = provenance();
    const t1Plane = Object.freeze({
      planeId: stableIdentity("plane", {
        executionId: input.executionId,
        plane: "T1",
      }),
      plane: "T1" as const,
      status: "NOT_OBSERVED" as const,
      reason: HUMAN_STATE_SOURCE_NOT_PROVIDED_REASON_V1,
      provenance: planeProvenance,
    });
    const t2Plane = Object.freeze({
      planeId: stableIdentity("plane", {
        executionId: input.executionId,
        plane: "T2",
      }),
      plane: "T2" as const,
      status: "NOT_OBSERVED" as const,
      reason: HUMAN_STATE_SOURCE_NOT_PROVIDED_REASON_V1,
      provenance: planeProvenance,
    });
    const artifactId = stableIdentity("domain-demand", {
      executionId: input.executionId,
      schemaId: "SPEC-DM-001",
      schemaVersion: "1.0",
      architecture: "P-C",
      claimClass: "T3_BOUNDED_DOMAIN_DEMAND",
    });

    return Object.freeze({
      artifactId,
      schemaId: "SPEC-DM-001",
      schemaVersion: "1.0",
      architecture: "P-C",
      claimClass: "T3_BOUNDED_DOMAIN_DEMAND",
      executionEpisode: {
        executionId: input.executionId,
        transitionRefs: [],
        eventRecords: [],
        observationRecords: [],
        windowRecords: [],
        evidenceEdges: [],
        t3Consequences,
        sourceVersionManifest: [...SOURCE_MANIFEST],
      },
      t1Plane,
      t2Plane,
    });
  }
}
