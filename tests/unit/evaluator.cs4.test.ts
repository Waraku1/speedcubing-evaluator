import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  DOMAIN_DEMAND_VALIDITY_STATUSES,
  type DemandGovernedTransition,
  type DomainDemandProvenance,
  type DomainDemandV1,
  type ObservationRecord,
  type TransitionDemandEvidence,
} from "../../src/lib/evaluator/demand/DomainDemandV1";
import { createGovernedValue } from "../../src/lib/evaluator/demand/SourceEvidence";
import { EvaluatorPipeline } from "../../src/lib/evaluator/pipeline/EvaluatorPipeline";

import type { HumanState } from "../../src/lib/evaluator/state/HumanState";
import type { Transition } from "../../src/lib/evaluator/transition/Transition";

type GovernedTransition = Transition & DemandGovernedTransition;

function createHumanState(
  mutate: (state: HumanState) => void = () => undefined
): HumanState {
  const state: HumanState = {
    orientation: {
      x: 0,
      y: 0,
      z: 0,
      certainty: 1,
    },
    grip: {
      leftContactCount: 3,
      rightContactCount: 3,
      leftStabilizing: true,
      rightStabilizing: true,
    },
    fingers: {
      available: {
        L_THUMB: true,
        L_INDEX: true,
        L_MIDDLE: true,
        R_THUMB: true,
        R_INDEX: true,
        R_MIDDLE: true,
      },
      fatigue: {
        L_THUMB: 0,
        L_INDEX: 0,
        L_MIDDLE: 0,
        R_THUMB: 0,
        R_INDEX: 0,
        R_MIDDLE: 0,
      },
      coordination: 1,
    },
    momentum: {
      continuity: 1,
      velocity: 1,
    },
  };

  mutate(state);

  return state;
}

function createTransition(
  before: HumanState,
  after: HumanState,
  evidence: TransitionDemandEvidence | null = null
): GovernedTransition {
  const transition: GovernedTransition = {
    before,
    move: "R",
    after,
  };

  if (evidence) {
    transition.domainDemandEvidence = evidence;
  }

  return transition;
}

function extract(transitions: readonly Transition[]): DomainDemandV1 {
  return new EvaluatorPipeline().advanceToDemand(transitions);
}

function observation(
  artifact: DomainDemandV1,
  scope: ObservationRecord["scope"],
  ordinal = 0
): ObservationRecord {
  const matching = artifact.executionEpisode.observationRecords.filter(
    (record) => record.scope === scope
  );
  const found = matching[ordinal];

  if (!found) {
    throw new Error(`Missing ${scope} observation at ordinal ${ordinal}`);
  }

  return found;
}

function sourceTree(): string {
  const demandDirectory = path.resolve(
    process.cwd(),
    "src/lib/evaluator/demand"
  );
  const demandSource = readdirSync(demandDirectory)
    .filter((fileName) => fileName.endsWith(".ts"))
    .sort()
    .map((fileName) =>
      readFileSync(path.join(demandDirectory, fileName), "utf8")
    )
    .join("\n");
  const pipelineSource = readFileSync(
    path.resolve(
      process.cwd(),
      "src/lib/evaluator/pipeline/EvaluatorPipeline.ts"
    ),
    "utf8"
  );

  return `${demandSource}\n${pipelineSource}`;
}

function assertJsonCompatible(value: unknown): void {
  if (value === null) {
    return;
  }

  expect(value).not.toBeUndefined();

  if (typeof value === "number") {
    expect(Number.isFinite(value)).toBe(true);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach(assertJsonCompatible);
    return;
  }

  if (typeof value === "object") {
    expect(value).not.toBeInstanceOf(Date);
    expect(value).not.toBeInstanceOf(Map);
    expect(value).not.toBeInstanceOf(Set);
    Object.values(value).forEach(assertJsonCompatible);
  }
}

function objectKeys(value: unknown): string[] {
  if (value === null || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(objectKeys);
  }

  return Object.entries(value).flatMap(([key, nested]) => [
    key,
    ...objectKeys(nested),
  ]);
}

const emptyProvenance: DomainDemandProvenance = {
  sourceVersionId: "source-version:test",
  transitionId: null,
  beforeHumanStateRef: null,
  afterHumanStateRef: null,
  eventId: null,
  observationId: null,
  windowId: null,
};

describe("C1-DM Production v1 Domain Demand contract", () => {
  it("CC-01 keeps opposite grip loss/gain distinct and retains side", () => {
    const before = createHumanState();
    const after = createHumanState((state) => {
      state.grip.leftContactCount = 2;
      state.grip.rightContactCount = 4;
    });
    const grip = extract([
      createTransition(before, after),
    ]).executionEpisode.t3Consequences.grip.propositionRecords;

    expect(
      grip.map(({ side, contactCountDirection }) => ({
        side,
        contactCountDirection,
      }))
    ).toEqual([
      { side: "LEFT", contactCountDirection: "DECREASE" },
      { side: "RIGHT", contactCountDirection: "INCREASE" },
    ]);
  });

  it("CC-02 keeps per-digit depletion and recovery as separate episodes", () => {
    const initial = createHumanState();
    const depleted = createHumanState((state) => {
      state.fingers.fatigue.L_INDEX = 0.8;
    });
    const recovered = createHumanState((state) => {
      state.fingers.fatigue.L_INDEX = 0.2;
    });
    const finger = extract([
      createTransition(initial, depleted),
      createTransition(depleted, recovered),
    ]).executionEpisode.t3Consequences.finger.propositionRecords.filter(
      (record) => record.fingerId === "L_INDEX"
    );

    expect(
      finger.map((record) => record.fatigueSourceDirection)
    ).toEqual(["DEPLETION", "RECOVERY"]);
    expect(new Set(finger.map((record) => record.propositionId)).size).toBe(2);
  });

  it("CC-03 serializes equal grip totals on different sides differently", () => {
    const before = createHumanState();
    const leftLoss = createHumanState((state) => {
      state.grip.leftContactCount = 2;
    });
    const rightLoss = createHumanState((state) => {
      state.grip.rightContactCount = 2;
    });
    const leftArtifact = extract([
      createTransition(before, leftLoss),
    ]);
    const rightArtifact = extract([
      createTransition(before, rightLoss),
    ]);

    expect(leftArtifact.artifactId).not.toBe(rightArtifact.artifactId);
    expect(JSON.stringify(leftArtifact)).not.toBe(
      JSON.stringify(rightArtifact)
    );
  });

  it("CC-04 preserves one-digit and multi-digit distributions", () => {
    const before = createHumanState();
    const oneDigit = createHumanState((state) => {
      state.fingers.fatigue.L_INDEX = 1;
    });
    const twoDigits = createHumanState((state) => {
      state.fingers.fatigue.L_INDEX = 0.5;
      state.fingers.fatigue.R_INDEX = 0.5;
    });
    const changedDigits = (artifact: DomainDemandV1) =>
      artifact.executionEpisode.t3Consequences.finger.propositionRecords
        .filter(
          (record) => record.fatigueSourceDirection === "DEPLETION"
        )
        .map((record) => record.fingerId);

    expect(
      changedDigits(extract([createTransition(before, oneDigit)]))
    ).toEqual(["L_INDEX"]);
    expect(
      changedDigits(extract([createTransition(before, twoDigits)]))
    ).toEqual(["L_INDEX", "R_INDEX"]);
  });

  it("CC-05 represents xyz configuration while quarantining certainty", () => {
    const before = createHumanState();
    const after = createHumanState((state) => {
      state.orientation.certainty = 0;
    });
    const artifact = extract([createTransition(before, after)]);
    const orientation =
      artifact.executionEpisode.t3Consequences.orientation
        .propositionRecords[0];
    const certainty = observation(
      artifact,
      "ORIENTATION_CERTAINTY_QUARANTINE"
    );

    expect(orientation.sourceFields).toEqual([
      "orientation.x",
      "orientation.y",
      "orientation.z",
    ]);
    expect([
      orientation.xDirection,
      orientation.yDirection,
      orientation.zDirection,
    ]).toEqual(["UNCHANGED", "UNCHANGED", "UNCHANGED"]);
    expect(certainty.semanticUse).toBe("QUARANTINED_CONTEXT");
    expect(
      artifact.executionEpisode.evidenceEdges.some(
        (edge) => edge.observationId === certainty.observationId
      )
    ).toBe(false);
  });

  it("CC-06 distinguishes an observed path from PATH_UNKNOWN at equal endpoints", () => {
    const before = createHumanState();
    const after = createHumanState();
    const unknown = extract([createTransition(before, after)]);
    const observedEvidence: TransitionDemandEvidence = {
      sourceName: "motion-capture",
      sourceVersion: "7",
      fieldValidity: [],
      path: {
        status: "VALID",
        reason: "Motion capture supplied the within-window path.",
        pathIdentity: "path:observed-7",
      },
      window: null,
    };
    const observed = extract([
      createTransition(before, after, observedEvidence),
    ]);

    expect(unknown.executionEpisode.windowRecords[0].status).toBe(
      "PATH_UNKNOWN"
    );
    expect(observed.executionEpisode.windowRecords[0]).toMatchObject({
      status: "VALID",
      pathIdentity: "path:observed-7",
    });
    expect(observed.artifactId).not.toBe(unknown.artifactId);
  });

  it("CC-07 keeps continuity disruption and gain/recovery separately linked", () => {
    const initial = createHumanState();
    const disrupted = createHumanState((state) => {
      state.momentum.continuity = 0.25;
    });
    const regained = createHumanState((state) => {
      state.momentum.continuity = 0.8;
    });
    const artifact = extract([
      createTransition(initial, disrupted),
      createTransition(disrupted, regained),
    ]);
    const continuity =
      artifact.executionEpisode.t3Consequences.continuity
        .propositionRecords;

    expect(
      continuity.map((record) => record.continuityDirection)
    ).toEqual(["LOSS", "GAIN_OR_RECOVERY"]);
    expect(
      continuity.map((record) =>
        artifact.executionEpisode.evidenceEdges.find(
          (edge) => edge.propositionId === record.propositionId
        )?.evidenceEdgeId
      )
    ).toHaveLength(2);
  });

  it("CC-08 keeps VALID zero distinct from every non-valid status", () => {
    const values = DOMAIN_DEMAND_VALIDITY_STATUSES.map((status) =>
      createGovernedValue({
        rawValue:
          status === "MISSING" || status === "NOT_OBSERVED"
            ? undefined
            : status === "INVALID"
              ? Number.NaN
              : 0,
        sourceField: "test.scalar",
        provenance: emptyProvenance,
        declaredStatus: status,
        declaredReason: `Source declared ${status}.`,
      })
    );

    expect(values.map((value) => value.status)).toEqual(
      DOMAIN_DEMAND_VALIDITY_STATUSES
    );
    expect(values[0]).toMatchObject({ status: "VALID", value: 0 });
    expect(values.slice(1).every((value) => value.status !== "VALID")).toBe(
      true
    );
    expect(values.find((value) => value.status === "MISSING")?.value).toBe(
      null
    );

    const invalidAfter = createHumanState((state) => {
      state.grip.leftContactCount = Number.NaN;
    });
    const missingAfter = createHumanState();

    delete (missingAfter.grip as Partial<HumanState["grip"]>)
      .leftContactCount;

    const invalidField = observation(
      extract([createTransition(createHumanState(), invalidAfter)]),
      "GRIP_ENDPOINTS"
    ).fields.find(
      (record) => record.sourceField === "grip.leftContactCount"
    )?.after;
    const missingField = observation(
      extract([createTransition(createHumanState(), missingAfter)]),
      "GRIP_ENDPOINTS"
    ).fields.find(
      (record) => record.sourceField === "grip.leftContactCount"
    )?.after;

    expect(invalidField).toMatchObject({ status: "INVALID", value: null });
    expect(missingField).toMatchObject({ status: "MISSING", value: null });
  });

  it("CC-09 retains source-declared saturation and provenance", () => {
    const before = createHumanState();
    const after = createHumanState();
    const saturatedEvidence: TransitionDemandEvidence = {
      sourceName: "contact-sensor",
      sourceVersion: "2.1",
      fieldValidity: [
        {
          phase: "AFTER",
          sourceField: "grip.leftContactCount",
          status: "SATURATED",
          reason: "Contact sensor reached its governed upper limit.",
        },
      ],
      path: null,
      window: null,
    };
    const artifact = extract([
      createTransition(before, after, saturatedEvidence),
    ]);
    const gripObservation = observation(artifact, "GRIP_ENDPOINTS");
    const saturated = gripObservation.fields.find(
      (record) => record.sourceField === "grip.leftContactCount"
    )?.after;
    const left =
      artifact.executionEpisode.t3Consequences.grip.propositionRecords.find(
        (record) => record.side === "LEFT"
      );

    expect(saturated).toMatchObject({
      status: "SATURATED",
      value: 3,
      reason: "Contact sensor reached its governed upper limit.",
    });
    expect(saturated?.provenance.sourceVersionId).toMatch(
      /^source-version:/
    );
    expect(left?.status).toBe("SATURATED");
  });

  it("CC-10 leaves T1 and T2 NOT_OBSERVED without independent sources", () => {
    const artifact = extract([
      createTransition(createHumanState(), createHumanState()),
    ]);

    expect(artifact.t1Plane).toMatchObject({
      plane: "T1",
      status: "NOT_OBSERVED",
    });
    expect(artifact.t2Plane).toMatchObject({
      plane: "T2",
      status: "NOT_OBSERVED",
    });
    expect(artifact.t1Plane.provenance.observationId).toBeNull();
    expect(artifact.t2Plane.provenance.observationId).toBeNull();
  });

  it("CC-11 reuses one common event through distinct REALIZES edges", () => {
    const artifact = extract([
      createTransition(createHumanState(), createHumanState()),
    ]);
    const { eventRecords, evidenceEdges } = artifact.executionEpisode;

    expect(eventRecords).toHaveLength(1);
    expect(new Set(evidenceEdges.map((edge) => edge.eventId))).toEqual(
      new Set([eventRecords[0].eventId])
    );
    expect(evidenceEdges.every((edge) => edge.role === "REALIZES")).toBe(
      true
    );
    expect(new Set(evidenceEdges.map((edge) => edge.evidenceEdgeId)).size).toBe(
      10
    );
  });

  it("CC-12 retains censored boundary identity without duplicating the event", () => {
    const evidence: TransitionDemandEvidence = {
      sourceName: "bounded-window-source",
      sourceVersion: "1",
      fieldValidity: [],
      path: null,
      window: {
        status: "CENSORED",
        reason: "Observation is right-censored at the capture boundary.",
        startBoundaryId: "boundary:start-17",
        endBoundaryId: "boundary:end-17",
      },
    };
    const artifact = extract([
      createTransition(createHumanState(), createHumanState(), evidence),
    ]);

    expect(artifact.executionEpisode.eventRecords).toHaveLength(1);
    expect(artifact.executionEpisode.windowRecords).toEqual([
      expect.objectContaining({
        status: "CENSORED",
        startBoundaryId: "boundary:start-17",
        endBoundaryId: "boundary:end-17",
        eventId: artifact.executionEpisode.eventRecords[0].eventId,
      }),
    ]);
  });

  it("CC-13 lets one observation support distinct digit owners without duplication", () => {
    const artifact = extract([
      createTransition(createHumanState(), createHumanState()),
    ]);
    const fingerObservation = observation(artifact, "FINGER_ENDPOINTS");
    const finger =
      artifact.executionEpisode.t3Consequences.finger.propositionRecords;

    expect(finger).toHaveLength(6);
    expect(new Set(finger.map((record) => record.fingerId)).size).toBe(6);
    expect(new Set(finger.map((record) => record.observationId))).toEqual(
      new Set([fingerObservation.observationId])
    );
    expect(
      artifact.executionEpisode.observationRecords.filter(
        (record) => record.scope === "FINGER_ENDPOINTS"
      )
    ).toHaveLength(1);
  });

  it("CC-14 excludes legacy scalars and implementation constants from truth", () => {
    const source = sourceTree();

    expect(source).not.toMatch(/DemandVector/);
    expect(source).not.toMatch(/fingerDemand/);
    expect(source).not.toMatch(/gripDemand/);
    expect(source).not.toMatch(/orientationDemand/);
    expect(source).not.toMatch(/continuityDemand/);
    expect(source).not.toMatch(/Math\.max\(\s*0/);
    expect(source).not.toMatch(/Math\.abs/);
    expect(source).not.toMatch(/evaluator\/constants/);
  });

  it("CC-15 stops the deterministic canonical boundary at DomainDemandV1", () => {
    const transition = createTransition(
      createHumanState(),
      createHumanState((state) => {
        state.orientation.x = 1;
      })
    );
    const first = extract([transition]);
    const second = extract([transition]);
    const changed = extract([
      createTransition(
        createHumanState(),
        createHumanState((state) => {
          state.orientation.y = 1;
        })
      ),
    ]);
    const duplicate = extract([transition, transition]);
    const source = sourceTree();

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      schemaId: "SPEC-DM-001",
      schemaVersion: "1.0",
      architecture: "P-C",
      claimClass: "T3_BOUNDED_DOMAIN_DEMAND",
    });
    expect(Object.keys(first.executionEpisode.t3Consequences)).toEqual([
      "grip",
      "finger",
      "orientation",
      "continuity",
    ]);
    expect(first.executionEpisode.transitionRefs[0].ordinal).toBe(0);
    expect(changed.executionEpisode.transitionRefs[0].ordinal).toBe(0);
    expect(first.executionEpisode.transitionRefs[0].transitionId).not.toBe(
      changed.executionEpisode.transitionRefs[0].transitionId
    );
    expect(
      new Set(
        duplicate.executionEpisode.transitionRefs.map(
          (reference) => reference.transitionId
        )
      ).size
    ).toBe(2);
    expect(objectKeys(first)).not.toContain("move");
    expect(source).not.toMatch(/metrics\/|interpretation\/|evaluation\/|prototype\/|legacy\/|state-space\//);
    expect(Object.getOwnPropertyNames(EvaluatorPipeline.prototype).sort()).toEqual([
      "advanceToDemand",
      "constructor",
    ]);
    assertJsonCompatible(first);
    expect(() => JSON.stringify(first)).not.toThrow();
  });

  it("emits one explicit status-only record per empty T3 channel", () => {
    const consequences = extract([]).executionEpisode.t3Consequences;

    for (const channel of Object.values(consequences)) {
      expect(channel.propositionRecords).toEqual([]);
      expect(channel.statusOnlyRecord).toMatchObject({
        status: "NOT_OBSERVED",
      });
    }
  });

  it("traces every proposition through edge, observation, event, and Transition refs", () => {
    const artifact = extract([
      createTransition(createHumanState(), createHumanState()),
    ]);
    const { t3Consequences } = artifact.executionEpisode;
    const propositions = [
      ...t3Consequences.grip.propositionRecords,
      ...t3Consequences.finger.propositionRecords,
      ...t3Consequences.orientation.propositionRecords,
      ...t3Consequences.continuity.propositionRecords,
    ];

    for (const proposition of propositions) {
      const edge = artifact.executionEpisode.evidenceEdges.find(
        (candidate) => candidate.propositionId === proposition.propositionId
      );
      const event = artifact.executionEpisode.eventRecords.find(
        (candidate) => candidate.eventId === edge?.eventId
      );
      const sourceObservation =
        artifact.executionEpisode.observationRecords.find(
          (candidate) => candidate.observationId === edge?.observationId
        );
      const transitionRef = artifact.executionEpisode.transitionRefs.find(
        (candidate) => candidate.transitionId === edge?.transitionId
      );

      expect(edge?.role).toBe("REALIZES");
      expect(sourceObservation?.eventId).toBe(event?.eventId);
      expect(event?.beforeHumanStateRef).toBe(
        transitionRef?.beforeHumanStateRef
      );
      expect(event?.afterHumanStateRef).toBe(
        transitionRef?.afterHumanStateRef
      );
    }
  });
});
