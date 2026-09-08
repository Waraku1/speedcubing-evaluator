import {
  UI_EVALUATE_ERROR_CODES_V1,
  type UiDomainDemandV1,
  type UiDownstreamAvailabilityV1,
  type UiEvaluateErrorCodeV1,
  type UiEvaluateResultV1,
  type UiPublicErrorV1,
  type UiSolutionV1,
  type UiTransitionTraceV1,
} from "./evaluateUiTypesV1";

const MAX_ARRAY_ITEMS = 512;
const MAX_IDENTIFIER_LENGTH = 512;

const MOVE_TOKENS = new Set([
  "U", "U'", "U2", "R", "R'", "R2", "F", "F'", "F2",
  "D", "D'", "D2", "L", "L'", "L2", "B", "B'", "B2",
]);
const DOMAIN_VALIDITY_STATUSES = new Set([
  "VALID",
  "MISSING",
  "INVALID",
  "CENSORED",
  "SATURATED",
  "NOT_OBSERVED",
  "PATH_UNKNOWN",
  "QUALITY_UNKNOWN",
]);

const ERROR_CODES = new Set<string>(UI_EVALUATE_ERROR_CODES_V1);
const SERVER_ERROR_CONTRACT: Readonly<
  Record<
    Exclude<
      UiEvaluateErrorCodeV1,
      "NETWORK_UNAVAILABLE" | "INCOMPATIBLE_RESPONSE" | "REQUEST_CANCELLED"
    >,
    Readonly<{ stage: string; retryable: boolean }>
  >
> = Object.freeze({
  INVALID_JSON: { stage: "REQUEST", retryable: false },
  REQUEST_TOO_LARGE: { stage: "REQUEST", retryable: false },
  UNSUPPORTED_MEDIA_TYPE: { stage: "REQUEST", retryable: false },
  METHOD_NOT_ALLOWED: { stage: "REQUEST", retryable: false },
  INVALID_CUBE_STATE: { stage: "VALIDATION", retryable: false },
  UNSOLVABLE_CUBE: { stage: "VALIDATION", retryable: false },
  SOLVER_UNAVAILABLE: { stage: "SOLVER", retryable: true },
  SOLVER_TIMEOUT: { stage: "SOLVER", retryable: true },
  SOLUTION_VERIFICATION_FAILED: { stage: "VERIFICATION", retryable: true },
  TRANSITION_GENERATION_FAILED: { stage: "TRANSITION", retryable: false },
  DEMAND_CONTRACT_FAILED: { stage: "DEMAND", retryable: false },
  INTERNAL_FAILURE: { stage: "INTERNAL", retryable: false },
});

const PUBLIC_MESSAGES: Readonly<Record<UiEvaluateErrorCodeV1, string>> =
  Object.freeze({
    INVALID_CUBE_STATE:
      "The server rejected this cube state. Check every sticker and try again.",
    UNSOLVABLE_CUBE:
      "This sticker arrangement is not a physically solvable 3x3x3 cube.",
    SOLVER_UNAVAILABLE:
      "The solver is temporarily unavailable. Your cube draft has been preserved.",
    SOLVER_TIMEOUT:
      "The solver did not finish in time. Your cube draft has been preserved.",
    SOLUTION_VERIFICATION_FAILED:
      "The returned solution could not be independently verified.",
    TRANSITION_GENERATION_FAILED:
      "The verified solution could not be converted into a transition trace.",
    DEMAND_CONTRACT_FAILED:
      "A valid Domain Demand artifact could not be produced.",
    INVALID_JSON: "The server could not accept the evaluation request.",
    REQUEST_TOO_LARGE: "The evaluation request exceeded the server limit.",
    UNSUPPORTED_MEDIA_TYPE: "The evaluation request format was not accepted.",
    METHOD_NOT_ALLOWED: "The evaluation endpoint rejected this request method.",
    INTERNAL_FAILURE: "The evaluation request could not be completed.",
    NETWORK_UNAVAILABLE:
      "The evaluation service could not be reached. Check your connection and try again.",
    INCOMPATIBLE_RESPONSE:
      "The server response was not compatible with this workbench release.",
    REQUEST_CANCELLED: "The evaluation request was cancelled.",
  });

export class UiEvaluateErrorV1 extends Error {
  readonly publicError: UiPublicErrorV1;

  constructor(publicError: UiPublicErrorV1) {
    super(publicError.message);
    this.name = "UiEvaluateErrorV1";
    this.publicError = publicError;
  }
}

function publicError(
  code: UiEvaluateErrorCodeV1,
  retryable: boolean
): UiPublicErrorV1 {
  return Object.freeze({ code, message: PUBLIC_MESSAGES[code], retryable });
}

function incompatibleResponse(): never {
  throw new UiEvaluateErrorV1(
    publicError("INCOMPATIBLE_RESPONSE", false)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): boolean {
  return (
    Object.keys(value).sort().join("|") === [...keys].sort().join("|")
  );
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_IDENTIFIER_LENGTH
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isBoundedRecordArray(
  value: unknown
): value is readonly Readonly<Record<string, unknown>>[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_ARRAY_ITEMS &&
    value.every(isRecord)
  );
}

function isNullableIdentifier(value: unknown): boolean {
  return value === null || isIdentifier(value);
}

function isDemandProvenance(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "sourceVersionId",
      "transitionId",
      "beforeHumanStateRef",
      "afterHumanStateRef",
      "eventId",
      "observationId",
      "windowId",
    ])
  ) {
    return false;
  }

  return (
    isIdentifier(value.sourceVersionId) &&
    isNullableIdentifier(value.transitionId) &&
    isNullableIdentifier(value.beforeHumanStateRef) &&
    isNullableIdentifier(value.afterHumanStateRef) &&
    isNullableIdentifier(value.eventId) &&
    isNullableIdentifier(value.observationId) &&
    isNullableIdentifier(value.windowId)
  );
}

function isGovernedStatus(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["status", "reason", "provenance"])
  ) {
    return false;
  }

  return (
    typeof value.status === "string" &&
    DOMAIN_VALIDITY_STATUSES.has(value.status) &&
    isIdentifier(value.reason) &&
    isDemandProvenance(value.provenance)
  );
}

function isTemporalPlane(value: unknown, plane: "T1" | "T2"): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "planeId",
      "plane",
      "status",
      "reason",
      "provenance",
    ])
  ) {
    return false;
  }

  return (
    isIdentifier(value.planeId) &&
    value.plane === plane &&
    isGovernedStatus({
      status: value.status,
      reason: value.reason,
      provenance: value.provenance,
    })
  );
}

function isDemandChannel(value: unknown, owner: string): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "semanticOwner",
      "propositionRecords",
      "statusOnlyRecord",
    ]) ||
    value.semanticOwner !== owner ||
    !isBoundedRecordArray(value.propositionRecords)
  ) {
    return false;
  }

  if (value.statusOnlyRecord === null) {
    return true;
  }

  const statusRecord = value.statusOnlyRecord;
  return (
    isRecord(statusRecord) &&
    hasExactKeys(statusRecord, [
      "statusRecordId",
      "scope",
      "status",
      "reason",
      "provenance",
    ]) &&
    isIdentifier(statusRecord.statusRecordId) &&
    ["grip", "finger", "orientation", "continuity"].includes(
      String(statusRecord.scope)
    ) &&
    isGovernedStatus({
      status: statusRecord.status,
      reason: statusRecord.reason,
      provenance: statusRecord.provenance,
    })
  );
}

function isDomainDemand(value: unknown): value is UiDomainDemandV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "artifactId",
      "schemaId",
      "schemaVersion",
      "architecture",
      "claimClass",
      "executionEpisode",
      "t1Plane",
      "t2Plane",
    ]) ||
    !isIdentifier(value.artifactId) ||
    value.schemaId !== "SPEC-DM-001" ||
    value.schemaVersion !== "1.0" ||
    value.architecture !== "P-C" ||
    value.claimClass !== "T3_BOUNDED_DOMAIN_DEMAND" ||
    !isRecord(value.executionEpisode) ||
    !hasExactKeys(value.executionEpisode, [
      "executionId",
      "transitionRefs",
      "eventRecords",
      "observationRecords",
      "windowRecords",
      "evidenceEdges",
      "t3Consequences",
      "sourceVersionManifest",
    ]) ||
    !isIdentifier(value.executionEpisode.executionId) ||
    !isBoundedRecordArray(value.executionEpisode.transitionRefs) ||
    !isBoundedRecordArray(value.executionEpisode.eventRecords) ||
    !isBoundedRecordArray(value.executionEpisode.observationRecords) ||
    !isBoundedRecordArray(value.executionEpisode.windowRecords) ||
    !isBoundedRecordArray(value.executionEpisode.evidenceEdges) ||
    !isBoundedRecordArray(value.executionEpisode.sourceVersionManifest) ||
    !isRecord(value.executionEpisode.t3Consequences) ||
    !hasExactKeys(value.executionEpisode.t3Consequences, [
      "grip",
      "finger",
      "orientation",
      "continuity",
    ])
  ) {
    return false;
  }

  const consequences = value.executionEpisode.t3Consequences;
  return (
    isDemandChannel(consequences.grip, "G-H-GR1") &&
    isDemandChannel(consequences.finger, "F-H-FR1") &&
    isDemandChannel(consequences.orientation, "O-H-OR1") &&
    isDemandChannel(consequences.continuity, "C-H-CR1") &&
    isTemporalPlane(value.t1Plane, "T1") &&
    isTemporalPlane(value.t2Plane, "T2")
  );
}

function isCubeBoundary(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "boundaryId",
      "ordinal",
      "stateId",
      "format",
    ]) &&
    isIdentifier(value.boundaryId) &&
    isNonNegativeInteger(value.ordinal) &&
    isIdentifier(value.stateId) &&
    value.format === "URFDLB_FACELETS_V1"
  );
}

function isSolutionTransition(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "ordinal",
      "transitionId",
      "beforeCubeStateId",
      "afterCubeStateId",
      "moveEventId",
      "move",
    ]) &&
    isNonNegativeInteger(value.ordinal) &&
    isIdentifier(value.transitionId) &&
    isIdentifier(value.beforeCubeStateId) &&
    isIdentifier(value.afterCubeStateId) &&
    isIdentifier(value.moveEventId) &&
    typeof value.move === "string" &&
    MOVE_TOKENS.has(value.move)
  );
}

function isHumanBoundary(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "boundaryId",
      "ordinal",
      "status",
      "reason",
      "sourceVersionId",
    ]) &&
    isIdentifier(value.boundaryId) &&
    isNonNegativeInteger(value.ordinal) &&
    value.status === "NOT_OBSERVED" &&
    value.reason === "HUMAN_STATE_SOURCE_NOT_PROVIDED" &&
    isIdentifier(value.sourceVersionId)
  );
}

function isTrace(value: unknown): value is UiTransitionTraceV1 {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "schemaId",
      "schemaVersion",
      "executionId",
      "solutionId",
      "cubeStateBoundaries",
      "solutionTransitions",
      "humanStateObservationBoundaries",
    ]) &&
    value.schemaId === "TransitionTraceV1" &&
    value.schemaVersion === "1.0" &&
    isIdentifier(value.executionId) &&
    isIdentifier(value.solutionId) &&
    Array.isArray(value.cubeStateBoundaries) &&
    value.cubeStateBoundaries.length > 0 &&
    value.cubeStateBoundaries.length <= MAX_ARRAY_ITEMS &&
    value.cubeStateBoundaries.every(isCubeBoundary) &&
    Array.isArray(value.solutionTransitions) &&
    value.solutionTransitions.length <= MAX_ARRAY_ITEMS &&
    value.solutionTransitions.every(isSolutionTransition) &&
    Array.isArray(value.humanStateObservationBoundaries) &&
    value.humanStateObservationBoundaries.length > 0 &&
    value.humanStateObservationBoundaries.length <= MAX_ARRAY_ITEMS &&
    value.humanStateObservationBoundaries.every(isHumanBoundary)
  );
}

function isSolution(value: unknown): value is UiSolutionV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "solutionId",
      "moves",
      "htm",
      "qtm",
      "verified",
      "solver",
    ]) ||
    !isIdentifier(value.solutionId) ||
    !Array.isArray(value.moves) ||
    value.moves.length > MAX_ARRAY_ITEMS ||
    !value.moves.every((move) => typeof move === "string" && MOVE_TOKENS.has(move)) ||
    !isNonNegativeInteger(value.htm) ||
    !isNonNegativeInteger(value.qtm) ||
    value.verified !== true ||
    !isRecord(value.solver) ||
    !hasExactKeys(value.solver, [
      "solverRunId",
      "id",
      "version",
      "adapterVersion",
      "cacheHit",
      "cacheKeyVersion",
    ])
  ) {
    return false;
  }

  return (
    isIdentifier(value.solver.solverRunId) &&
    value.solver.id === "cubejs" &&
    value.solver.version === "1.3.2" &&
    value.solver.adapterVersion === "1.0" &&
    typeof value.solver.cacheHit === "boolean" &&
    value.solver.cacheKeyVersion === "1"
  );
}

function isUnavailableStage(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["status", "reason"]) &&
    value.status === "NOT_SEMANTICALLY_AVAILABLE" &&
    value.reason === "ENTROPY_SEMANTICS_UNCLOSED"
  );
}

function isAvailability(
  value: unknown
): value is UiDownstreamAvailabilityV1 {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "schemaId",
      "schemaVersion",
      "demandArtifactId",
      "demandSchemaId",
      "demandSchemaVersion",
      "provenance",
      "entropy",
      "interpretation",
      "evaluation",
    ]) &&
    value.schemaId === "DownstreamAvailabilityV1" &&
    value.schemaVersion === "1.0" &&
    isIdentifier(value.demandArtifactId) &&
    value.demandSchemaId === "SPEC-DM-001" &&
    value.demandSchemaVersion === "1.0" &&
    isRecord(value.provenance) &&
    hasExactKeys(value.provenance, [
      "executionId",
      "release",
      "buildCommit",
    ]) &&
    isIdentifier(value.provenance.executionId) &&
    value.provenance.release === "2026-09-10-rc" &&
    typeof value.provenance.buildCommit === "string" &&
    /^[0-9a-f]{40}$/i.test(value.provenance.buildCommit) &&
    isUnavailableStage(value.entropy) &&
    isUnavailableStage(value.interpretation) &&
    isUnavailableStage(value.evaluation)
  );
}

function isWarning(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["code", "executionId", "transitionIds"]) &&
    value.code === "HUMAN_STATE_NOT_OBSERVED" &&
    isIdentifier(value.executionId) &&
    Array.isArray(value.transitionIds) &&
    value.transitionIds.length <= MAX_ARRAY_ITEMS &&
    value.transitionIds.every(isIdentifier)
  );
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}

function parseSuccess(payload: Record<string, unknown>): UiEvaluateResultV1 {
  if (
    !hasExactKeys(payload, ["schemaVersion", "requestId", "result"]) ||
    payload.schemaVersion !== "1.0" ||
    !isIdentifier(payload.requestId) ||
    !isRecord(payload.result)
  ) {
    incompatibleResponse();
  }

  const result = payload.result;
  if (
    !hasExactKeys(result, [
      "cubeState",
      "solution",
      "transitionTrace",
      "domainDemand",
      "downstreamAvailability",
      "warnings",
      "timings",
      "build",
    ]) ||
    !isRecord(result.cubeState) ||
    !hasExactKeys(result.cubeState, ["stateId", "format"]) ||
    !isIdentifier(result.cubeState.stateId) ||
    result.cubeState.format !== "URFDLB_FACELETS_V1" ||
    !isSolution(result.solution) ||
    !isTrace(result.transitionTrace) ||
    !isDomainDemand(result.domainDemand) ||
    !isAvailability(result.downstreamAvailability) ||
    !Array.isArray(result.warnings) ||
    result.warnings.length > MAX_ARRAY_ITEMS ||
    !result.warnings.every(isWarning) ||
    !isRecord(result.timings) ||
    !hasExactKeys(result.timings, ["solverDurationMs"]) ||
    typeof result.timings.solverDurationMs !== "number" ||
    !Number.isFinite(result.timings.solverDurationMs) ||
    result.timings.solverDurationMs < 0 ||
    !isRecord(result.build) ||
    !hasExactKeys(result.build, ["release", "commit"]) ||
    result.build.release !== "2026-09-10-rc" ||
    typeof result.build.commit !== "string" ||
    !/^[0-9a-f]{40}$/i.test(result.build.commit)
  ) {
    incompatibleResponse();
  }

  const trace = result.transitionTrace;
  const demand = result.domainDemand;
  const availability = result.downstreamAvailability;
  const solution = result.solution;
  const expectedQtm = solution.moves.reduce(
    (total, move) => total + (move.endsWith("2") ? 2 : 1),
    0
  );

  if (
    solution.htm !== solution.moves.length ||
    solution.qtm !== expectedQtm ||
    solution.solutionId !== trace.solutionId ||
    demand.executionEpisode.executionId !== trace.executionId ||
    availability.provenance.executionId !== trace.executionId ||
    availability.demandArtifactId !== demand.artifactId ||
    availability.provenance.buildCommit.toLowerCase() !==
      result.build.commit.toLowerCase() ||
    trace.solutionTransitions.length !== solution.moves.length ||
    trace.cubeStateBoundaries.length !== solution.moves.length + 1 ||
    trace.humanStateObservationBoundaries.length !== solution.moves.length + 1 ||
    trace.cubeStateBoundaries[0].stateId !== result.cubeState.stateId ||
    !trace.cubeStateBoundaries.every(
      (boundary, index) => boundary.ordinal === index
    ) ||
    !trace.humanStateObservationBoundaries.every(
      (boundary, index) => boundary.ordinal === index
    ) ||
    !trace.solutionTransitions.every(
      (transition, index) =>
        transition.ordinal === index &&
        transition.move === solution.moves[index] &&
        transition.beforeCubeStateId ===
          trace.cubeStateBoundaries[index].stateId &&
        transition.afterCubeStateId ===
          trace.cubeStateBoundaries[index + 1].stateId
    ) ||
    !result.warnings.every(
      (warning) =>
        warning.executionId === trace.executionId &&
        Array.isArray(warning.transitionIds) &&
        warning.transitionIds.length === trace.solutionTransitions.length &&
        warning.transitionIds.every(
          (transitionId, index) =>
            transitionId === trace.solutionTransitions[index]?.transitionId
        )
    )
  ) {
    incompatibleResponse();
  }

  return deepFreeze({
    requestId: payload.requestId,
    cube: {
      stateId: result.cubeState.stateId,
      format: "URFDLB_FACELETS_V1" as const,
    },
    solution,
    demand,
    availability,
    trace,
    warnings: result.warnings,
    timings: { solverDurationMs: result.timings.solverDurationMs },
    build: {
      release: "2026-09-10-rc" as const,
      commit: result.build.commit,
    },
  });
}

function parseServerError(payload: Record<string, unknown>): never {
  if (
    !hasExactKeys(payload, ["schemaVersion", "requestId", "error"]) ||
    payload.schemaVersion !== "1.0" ||
    !isIdentifier(payload.requestId) ||
    !isRecord(payload.error) ||
    !hasExactKeys(payload.error, ["code", "message", "stage", "retryable"]) ||
    typeof payload.error.code !== "string" ||
    !ERROR_CODES.has(payload.error.code) ||
    !(payload.error.code in SERVER_ERROR_CONTRACT) ||
    typeof payload.error.message !== "string" ||
    typeof payload.error.stage !== "string" ||
    typeof payload.error.retryable !== "boolean"
  ) {
    incompatibleResponse();
  }

  const code = payload.error.code as keyof typeof SERVER_ERROR_CONTRACT;
  const contract = SERVER_ERROR_CONTRACT[code];

  if (
    payload.error.stage !== contract.stage ||
    payload.error.retryable !== contract.retryable
  ) {
    incompatibleResponse();
  }

  throw new UiEvaluateErrorV1(publicError(code, contract.retryable));
}

export function serializeEvaluateRequestV1(facelets: string): Readonly<{
  schemaVersion: "1.0";
  cubeState: Readonly<{
    format: "URFDLB_FACELETS_V1";
    facelets: string;
  }>;
}> {
  return Object.freeze({
    schemaVersion: "1.0",
    cubeState: Object.freeze({
      format: "URFDLB_FACELETS_V1",
      facelets,
    }),
  });
}

export function parseEvaluateResponseV1(
  payload: unknown,
  responseOk: boolean
): UiEvaluateResultV1 {
  if (!isRecord(payload)) {
    incompatibleResponse();
  }

  if ("result" in payload && responseOk) {
    return parseSuccess(payload);
  }

  if ("error" in payload && !responseOk) {
    return parseServerError(payload);
  }

  return incompatibleResponse();
}

export function normalizeUiEvaluateErrorV1(
  error: unknown
): UiPublicErrorV1 {
  if (error instanceof UiEvaluateErrorV1) {
    return error.publicError;
  }

  if (
    error instanceof DOMException &&
    error.name === "AbortError"
  ) {
    return publicError("REQUEST_CANCELLED", false);
  }

  return publicError("NETWORK_UNAVAILABLE", true);
}

export type EvaluateCubeOperationV1 = Readonly<{
  result: Promise<UiEvaluateResultV1>;
  cancel(): void;
}>;

export function evaluateCube(input: Readonly<{
  facelets: string;
}>): EvaluateCubeOperationV1 {
  const controller = new AbortController();
  const body = serializeEvaluateRequestV1(input.facelets);

  const result = fetch("/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).then(async (response) => {
    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      incompatibleResponse();
    }

    return parseEvaluateResponseV1(payload, response.ok);
  });

  return Object.freeze({
    result,
    cancel: () => controller.abort(),
  });
}
