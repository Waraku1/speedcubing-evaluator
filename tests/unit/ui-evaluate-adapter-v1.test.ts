import { describe, expect, it } from "vitest";

import {
  normalizeUiEvaluateErrorV1,
  parseEvaluateResponseV1,
  serializeEvaluateRequestV1,
} from "../../src/lib/ui/evaluateCube";
import {
  buildTraceRowsV1,
  TRACE_PAGE_SIZE_V1,
} from "../../src/components/results/TraceExplorer";
import { VALIDITY_PRESENTATION_V1 } from "../../src/components/status/ValidityBadge";
import type {
  UiEvaluateErrorCodeV1,
  UiPublicErrorV1,
} from "../../src/lib/ui/evaluateUiTypesV1";
import {
  createInitialWorkbenchStateV1,
  workbenchReducerV1,
} from "../../src/lib/ui/workbenchStateV1";
import {
  C6_LONG_SOLUTION_MOVES,
  createC6LargeTraceFixture,
  createC6LongSolutionFixture,
  createC6NonSolvedFixture,
  createC6SolvedFixture,
  createC6ValidityVocabularyFixture,
} from "../fixtures/c6PresentationFixtures";

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
          sourceVersionManifest: [
            {
              sourceVersionId: "source:c4-test",
              sourceName: "C4 test Human-State source",
              sourceVersion: "1.0",
              role: "HUMAN_STATE_SOURCE",
            },
          ],
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

function normalizedServerError(
  code: UiEvaluateErrorCodeV1,
  stage: string,
  retryable: boolean,
  message = "/private/worker.ts stderr"
): UiPublicErrorV1 {
  try {
    parseEvaluateResponseV1(
      {
        schemaVersion: "1.0",
        requestId: REQUEST_ID,
        error: { code, message, stage, retryable },
      },
      false
    );
  } catch (error) {
    return normalizeUiEvaluateErrorV1(error);
  }

  throw new Error("Expected the server error to reject");
}

function statusRecordFor(
  payload: Record<string, unknown>,
  channel: "grip" | "finger" | "orientation" | "continuity"
): Record<string, unknown> {
  const result = recordAt(payload, "result");
  const demand = recordAt(result, "domainDemand");
  const episode = recordAt(demand, "executionEpisode");
  const consequences = recordAt(episode, "t3Consequences");
  return recordAt(recordAt(consequences, channel), "statusOnlyRecord");
}

function channelFor(
  payload: Record<string, unknown>,
  channel: "grip" | "finger" | "orientation" | "continuity"
): Record<string, unknown> {
  const result = recordAt(payload, "result");
  const demand = recordAt(result, "domainDemand");
  const episode = recordAt(demand, "executionEpisode");
  return recordAt(recordAt(episode, "t3Consequences"), channel);
}

function propositionFor(
  payload: Record<string, unknown>,
  channel: "grip" | "finger" | "orientation" | "continuity"
): Record<string, unknown> {
  const propositions = channelFor(payload, channel).propositionRecords;
  if (!Array.isArray(propositions) || propositions.length === 0) {
    throw new Error(`Expected proposition for ${channel}`);
  }
  return propositions[0] as Record<string, unknown>;
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
        expect(normalized.explanation).not.toContain("worker.ts");
        expect(normalized.explanation).not.toContain("stderr");
      }
    }

    expect(normalizeUiEvaluateErrorV1(new Error("socket secret"))).toEqual({
      code: "NETWORK_UNAVAILABLE",
      title: "Evaluation service unavailable",
      explanation:
        "The evaluation service could not be reached. Check your connection and try again.",
      retryable: true,
      focus: "ERROR_SUMMARY",
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

describe("C4R quality reconciliation", () => {
  it("C4R-01 preserves the validated server request ID in the public error", () => {
    const normalized = normalizedServerError(
      "INTERNAL_FAILURE",
      "INTERNAL",
      false
    );

    expect(normalized.requestId).toBe(REQUEST_ID);
  });

  it("C4R-02 never carries the raw server message into the public error", () => {
    const rawMessage = "/private/worker.ts stack and stderr";
    const normalized = normalizedServerError(
      "INTERNAL_FAILURE",
      "INTERNAL",
      false,
      rawMessage
    );

    expect(JSON.stringify(normalized)).not.toContain(rawMessage);
    expect(JSON.stringify(normalized)).not.toContain("worker.ts");
    expect(normalized.explanation).toBe(
      "The evaluation request could not be completed."
    );
  });

  it("C4R-03 focuses cube validation for INVALID_CUBE_STATE", () => {
    expect(
      normalizedServerError("INVALID_CUBE_STATE", "VALIDATION", false)
    ).toMatchObject({
      code: "INVALID_CUBE_STATE",
      focus: "CUBE_VALIDATION",
      retryable: false,
    });
  });

  it("C4R-04 focuses cube validation for UNSOLVABLE_CUBE", () => {
    expect(
      normalizedServerError("UNSOLVABLE_CUBE", "VALIDATION", false)
    ).toMatchObject({
      code: "UNSOLVABLE_CUBE",
      focus: "CUBE_VALIDATION",
      retryable: false,
    });
  });

  it("C4R-05 focuses retryable solver failures on the error summary", () => {
    const contracts = [
      ["SOLVER_UNAVAILABLE", "SOLVER"],
      ["SOLVER_TIMEOUT", "SOLVER"],
      ["SOLUTION_VERIFICATION_FAILED", "VERIFICATION"],
    ] as const;

    for (const [code, stage] of contracts) {
      expect(normalizedServerError(code, stage, true)).toMatchObject({
        code,
        focus: "ERROR_SUMMARY",
        retryable: true,
      });
    }
  });

  it("C4R-06 focuses the run button after cancellation", () => {
    expect(
      normalizeUiEvaluateErrorV1(
        new DOMException("transport detail", "AbortError")
      )
    ).toEqual({
      code: "REQUEST_CANCELLED",
      title: "Request cancelled",
      explanation: "The evaluation request was cancelled.",
      retryable: false,
      focus: "RUN_BUTTON",
    });
  });

  it("C4R-07 rejects Grip with a non-grip status scope", () => {
    const payload = successFixture();
    statusRecordFor(payload, "grip").scope = "finger";

    expect(incompatibleCode(payload)).toBe("INCOMPATIBLE_RESPONSE");
  });

  it("C4R-08 rejects Finger, Orientation, and Continuity scope mismatches", () => {
    const mismatches = [
      ["finger", "orientation"],
      ["orientation", "continuity"],
      ["continuity", "grip"],
    ] as const;

    for (const [channel, wrongScope] of mismatches) {
      const payload = successFixture();
      statusRecordFor(payload, channel).scope = wrongScope;
      expect(incompatibleCode(payload)).toBe("INCOMPATIBLE_RESPONSE");
    }
  });

  it("C4R-09 accepts the valid C3R status-only fixture", () => {
    const parsed = parseEvaluateResponseV1(successFixture(), true);

    expect(parsed.demand.schemaId).toBe("SPEC-DM-001");
    expect(parsed.demand.executionEpisode).toMatchObject({
      t3Consequences: {
        grip: { statusOnlyRecord: { scope: "grip" } },
        finger: { statusOnlyRecord: { scope: "finger" } },
        orientation: { statusOnlyRecord: { scope: "orientation" } },
        continuity: { statusOnlyRecord: { scope: "continuity" } },
      },
    });
  });
});

describe("C6 typed result projection", () => {
  it("C6-U01 projects solved and non-solved fixtures without raw episode records", () => {
    const solved = parseEvaluateResponseV1(createC6SolvedFixture(), true);
    const nonSolved = parseEvaluateResponseV1(
      createC6NonSolvedFixture(),
      true
    );

    expect(solved.solution).toMatchObject({ moves: [], htm: 0, qtm: 0 });
    expect(nonSolved.solution.moves).toEqual(["R", "U", "R'", "U'"]);
    expect(nonSolved.solution.verified).toBe(true);
    expect(nonSolved.demand.executionEpisode).toHaveProperty(
      "t3Consequences"
    );
    expect(nonSolved.demand.executionEpisode).toHaveProperty(
      "sourceVersionManifest"
    );
    expect(nonSolved.demand.executionEpisode).not.toHaveProperty(
      "observationRecords"
    );
    expect(nonSolved.demand.executionEpisode).not.toHaveProperty(
      "evidenceEdges"
    );
  });

  it("C6-U02 binds every governed validity status to exact visible copy", () => {
    expect(VALIDITY_PRESENTATION_V1).toEqual({
      VALID: { label: "Observed", cue: "●" },
      MISSING: { label: "Missing evidence", cue: "—" },
      INVALID: { label: "Invalid evidence", cue: "!" },
      CENSORED: { label: "Censored", cue: "×" },
      SATURATED: { label: "Saturated", cue: "▲" },
      NOT_OBSERVED: { label: "Not observed", cue: "○" },
      PATH_UNKNOWN: { label: "Path unknown", cue: "?" },
      QUALITY_UNKNOWN: { label: "Quality unknown", cue: "◇" },
    });

    const parsed = parseEvaluateResponseV1(
      createC6ValidityVocabularyFixture(),
      true
    );
    const statuses = new Set(
      buildTraceRowsV1(parsed)
        .flatMap((row) => row.fields)
        .filter((field) => field.label.toLowerCase().includes("validity"))
        .map((field) => field.value)
    );
    expect(statuses).toEqual(
      new Set([
        "VALID",
        "MISSING",
        "INVALID",
        "CENSORED",
        "SATURATED",
        "NOT_OBSERVED",
        "PATH_UNKNOWN",
        "QUALITY_UNKNOWN",
      ])
    );
  });

  it("C6-U03 preserves all 80 ordered MoveV1 tokens", () => {
    const parsed = parseEvaluateResponseV1(
      createC6LongSolutionFixture(),
      true
    );

    expect(parsed.solution.moves).toHaveLength(80);
    expect(parsed.solution.moves).toEqual(C6_LONG_SOLUTION_MOVES);
  });

  it("C6-U04 preserves a 501-record source model while paging at 50", () => {
    const parsed = parseEvaluateResponseV1(createC6LargeTraceFixture(), true);
    const rows = buildTraceRowsV1(parsed);

    expect(parsed.demand.executionEpisode.sourceVersionManifest).toHaveLength(
      501
    );
    expect(rows.length).toBeGreaterThanOrEqual(501);
    expect(TRACE_PAGE_SIZE_V1).toBe(50);
    expect(rows.slice(0, TRACE_PAGE_SIZE_V1)).toHaveLength(50);
  });

  it("C6-U05 rejects a Grip proposition with the wrong semantic owner", () => {
    const fixture = createC6ValidityVocabularyFixture();
    propositionFor(fixture, "grip").semanticOwner = "F-H-FR1";
    expect(incompatibleCode(fixture)).toBe("INCOMPATIBLE_RESPONSE");
  });

  it("C6-U06 rejects invalid Grip side and direction values", () => {
    const invalidSide = createC6ValidityVocabularyFixture();
    propositionFor(invalidSide, "grip").side = "CENTER";

    const invalidDirection = createC6ValidityVocabularyFixture();
    propositionFor(invalidDirection, "grip").contactCountDirection = "GAINED";

    expect(incompatibleCode(invalidSide)).toBe("INCOMPATIBLE_RESPONSE");
    expect(incompatibleCode(invalidDirection)).toBe("INCOMPATIBLE_RESPONSE");
  });

  it("C6-U07 rejects an unknown Finger identity", () => {
    const fixture = createC6ValidityVocabularyFixture();
    propositionFor(fixture, "finger").fingerId = "L_RING";
    expect(incompatibleCode(fixture)).toBe("INCOMPATIBLE_RESPONSE");
  });

  it("C6-U08 rejects unauthorized Orientation substitute fields", () => {
    const fixture = createC6ValidityVocabularyFixture();
    propositionFor(fixture, "orientation").certainty = 0.9;
    expect(incompatibleCode(fixture)).toBe("INCOMPATIBLE_RESPONSE");
  });

  it("C6-U09 rejects an invalid Continuity direction", () => {
    const fixture = createC6ValidityVocabularyFixture();
    propositionFor(fixture, "continuity").continuityDirection = "FLOW";
    expect(incompatibleCode(fixture)).toBe("INCOMPATIBLE_RESPONSE");
  });

  it("C6-U10 rejects malformed governed status and unknown validity", () => {
    const malformed = createC6ValidityVocabularyFixture();
    propositionFor(malformed, "grip").reason = 9;

    const unknown = createC6ValidityVocabularyFixture();
    propositionFor(unknown, "finger").status = "PARTIAL";

    expect(incompatibleCode(malformed)).toBe("INCOMPATIBLE_RESPONSE");
    expect(incompatibleCode(unknown)).toBe("INCOMPATIBLE_RESPONSE");
  });

  it("C6-U11 rejects malformed provenance and bad evidence-reference IDs", () => {
    const malformed = createC6ValidityVocabularyFixture();
    delete recordAt(propositionFor(malformed, "orientation"), "provenance")
      .sourceVersionId;

    const badReference = createC6ValidityVocabularyFixture();
    propositionFor(badReference, "continuity").eventId = 42;

    const unlinkedReference = createC6ValidityVocabularyFixture();
    recordAt(
      propositionFor(unlinkedReference, "grip"),
      "provenance"
    ).eventId = "event:c6:other";

    expect(incompatibleCode(malformed)).toBe("INCOMPATIBLE_RESPONSE");
    expect(incompatibleCode(badReference)).toBe("INCOMPATIBLE_RESPONSE");
    expect(incompatibleCode(unlinkedReference)).toBe(
      "INCOMPATIBLE_RESPONSE"
    );
  });

  it("C6-U12 rejects unexpected proposition keys and unknown sources", () => {
    const unexpected = createC6ValidityVocabularyFixture();
    propositionFor(unexpected, "grip").extra = "not closed";

    const unknownSource = createC6ValidityVocabularyFixture();
    recordAt(
      propositionFor(unknownSource, "finger"),
      "provenance"
    ).sourceVersionId = "source:c6:not-declared";

    expect(incompatibleCode(unexpected)).toBe("INCOMPATIBLE_RESPONSE");
    expect(incompatibleCode(unknownSource)).toBe("INCOMPATIBLE_RESPONSE");
  });

  it("C6-U13 resets presentation-only trace state with a changed cube", () => {
    let state = createInitialWorkbenchStateV1();
    state = workbenchReducerV1(state, { type: "LOAD_SOLVED" });
    state = workbenchReducerV1(state, { type: "BEGIN_SUBMIT", epoch: 2 });
    state = workbenchReducerV1(state, {
      type: "RECEIVE_SUCCESS",
      epoch: 2,
      result: parseEvaluateResponseV1(createC6SolvedFixture(), true),
    });
    state = workbenchReducerV1(state, {
      type: "SET_RESULT_DETAILS",
      expanded: true,
    });
    state = workbenchReducerV1(state, { type: "SET_TRACE_PAGE", page: 3 });
    state = workbenchReducerV1(state, {
      type: "SELECT_TRACE_RECORD",
      recordId: "source:source:c6:150",
    });

    expect(state.resultDetailsExpanded).toBe(true);
    expect(state.tracePage).toBe(3);
    expect(state.selectedTraceRecordId).not.toBeNull();

    state = workbenchReducerV1(state, {
      type: "EDIT_STICKER",
      index: 0,
      token: "R",
    });
    expect(state.result).toBeNull();
    expect(state.resultDetailsExpanded).toBe(false);
    expect(state.tracePage).toBe(0);
    expect(state.selectedTraceRecordId).toBeNull();
  });
});
