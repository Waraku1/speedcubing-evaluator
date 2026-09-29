import {
  CFOP_ERROR_CODES_V1,
  CFOP_F2L_SLOTS_V1,
  CFOP_INPUT_MODE_V1,
  CFOP_SCHEMA_VERSION_V1,
  type CFOPErrorCodeV1,
  type CFOPPhaseNameV1,
  type CFOPPhaseResultV1,
  type CFOPResultV1,
} from "../../types/cfop-v1";
import { UI_MOVE_TOKENS_V1 } from "./evaluateUiTypesV1";

const MAX_MOVES = 512;
const MAX_IDENTIFIER_LENGTH = 512;
const MOVE_TOKENS = new Set<string>(UI_MOVE_TOKENS_V1);
const SERVER_ERROR_CODES = new Set<string>(CFOP_ERROR_CODES_V1);

const SERVER_ERROR_CONTRACT: Readonly<
  Record<CFOPErrorCodeV1, Readonly<{ stage: string; retryable: boolean }>>
> = Object.freeze({
  INVALID_JSON: { stage: "REQUEST", retryable: false },
  REQUEST_TOO_LARGE: { stage: "REQUEST", retryable: false },
  UNSUPPORTED_MEDIA_TYPE: { stage: "REQUEST", retryable: false },
  METHOD_NOT_ALLOWED: { stage: "REQUEST", retryable: false },
  UNSUPPORTED_INPUT_MODE: { stage: "VALIDATION", retryable: false },
  INVALID_CUBE_STATE: { stage: "VALIDATION", retryable: false },
  UNSOLVABLE_CUBE: { stage: "VALIDATION", retryable: false },
  CFOP_UNAVAILABLE: { stage: "CFOP", retryable: true },
  CFOP_VERIFICATION_FAILED: { stage: "VERIFICATION", retryable: true },
  INTERNAL_FAILURE: { stage: "INTERNAL", retryable: false },
});

export type UiCFOPErrorCodeV1 =
  | CFOPErrorCodeV1
  | "NETWORK_UNAVAILABLE"
  | "INCOMPATIBLE_RESPONSE"
  | "REQUEST_CANCELLED";

export type UiCFOPPublicErrorV1 = Readonly<{
  code: UiCFOPErrorCodeV1;
  title: string;
  explanation: string;
  retryable: boolean;
  requestId?: string;
}>;

const ERROR_PRESENTATIONS: Readonly<
  Record<
    UiCFOPErrorCodeV1,
    Readonly<{ title: string; explanation: string; retryable: boolean }>
  >
> = Object.freeze({
  INVALID_JSON: {
    title: "CFOP request rejected",
    explanation: "The server could not accept the CFOP request.",
    retryable: false,
  },
  REQUEST_TOO_LARGE: {
    title: "CFOP request too large",
    explanation: "The CFOP request exceeded the server limit.",
    retryable: false,
  },
  UNSUPPORTED_MEDIA_TYPE: {
    title: "CFOP request format unsupported",
    explanation: "The server did not accept the request media type.",
    retryable: false,
  },
  METHOD_NOT_ALLOWED: {
    title: "CFOP request method rejected",
    explanation: "The CFOP endpoint did not accept the request method.",
    retryable: false,
  },
  UNSUPPORTED_INPUT_MODE: {
    title: "CFOP input mode unsupported",
    explanation:
      "Only direct facelet-state input is supported. Cube history is not reconstructed.",
    retryable: false,
  },
  INVALID_CUBE_STATE: {
    title: "Cube state rejected",
    explanation: "The server rejected the cube-state representation.",
    retryable: false,
  },
  UNSOLVABLE_CUBE: {
    title: "Cube state is not solvable",
    explanation: "The facelets do not describe a physically solvable 3x3x3 cube.",
    retryable: false,
  },
  CFOP_UNAVAILABLE: {
    title: "CFOP solver unavailable",
    explanation: "The human-style CFOP solver is temporarily unavailable.",
    retryable: true,
  },
  CFOP_VERIFICATION_FAILED: {
    title: "CFOP verification failed",
    explanation: "The returned phase solution could not be independently verified.",
    retryable: true,
  },
  INTERNAL_FAILURE: {
    title: "CFOP request failed",
    explanation: "The CFOP request could not be completed.",
    retryable: false,
  },
  NETWORK_UNAVAILABLE: {
    title: "CFOP service unavailable",
    explanation: "The CFOP service could not be reached. Try again.",
    retryable: true,
  },
  INCOMPATIBLE_RESPONSE: {
    title: "Incompatible CFOP response",
    explanation: "The server response did not match the CFOP V1 contract.",
    retryable: false,
  },
  REQUEST_CANCELLED: {
    title: "CFOP request cancelled",
    explanation: "The human-style solution request was cancelled.",
    retryable: false,
  },
});

export class UiCFOPErrorV1 extends Error {
  readonly publicError: UiCFOPPublicErrorV1;

  constructor(publicError: UiCFOPPublicErrorV1) {
    super(publicError.explanation);
    this.name = "UiCFOPErrorV1";
    this.publicError = publicError;
  }
}

function publicError(
  code: UiCFOPErrorCodeV1,
  requestId?: string
): UiCFOPPublicErrorV1 {
  return Object.freeze({
    code,
    ...ERROR_PRESENTATIONS[code],
    ...(requestId === undefined ? {} : { requestId }),
  });
}

function incompatibleResponse(): never {
  throw new UiCFOPErrorV1(publicError("INCOMPATIBLE_RESPONSE"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): boolean {
  return Object.keys(value).sort().join("|") === [...keys].sort().join("|");
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_IDENTIFIER_LENGTH
  );
}

function isMoveArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_MOVES &&
    value.every((move) => typeof move === "string" && MOVE_TOKENS.has(move))
  );
}

function qtm(moves: readonly string[]): number {
  return moves.reduce(
    (total, move) => total + (move.endsWith("2") ? 2 : 1),
    0
  );
}

function isPhase(
  value: unknown,
  phase: CFOPPhaseNameV1
): value is CFOPPhaseResultV1 {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["htm", "moves", "phase", "qtm", "verified"]) &&
    value.phase === phase &&
    isMoveArray(value.moves) &&
    value.htm === value.moves.length &&
    value.qtm === qtm(value.moves) &&
    value.verified === true
  );
}

function isF2LPhase(value: unknown): value is CFOPResultV1["phases"]["f2l"] {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "htm",
      "moves",
      "phase",
      "qtm",
      "slots",
      "solvedOrder",
      "verified",
    ]) ||
    value.phase !== "F2L" ||
    !isMoveArray(value.moves) ||
    value.htm !== value.moves.length ||
    value.qtm !== qtm(value.moves) ||
    value.verified !== true ||
    !Array.isArray(value.slots) ||
    value.slots.length !== CFOP_F2L_SLOTS_V1.length ||
    !Array.isArray(value.solvedOrder) ||
    value.solvedOrder.length > CFOP_F2L_SLOTS_V1.length
  ) {
    return false;
  }

  const expectedSlots = new Set<string>(CFOP_F2L_SLOTS_V1);
  const slots = new Map<string, readonly string[]>();

  for (const slot of value.slots) {
    if (
      !isRecord(slot) ||
      !hasExactKeys(slot, ["htm", "moves", "qtm", "slot"]) ||
      typeof slot.slot !== "string" ||
      !expectedSlots.has(slot.slot) ||
      slots.has(slot.slot) ||
      !isMoveArray(slot.moves) ||
      slot.htm !== slot.moves.length ||
      slot.qtm !== qtm(slot.moves)
    ) {
      return false;
    }
    slots.set(slot.slot, slot.moves);
  }

  const order = value.solvedOrder;
  if (
    !order.every((slot) => typeof slot === "string" && expectedSlots.has(slot)) ||
    new Set(order).size !== order.length
  ) {
    return false;
  }

  const stagedMoves = order.flatMap((slot) => slots.get(slot) ?? []);
  return stagedMoves.join(" ") === value.moves.join(" ");
}

function isResult(value: unknown): value is CFOPResultV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "input",
      "method",
      "phases",
      "schemaId",
      "schemaVersion",
      "solution",
      "timings",
    ]) ||
    value.schemaId !== "CFOPSolutionV1" ||
    value.schemaVersion !== CFOP_SCHEMA_VERSION_V1 ||
    !isRecord(value.input) ||
    !hasExactKeys(value.input, ["format", "inputMode", "stateId"]) ||
    !isIdentifier(value.input.stateId) ||
    value.input.format !== "URFDLB_FACELETS_V1" ||
    value.input.inputMode !== CFOP_INPUT_MODE_V1 ||
    !isRecord(value.method) ||
    !hasExactKeys(value.method, ["historyUsage", "id", "orientation", "version"]) ||
    value.method.id !== "CFOP" ||
    value.method.version !== "1.0" ||
    value.method.orientation !== "D_CROSS_U_LAST_LAYER" ||
    value.method.historyUsage !== "NONE" ||
    !isRecord(value.phases) ||
    !hasExactKeys(value.phases, ["cross", "f2l", "oll", "pll"]) ||
    !isPhase(value.phases.cross, "CROSS") ||
    !isF2LPhase(value.phases.f2l) ||
    !isPhase(value.phases.oll, "OLL") ||
    !isPhase(value.phases.pll, "PLL") ||
    !isRecord(value.solution) ||
    !hasExactKeys(value.solution, ["htm", "moves", "qtm", "verified"]) ||
    !isMoveArray(value.solution.moves) ||
    value.solution.htm !== value.solution.moves.length ||
    value.solution.qtm !== qtm(value.solution.moves) ||
    value.solution.verified !== true ||
    !isRecord(value.timings) ||
    !hasExactKeys(value.timings, ["durationMs"]) ||
    typeof value.timings.durationMs !== "number" ||
    !Number.isFinite(value.timings.durationMs) ||
    value.timings.durationMs < 0
  ) {
    return false;
  }

  const phaseMoves = [
    ...value.phases.cross.moves,
    ...value.phases.f2l.moves,
    ...value.phases.oll.moves,
    ...value.phases.pll.moves,
  ];

  return phaseMoves.join(" ") === value.solution.moves.join(" ");
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function parseServerError(payload: Record<string, unknown>): never {
  if (
    !hasExactKeys(payload, ["error", "requestId", "schemaVersion"]) ||
    payload.schemaVersion !== CFOP_SCHEMA_VERSION_V1 ||
    !isIdentifier(payload.requestId) ||
    !isRecord(payload.error) ||
    !hasExactKeys(payload.error, ["code", "message", "retryable", "stage"]) ||
    typeof payload.error.code !== "string" ||
    !SERVER_ERROR_CODES.has(payload.error.code) ||
    typeof payload.error.message !== "string" ||
    typeof payload.error.stage !== "string" ||
    typeof payload.error.retryable !== "boolean"
  ) {
    incompatibleResponse();
  }

  const code = payload.error.code as CFOPErrorCodeV1;
  const contract = SERVER_ERROR_CONTRACT[code];
  if (
    payload.error.stage !== contract.stage ||
    payload.error.retryable !== contract.retryable
  ) {
    incompatibleResponse();
  }

  throw new UiCFOPErrorV1(publicError(code, payload.requestId));
}

export function serializeCFOPRequestV1(facelets: string) {
  return Object.freeze({
    schemaVersion: CFOP_SCHEMA_VERSION_V1,
    inputMode: CFOP_INPUT_MODE_V1,
    cubeState: Object.freeze({
      format: "URFDLB_FACELETS_V1" as const,
      facelets,
    }),
  });
}

export function parseCFOPResponseV1(
  payload: unknown,
  responseOk: boolean
): Readonly<{ requestId: string; result: CFOPResultV1 }> {
  if (!isRecord(payload)) incompatibleResponse();

  if ("result" in payload && responseOk) {
    if (
      !hasExactKeys(payload, ["requestId", "result", "schemaVersion"]) ||
      payload.schemaVersion !== CFOP_SCHEMA_VERSION_V1 ||
      !isIdentifier(payload.requestId) ||
      !isResult(payload.result)
    ) {
      incompatibleResponse();
    }

    return deepFreeze({ requestId: payload.requestId, result: payload.result });
  }

  if ("error" in payload && !responseOk) return parseServerError(payload);
  return incompatibleResponse();
}

export function normalizeUiCFOPErrorV1(error: unknown): UiCFOPPublicErrorV1 {
  if (error instanceof UiCFOPErrorV1) return error.publicError;
  if (error instanceof DOMException && error.name === "AbortError") {
    return publicError("REQUEST_CANCELLED");
  }
  return publicError("NETWORK_UNAVAILABLE");
}

export type CFOPCubeOperationV1 = Readonly<{
  result: Promise<Readonly<{ requestId: string; result: CFOPResultV1 }>>;
  cancel(): void;
}>;

export function requestCFOPSolution(input: Readonly<{
  facelets: string;
}>): CFOPCubeOperationV1 {
  const controller = new AbortController();
  const body = serializeCFOPRequestV1(input.facelets);

  const result = fetch("/api/cfop", {
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
    return parseCFOPResponseV1(payload, response.ok);
  });

  return Object.freeze({
    result,
    cancel: () => controller.abort(),
  });
}
