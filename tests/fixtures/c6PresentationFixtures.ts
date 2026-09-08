import type {
  UiDemandValidityStatusV1,
  UiMoveV1,
} from "../../src/lib/ui/evaluateUiTypesV1";

export const C6_BUILD_COMMIT = "c".repeat(40);
export const C6_SOLVED_FACELETS =
  "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
export const C6_SOURCE_VERSION_ID = "source:c6:000";

const C6_MOVE_CYCLE: readonly UiMoveV1[] = [
  "R",
  "U",
  "R'",
  "U'",
  "F2",
  "L",
  "D2",
  "B'",
];

export const C6_LONG_SOLUTION_MOVES: readonly UiMoveV1[] = Array.from(
  { length: 80 },
  (_, index) => C6_MOVE_CYCLE[index % C6_MOVE_CYCLE.length]
);

type ProvenanceReferences = Readonly<{
  transitionId?: string | null;
  beforeHumanStateRef?: string | null;
  afterHumanStateRef?: string | null;
  eventId?: string | null;
  observationId?: string | null;
  windowId?: string | null;
}>;

export function c6Provenance(references: ProvenanceReferences = {}) {
  return {
    sourceVersionId: C6_SOURCE_VERSION_ID,
    transitionId: references.transitionId ?? null,
    beforeHumanStateRef: references.beforeHumanStateRef ?? null,
    afterHumanStateRef: references.afterHumanStateRef ?? null,
    eventId: references.eventId ?? null,
    observationId: references.observationId ?? null,
    windowId: references.windowId ?? null,
  };
}

function governedStatus(
  status: UiDemandValidityStatusV1,
  label: string,
  references: ProvenanceReferences = {}
) {
  return {
    status,
    reason: `Synthetic governed ${label} status.`,
    provenance: c6Provenance(references),
  };
}

function statusOnly(scope: "grip" | "finger" | "orientation" | "continuity") {
  return {
    statusRecordId: `status:c6:${scope}`,
    scope,
    status: "NOT_OBSERVED",
    reason: "HUMAN_STATE_SOURCE_NOT_PROVIDED",
    provenance: c6Provenance(),
  };
}

function sourceVersionManifest(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    sourceVersionId: `source:c6:${String(index).padStart(3, "0")}`,
    sourceName: index === 0 ? "C6 synthetic fixture source" : `C6 trace source ${index}`,
    sourceVersion: "1.0",
    role: index === 0 ? "HUMAN_STATE_SOURCE" : "SUPPLEMENTAL_EVIDENCE",
  }));
}

type C6FixtureOptions = Readonly<{
  moves?: readonly UiMoveV1[];
  requestId?: string;
  sourceCount?: number;
}>;

export function createC6StatusOnlyFixture(
  options: C6FixtureOptions = {}
): Record<string, unknown> {
  const moves = [...(options.moves ?? [])];
  const requestId = options.requestId ?? "request:c6:solved";
  const executionId = "execution:c6:fixed";
  const solutionId = "solution:c6:fixed";
  const artifactId = "demand:c6:fixed";
  const stateIds = Array.from(
    { length: moves.length + 1 },
    (_, index) => `cube:c6:${index}`
  );
  const transitions = moves.map((move, ordinal) => ({
    ordinal,
    transitionId: `transition:c6:${ordinal}`,
    beforeCubeStateId: stateIds[ordinal],
    afterCubeStateId: stateIds[ordinal + 1],
    moveEventId: `move-event:c6:${ordinal}`,
    move,
  }));

  return {
    schemaVersion: "1.0",
    requestId,
    result: {
      cubeState: {
        stateId: stateIds[0],
        format: "URFDLB_FACELETS_V1",
      },
      solution: {
        solutionId,
        moves,
        htm: moves.length,
        qtm: moves.reduce(
          (total, move) => total + (move.endsWith("2") ? 2 : 1),
          0
        ),
        verified: true,
        solver: {
          solverRunId: "solver-run:c6:fixed",
          id: "cubejs",
          version: "1.3.2",
          adapterVersion: "1.0",
          cacheHit: false,
          cacheKeyVersion: "1",
        },
      },
      transitionTrace: {
        schemaId: "TransitionTraceV1",
        schemaVersion: "1.0",
        executionId,
        solutionId,
        cubeStateBoundaries: stateIds.map((stateId, ordinal) => ({
          boundaryId: `cube-boundary:c6:${ordinal}`,
          ordinal,
          stateId,
          format: "URFDLB_FACELETS_V1",
        })),
        solutionTransitions: transitions,
        humanStateObservationBoundaries: stateIds.map((_stateId, ordinal) => ({
          boundaryId: `human-boundary:c6:${ordinal}`,
          ordinal,
          status: "NOT_OBSERVED",
          reason: "HUMAN_STATE_SOURCE_NOT_PROVIDED",
          sourceVersionId: C6_SOURCE_VERSION_ID,
        })),
      },
      domainDemand: {
        artifactId,
        schemaId: "SPEC-DM-001",
        schemaVersion: "1.0",
        architecture: "P-C",
        claimClass: "T3_BOUNDED_DOMAIN_DEMAND",
        executionEpisode: {
          executionId,
          transitionRefs: [],
          eventRecords: [],
          observationRecords: [],
          windowRecords: [],
          evidenceEdges: [],
          t3Consequences: {
            grip: {
              semanticOwner: "G-H-GR1",
              propositionRecords: [],
              statusOnlyRecord: statusOnly("grip"),
            },
            finger: {
              semanticOwner: "F-H-FR1",
              propositionRecords: [],
              statusOnlyRecord: statusOnly("finger"),
            },
            orientation: {
              semanticOwner: "O-H-OR1",
              propositionRecords: [],
              statusOnlyRecord: statusOnly("orientation"),
            },
            continuity: {
              semanticOwner: "C-H-CR1",
              propositionRecords: [],
              statusOnlyRecord: statusOnly("continuity"),
            },
          },
          sourceVersionManifest: sourceVersionManifest(
            options.sourceCount ?? 1
          ),
        },
        t1Plane: {
          planeId: "plane:c6:t1",
          plane: "T1",
          status: "NOT_OBSERVED",
          reason: "HUMAN_STATE_SOURCE_NOT_PROVIDED",
          provenance: c6Provenance(),
        },
        t2Plane: {
          planeId: "plane:c6:t2",
          plane: "T2",
          status: "NOT_OBSERVED",
          reason: "HUMAN_STATE_SOURCE_NOT_PROVIDED",
          provenance: c6Provenance(),
        },
      },
      downstreamAvailability: {
        schemaId: "DownstreamAvailabilityV1",
        schemaVersion: "1.0",
        demandArtifactId: artifactId,
        demandSchemaId: "SPEC-DM-001",
        demandSchemaVersion: "1.0",
        provenance: {
          executionId,
          release: "2026-09-10-rc",
          buildCommit: C6_BUILD_COMMIT,
        },
        entropy: {
          status: "NOT_SEMANTICALLY_AVAILABLE",
          reason: "ENTROPY_SEMANTICS_UNCLOSED",
        },
        interpretation: {
          status: "NOT_SEMANTICALLY_AVAILABLE",
          reason: "ENTROPY_SEMANTICS_UNCLOSED",
        },
        evaluation: {
          status: "NOT_SEMANTICALLY_AVAILABLE",
          reason: "ENTROPY_SEMANTICS_UNCLOSED",
        },
      },
      warnings: [
        {
          code: "HUMAN_STATE_NOT_OBSERVED",
          executionId,
          transitionIds: transitions.map((transition) => transition.transitionId),
        },
      ],
      timings: { solverDurationMs: 7 },
      build: { release: "2026-09-10-rc", commit: C6_BUILD_COMMIT },
    },
  };
}

export function createC6SolvedFixture(): Record<string, unknown> {
  return createC6StatusOnlyFixture();
}

export function createC6NonSolvedFixture(): Record<string, unknown> {
  return createC6StatusOnlyFixture({
    moves: ["R", "U", "R'", "U'"],
    requestId: "request:c6:non-solved",
  });
}

export function createC6LongSolutionFixture(): Record<string, unknown> {
  return createC6StatusOnlyFixture({
    moves: C6_LONG_SOLUTION_MOVES,
    requestId: "request:c6:long-solution",
  });
}

export function createC6LargeTraceFixture(): Record<string, unknown> {
  return createC6StatusOnlyFixture({
    requestId: "request:c6:large-trace",
    sourceCount: 501,
  });
}

export function createC6ValidityVocabularyFixture(): Record<string, unknown> {
  const fixture = createC6StatusOnlyFixture({
    moves: ["R"],
    requestId: "request:c6:validity-vocabulary",
  });
  const result = fixture.result as Record<string, unknown>;
  const demand = result.domainDemand as Record<string, unknown>;
  const episode = demand.executionEpisode as Record<string, unknown>;
  const consequences = episode.t3Consequences as Record<string, unknown>;
  const references = {
    transitionId: "transition:c6:0",
    beforeHumanStateRef: "human-boundary:c6:0",
    afterHumanStateRef: "human-boundary:c6:1",
    eventId: "event:c6:0",
    observationId: "observation:c6:0",
    windowId: "window:c6:0",
  };
  const base = (id: string, status: UiDemandValidityStatusV1) => ({
    propositionId: `proposition:c6:${id}`,
    transitionId: references.transitionId,
    eventId: references.eventId,
    observationId: references.observationId,
    windowId: references.windowId,
    status,
    reason: `Synthetic governed ${status} proposition.`,
    provenance: c6Provenance(references),
  });
  const path = governedStatus("CENSORED", "path", references);

  Object.assign(consequences.grip as Record<string, unknown>, {
    propositionRecords: [
      {
        ...base("grip", "VALID"),
        semanticOwner: "G-H-GR1",
        side: "LEFT",
        contactCountDirection: "INCREASE",
        stabilizationDirection: "UNCHANGED",
        sourceFields: ["grip.leftContactCount", "grip.leftStabilizing"],
        contactIdentity: governedStatus("MISSING", "contact identity", references),
        attribution: governedStatus("INVALID", "attribution", references),
        path,
      },
    ],
    statusOnlyRecord: null,
  });
  Object.assign(consequences.finger as Record<string, unknown>, {
    propositionRecords: [
      {
        ...base("finger", "SATURATED"),
        semanticOwner: "F-H-FR1",
        fingerId: "L_INDEX",
        fatigueSourceDirection: "DEPLETION",
        availabilityDirection: "LOST",
        sourceFields: ["fingers.fatigue.L_INDEX", "fingers.available.L_INDEX"],
        resourceSemantics: governedStatus("NOT_OBSERVED", "resource semantics", references),
        path: governedStatus("PATH_UNKNOWN", "finger path", references),
      },
    ],
    statusOnlyRecord: null,
  });
  Object.assign(consequences.orientation as Record<string, unknown>, {
    propositionRecords: [
      {
        ...base("orientation", "QUALITY_UNKNOWN"),
        semanticOwner: "O-H-OR1",
        xDirection: "INCREASE",
        yDirection: "DECREASE",
        zDirection: "UNCHANGED",
        sourceFields: ["orientation.x", "orientation.y", "orientation.z"],
        frame: governedStatus("QUALITY_UNKNOWN", "frame", references),
        transform: governedStatus("VALID", "transform", references),
        equivalence: governedStatus("MISSING", "equivalence", references),
        path,
      },
    ],
    statusOnlyRecord: null,
  });
  Object.assign(consequences.continuity as Record<string, unknown>, {
    propositionRecords: [
      {
        ...base("continuity", "VALID"),
        semanticOwner: "C-H-CR1",
        continuityDirection: "GAIN_OR_RECOVERY",
        sourceFields: ["momentum.continuity"],
        recoveryClassification: governedStatus("QUALITY_UNKNOWN", "recovery classification", references),
        path,
      },
    ],
    statusOnlyRecord: null,
  });

  return fixture;
}

export function createC6ErrorFixture() {
  return {
    schemaVersion: "1.0",
    requestId: "request:c6:error",
    error: {
      code: "SOLVER_UNAVAILABLE",
      message: "Synthetic server diagnostic that must not be displayed.",
      stage: "SOLVER",
      retryable: true,
    },
  };
}
