import { describe, expect, it } from "vitest";

import {
  normalizeUiEvaluateErrorV1,
  parseEvaluateResponseV1,
  serializeEvaluateRequestV1,
} from "../../src/lib/ui/evaluateCube";
import {
  createInitialWorkbenchStateV1,
  workbenchReducerV1,
} from "../../src/lib/ui/workbenchStateV1";

const COMMIT = "a".repeat(40);
const REQUEST_ID = "request:c4-test";
const EXECUTION_ID = "execution:c4-test";
const SOLUTION_ID = "solution:c4-test";
const ARTIFACT_ID = "demand:c4-test";

function demandProvenance() {
  return {
    sourceVersionId: "source:c4-test",
    transitionId: null,
    beforeHumanStateRef: null,
    afterHumanStateRef: null,
    eventId: null,
    observationId: null,
    windowId: null,
  };
}

function statusOnly(scope: string) {
  return {
    statusRecordId: `status:${scope}`,
    scope,
    status: "NOT_OBSERVED",
    reason: "HUMAN_STATE_SOURCE_NOT_PROVIDED",
    provenance: demandProvenance(),
  };
}

function successFixture(): Record<string, unknown> {
  return {
    schemaVersion: "1.0",
    requestId: REQUEST_ID,
    result: {
      cubeState: {
        stateId: "cube:c4-test",
        format: "URFDLB_FACELETS_V1",
      },
      solution: {
        solutionId: SOLUTION_ID,
        moves: [],
        htm: 0,
        qtm: 0,
        verified: true,
        solver: {
          solverRunId: "solver:c4-test",
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
        executionId: EXECUTION_ID,
        solutionId: SOLUTION_ID,
        cubeStateBoundaries: [
          {
            boundaryId: "boundary:c4-test",
            ordinal: 0,
            stateId: "cube:c4-test",
            format: "URFDLB_FACELETS_V1",
          },
        ],
        solutionTransitions: [],
        humanStateObservationBoundaries: [
          {
            boundaryId: "human:c4-test",
            ordinal: 0,
            status: "NOT_OBSERVED",
            reason: "HUMAN_STATE_SOURCE_NOT_PROVIDED",
            sourceVersionId: "source:c4-test",
          },
        ],
      },
      domainDemand: {
        artifactId: ARTIFACT_ID,
        schemaId: "SPEC-DM-001",
        schemaVersion: "1.0",
        architecture: "P-C",
        claimClass: "T3_BOUNDED_DOMAIN_DEMAND",
        executionEpisode: {
          executionId: EXECUTION_ID,
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
          sourceVersionManifest: [],
        },
        t1Plane: {
          planeId: "plane:t1",
          plane: "T1",
          status: "NOT_OBSERVED",
          reason: "HUMAN_STATE_SOURCE_NOT_PROVIDED",
          provenance: demandProvenance(),
        },
        t2Plane: {
          planeId: "plane:t2",
          plane: "T2",
          status: "NOT_OBSERVED",
          reason: "HUMAN_STATE_SOURCE_NOT_PROVIDED",
          provenance: demandProvenance(),
        },
      },
      downstreamAvailability: {
        schemaId: "DownstreamAvailabilityV1",
        schemaVersion: "1.0",
        demandArtifactId: ARTIFACT_ID,
        demandSchemaId: "SPEC-DM-001",
        demandSchemaVersion: "1.0",
        provenance: {
          executionId: EXECUTION_ID,
          release: "2026-09-10-rc",
          buildCommit: COMMIT,
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
          executionId: EXECUTION_ID,
          transitionIds: [],
        },
      ],
      timings: { solverDurationMs: 4 },
      build: { release: "2026-09-10-rc", commit: COMMIT },
    },
  };
}

function recordAt(root: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = root[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Expected record at ${key}`);
  }
  return value as Record<string, unknown>;
}

function incompatibleCode(payload: unknown, responseOk = true): string | null {
  try {
    parseEvaluateResponseV1(payload, responseOk);
    return null;
  } catch (error) {
    return normalizeUiEvaluateErrorV1(error).code;
  }
}

describe("C4 evaluate adapter", () => {
  it("C4-07 serializes only the exact C3R request body", () => {
    const body = serializeEvaluateRequestV1("U".repeat(54));

    expect(body).toEqual({
      schemaVersion: "1.0",
      cubeState: {
        format: "URFDLB_FACELETS_V1",
        facelets: "U".repeat(54),
      },
    });
    expect(body).not.toHaveProperty("facelets");
    expect(body).not.toHaveProperty("clientRequestId");
  });

  it("C4-08 accepts one complete linked response and freezes its UI projection", () => {
    const parsed = parseEvaluateResponseV1(successFixture(), true);

    expect(parsed).toMatchObject({
      requestId: REQUEST_ID,
      cube: { format: "URFDLB_FACELETS_V1" },
      solution: { verified: true },
      demand: { schemaId: "SPEC-DM-001", architecture: "P-C" },
      availability: { demandArtifactId: ARTIFACT_ID },
      trace: { executionId: EXECUTION_ID },
      build: { commit: COMMIT },
    });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.demand)).toBe(true);
  });

  it("C4-08 rejects incomplete, unknown, incompatible, or unlinked success data", () => {
    const cases: Record<string, unknown>[] = [];

    const unknownRoot = successFixture();
    unknownRoot.extra = true;
    cases.push(unknownRoot);

    const unverified = successFixture();
    recordAt(recordAt(unverified, "result"), "solution").verified = false;
    cases.push(unverified);

    const wrongDomain = successFixture();
    recordAt(recordAt(wrongDomain, "result"), "domainDemand").schemaId = "OTHER";
    cases.push(wrongDomain);

    const unlinked = successFixture();
    recordAt(
      recordAt(recordAt(unlinked, "result"), "downstreamAvailability"),
      "provenance"
    ).executionId = "execution:other";
    cases.push(unlinked);

    const semanticPayload = successFixture();
    recordAt(
      recordAt(recordAt(semanticPayload, "result"), "downstreamAvailability"),
      "entropy"
    ).value = 0;
    cases.push(semanticPayload);

    const missingTrace = successFixture();
    delete recordAt(recordAt(missingTrace, "result"), "transitionTrace")
      .cubeStateBoundaries;
    cases.push(missingTrace);

    for (const invalid of cases) {
      expect(incompatibleCode(invalid)).toBe("INCOMPATIBLE_RESPONSE");
    }
  });

  it("C4-09 maps closed API and transport failures to safe public errors", () => {
    const contracts = [
      ["INVALID_JSON", "REQUEST", false],
      ["REQUEST_TOO_LARGE", "REQUEST", false],
      ["UNSUPPORTED_MEDIA_TYPE", "REQUEST", false],
      ["METHOD_NOT_ALLOWED", "REQUEST", false],
      ["INVALID_CUBE_STATE", "VALIDATION", false],
      ["UNSOLVABLE_CUBE", "VALIDATION", false],
      ["SOLVER_UNAVAILABLE", "SOLVER", true],
      ["SOLVER_TIMEOUT", "SOLVER", true],
      ["SOLUTION_VERIFICATION_FAILED", "VERIFICATION", true],
      ["TRANSITION_GENERATION_FAILED", "TRANSITION", false],
      ["DEMAND_CONTRACT_FAILED", "DEMAND", false],
      ["INTERNAL_FAILURE", "INTERNAL", false],
    ] as const;

    for (const [code, stage, retryable] of contracts) {
      try {
        parseEvaluateResponseV1(
          {
            schemaVersion: "1.0",
            requestId: REQUEST_ID,
            error: {
              code,
              message: "/private/worker.ts stderr",
              stage,
              retryable,
            },
          },
          false
        );
        throw new Error("Expected the server error to reject");
      } catch (error) {
        const normalized = normalizeUiEvaluateErrorV1(error);
        expect(normalized).toMatchObject({ code, retryable });
        expect(normalized.message).not.toContain("worker.ts");
        expect(normalized.message).not.toContain("stderr");
      }
    }

    expect(normalizeUiEvaluateErrorV1(new Error("socket secret"))).toEqual({
      code: "NETWORK_UNAVAILABLE",
      message:
        "The evaluation service could not be reached. Check your connection and try again.",
      retryable: true,
    });
  });

  it("C4-10 allows only the active operation epoch to commit", () => {
    let state = createInitialWorkbenchStateV1();
    state = workbenchReducerV1(state, { type: "LOAD_SOLVED" });
    state = workbenchReducerV1(state, { type: "BEGIN_SUBMIT", epoch: 2 });
    const submitting = state;

    expect(state.phase).toBe("SUBMITTING");
    expect(
      workbenchReducerV1(state, { type: "BEGIN_SUBMIT", epoch: 3 })
    ).toBe(state);

    state = workbenchReducerV1(state, { type: "CANCEL", epoch: 2 });
    expect(state.phase).toBe("CANCELLED");
    expect(state.draft).toBe(submitting.draft);

    const late = workbenchReducerV1(state, {
      type: "RECEIVE_SUCCESS",
      epoch: 2,
      result: parseEvaluateResponseV1(successFixture(), true),
    });
    expect(late).toBe(state);
    expect(late.result).toBeNull();

    const edited = workbenchReducerV1(
      workbenchReducerV1(state, { type: "BEGIN_SUBMIT", epoch: 4 }),
      {
        type: "RECEIVE_ERROR",
        epoch: 4,
        error: normalizeUiEvaluateErrorV1(new Error("offline")),
      }
    );
    expect(edited.phase).toBe("ERROR");
    expect(edited.draft).toBe(state.draft);
  });
});
