import {
  PROCEDURE_LOG_MAX_LABEL_CHARACTERS_V1,
  PROCEDURE_LOG_MAX_MOVES_V1,
  PROCEDURE_LOG_SCHEMA_VERSION_V1,
  type CreateProcedureLogRequestV1,
  type ProcedureLogListItemV1,
  type ProcedureLogListV1,
  type ProcedureLogV1,
} from "../../types/procedure-log-v1";
import { MOVE_V1_TOKENS, type MoveV1 } from "../../types/solver-v1";

type FetchV1 = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATE_ID_PATTERN = /^[a-f0-9]{64}$/;
const FACELETS_PATTERN = /^[URFDLB]{54}$/;
const MOVE_TOKENS = new Set<string>(MOVE_V1_TOKENS);

export class ProcedureLogClientErrorV1 extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProcedureLogClientErrorV1";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).sort().join("|") === [...keys].sort().join("|");
}

function incompatible(): never {
  throw new ProcedureLogClientErrorV1(
    "INCOMPATIBLE_RESPONSE",
    "The procedure-log response is incompatible with this AES release.",
    false,
  );
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function validLabel(value: unknown): value is string | undefined {
  return value === undefined || (
    typeof value === "string" &&
    value.trim() === value &&
    Array.from(value).length >= 1 &&
    Array.from(value).length <= PROCEDURE_LOG_MAX_LABEL_CHARACTERS_V1
  );
}

function validMetrics(value: Record<string, unknown>): boolean {
  return (
    Number.isInteger(value.moveCount) &&
    Number.isInteger(value.htm) &&
    Number.isInteger(value.qtm) &&
    (value.moveCount as number) >= 0 &&
    value.moveCount === value.htm &&
    (value.htm as number) <= PROCEDURE_LOG_MAX_MOVES_V1 &&
    (value.qtm as number) >= (value.htm as number) &&
    (value.qtm as number) <= PROCEDURE_LOG_MAX_MOVES_V1 * 2
  );
}

function parseError(payload: unknown): never {
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ["error", "requestId", "schemaVersion"]) ||
    payload.schemaVersion !== PROCEDURE_LOG_SCHEMA_VERSION_V1 ||
    typeof payload.requestId !== "string" ||
    !isRecord(payload.error) ||
    !hasExactKeys(payload.error, ["code", "message", "retryable"]) ||
    typeof payload.error.code !== "string" ||
    typeof payload.error.message !== "string" ||
    typeof payload.error.retryable !== "boolean"
  ) {
    incompatible();
  }
  throw new ProcedureLogClientErrorV1(
    payload.error.code,
    payload.error.message,
    payload.error.retryable,
  );
}

function parseListItem(value: unknown): ProcedureLogListItemV1 {
  if (!isRecord(value)) incompatible();
  const expected = [
    "createdAt",
    "cubeState",
    "htm",
    "id",
    "moveCount",
    "qtm",
    "schemaVersion",
    "updatedAt",
    ...(value.label === undefined ? [] : ["label"]),
  ];
  if (
    !hasExactKeys(value, expected) ||
    typeof value.id !== "string" ||
    !UUID_PATTERN.test(value.id) ||
    value.schemaVersion !== PROCEDURE_LOG_SCHEMA_VERSION_V1 ||
    !validLabel(value.label) ||
    !validMetrics(value) ||
    !validTimestamp(value.createdAt) ||
    !validTimestamp(value.updatedAt) ||
    !isRecord(value.cubeState) ||
    !hasExactKeys(value.cubeState, ["format", "stateId"]) ||
    value.cubeState.format !== "URFDLB_FACELETS_V1" ||
    typeof value.cubeState.stateId !== "string" ||
    !STATE_ID_PATTERN.test(value.cubeState.stateId)
  ) {
    incompatible();
  }
  return value as unknown as ProcedureLogListItemV1;
}

function parseProcedureLog(value: unknown): ProcedureLogV1 {
  if (!isRecord(value)) incompatible();
  const expected = [
    "createdAt",
    "cubeState",
    "htm",
    "id",
    "moveCount",
    "moves",
    "qtm",
    "schemaVersion",
    "updatedAt",
    ...(value.label === undefined ? [] : ["label"]),
  ];
  if (
    !hasExactKeys(value, expected) ||
    typeof value.id !== "string" ||
    !UUID_PATTERN.test(value.id) ||
    value.schemaVersion !== PROCEDURE_LOG_SCHEMA_VERSION_V1 ||
    !validLabel(value.label) ||
    !validMetrics(value) ||
    !validTimestamp(value.createdAt) ||
    !validTimestamp(value.updatedAt) ||
    !isRecord(value.cubeState) ||
    !hasExactKeys(value.cubeState, ["facelets", "format", "stateId"]) ||
    value.cubeState.format !== "URFDLB_FACELETS_V1" ||
    typeof value.cubeState.facelets !== "string" ||
    !FACELETS_PATTERN.test(value.cubeState.facelets) ||
    typeof value.cubeState.stateId !== "string" ||
    !STATE_ID_PATTERN.test(value.cubeState.stateId) ||
    !Array.isArray(value.moves) ||
    value.moves.length !== value.moveCount ||
    !value.moves.every((move) => typeof move === "string" && MOVE_TOKENS.has(move))
  ) {
    incompatible();
  }
  return value as unknown as ProcedureLogV1;
}

function parseRecordEnvelope(
  payload: unknown,
  responseOk: boolean,
): ProcedureLogV1 {
  if (!responseOk) parseError(payload);
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ["procedureLog", "requestId", "schemaVersion"]) ||
    payload.schemaVersion !== PROCEDURE_LOG_SCHEMA_VERSION_V1 ||
    typeof payload.requestId !== "string"
  ) {
    incompatible();
  }
  return parseProcedureLog(payload.procedureLog);
}

export function serializeProcedureLogCreateRequestV1(input: Readonly<{
  facelets: string;
  moves: readonly MoveV1[];
  label?: string;
}>): CreateProcedureLogRequestV1 {
  const label = input.label?.trim();
  if (
    !FACELETS_PATTERN.test(input.facelets) ||
    input.moves.length > PROCEDURE_LOG_MAX_MOVES_V1 ||
    !input.moves.every((move) => MOVE_TOKENS.has(move)) ||
    (label !== undefined &&
      label !== "" &&
      Array.from(label).length > PROCEDURE_LOG_MAX_LABEL_CHARACTERS_V1)
  ) {
    throw new ProcedureLogClientErrorV1(
      "INVALID_REQUEST",
      "The procedure is not valid for saving.",
      false,
    );
  }
  return Object.freeze({
    schemaVersion: PROCEDURE_LOG_SCHEMA_VERSION_V1,
    cubeState: Object.freeze({
      format: "URFDLB_FACELETS_V1" as const,
      facelets: input.facelets,
    }),
    moves: Object.freeze([...input.moves]),
    ...(label === undefined || label === "" ? {} : { label }),
  });
}

export function parseProcedureLogCreateResponseV1(
  payload: unknown,
  responseOk: boolean,
): ProcedureLogV1 {
  return parseRecordEnvelope(payload, responseOk);
}

export function parseProcedureLogDetailResponseV1(
  payload: unknown,
  responseOk: boolean,
): ProcedureLogV1 {
  return parseRecordEnvelope(payload, responseOk);
}

export function parseProcedureLogListResponseV1(
  payload: unknown,
  responseOk: boolean,
): ProcedureLogListV1 {
  if (!responseOk) parseError(payload);
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ["list", "requestId", "schemaVersion"]) ||
    payload.schemaVersion !== PROCEDURE_LOG_SCHEMA_VERSION_V1 ||
    typeof payload.requestId !== "string" ||
    !isRecord(payload.list)
  ) {
    incompatible();
  }
  const expected = payload.list.nextCursor === undefined
    ? ["items"]
    : ["items", "nextCursor"];
  if (
    !hasExactKeys(payload.list, expected) ||
    !Array.isArray(payload.list.items) ||
    payload.list.items.length > 50 ||
    (payload.list.nextCursor !== undefined &&
      typeof payload.list.nextCursor !== "string")
  ) {
    incompatible();
  }
  return Object.freeze({
    items: Object.freeze(payload.list.items.map(parseListItem)),
    ...(typeof payload.list.nextCursor === "string"
      ? { nextCursor: payload.list.nextCursor }
      : {}),
  });
}

export function parseProcedureLogDeleteResponseV1(
  payload: unknown,
  responseOk: boolean,
): true {
  if (!responseOk) parseError(payload);
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ["deleted", "requestId", "schemaVersion"]) ||
    payload.schemaVersion !== PROCEDURE_LOG_SCHEMA_VERSION_V1 ||
    typeof payload.requestId !== "string" ||
    payload.deleted !== true
  ) {
    incompatible();
  }
  return true;
}

export async function procedureLogJsonV1(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    incompatible();
  }
}

export async function createProcedureLogV1(
  input: Readonly<{
    facelets: string;
    moves: readonly MoveV1[];
    label?: string;
  }>,
  fetcher: FetchV1 = fetch,
): Promise<ProcedureLogV1> {
  const response = await fetcher("/api/procedure-logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(serializeProcedureLogCreateRequestV1(input)),
  });
  return parseProcedureLogCreateResponseV1(
    await procedureLogJsonV1(response),
    response.ok,
  );
}

export async function listProcedureLogsV1(
  cursor?: string,
  fetcher: FetchV1 = fetch,
): Promise<ProcedureLogListV1> {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor !== undefined) query.set("cursor", cursor);
  const response = await fetcher(`/api/procedure-logs?${query.toString()}`, {
    cache: "no-store",
  });
  return parseProcedureLogListResponseV1(
    await procedureLogJsonV1(response),
    response.ok,
  );
}

export async function getProcedureLogV1(
  id: string,
  fetcher: FetchV1 = fetch,
): Promise<ProcedureLogV1> {
  const response = await fetcher(`/api/procedure-logs/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  return parseProcedureLogDetailResponseV1(
    await procedureLogJsonV1(response),
    response.ok,
  );
}

export async function deleteProcedureLogV1(
  id: string,
  fetcher: FetchV1 = fetch,
): Promise<true> {
  const response = await fetcher(`/api/procedure-logs/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return parseProcedureLogDeleteResponseV1(
    await procedureLogJsonV1(response),
    response.ok,
  );
}
