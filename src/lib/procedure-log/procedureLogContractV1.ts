import { Buffer } from "node:buffer";

import {
  PROCEDURE_LOG_DEFAULT_PAGE_SIZE_V1,
  PROCEDURE_LOG_MAX_LABEL_CHARACTERS_V1,
  PROCEDURE_LOG_MAX_MOVES_V1,
  PROCEDURE_LOG_MAX_PAGE_SIZE_V1,
  PROCEDURE_LOG_SCHEMA_VERSION_V1,
  type CreateProcedureLogRequestV1,
  type ProcedureLogListItemV1,
  type ProcedureLogListV1,
  type ProcedureLogV1,
} from "../../types/procedure-log-v1";
import {
  MOVE_V1_TOKENS,
  type MoveV1,
} from "../../types/solver-v1";
import { applyMoves, countQTM, SOLVED_STATE } from "../cube/moves";
import { createCubeFaceletStateV1 } from "../cube/cubeStateV1";
import type {
  ProcedureLogCursorV1,
  ProcedureLogListRecordV1,
  ProcedureLogRecordPageV1,
  ProcedureLogRecordV1,
} from "./ProcedureLogRepositoryV1";
import { ProcedureLogV1Error } from "./procedureLogErrorsV1";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATE_ID_PATTERN = /^[a-f0-9]{64}$/;
const MOVE_TOKENS = new Set<string>(MOVE_V1_TOKENS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).sort().join("|") === [...keys].sort().join("|");
}

function normalizedLabel(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new ProcedureLogV1Error("INVALID_REQUEST");
  }
  const normalized = value.trim();
  if (normalized === "") return undefined;
  if (Array.from(normalized).length > PROCEDURE_LOG_MAX_LABEL_CHARACTERS_V1) {
    throw new ProcedureLogV1Error("INVALID_REQUEST");
  }
  return normalized;
}

function parsedMoves(value: unknown): readonly MoveV1[] {
  if (!Array.isArray(value)) {
    throw new ProcedureLogV1Error("INVALID_REQUEST");
  }
  if (
    value.length > PROCEDURE_LOG_MAX_MOVES_V1 ||
    !value.every((move) => typeof move === "string" && MOVE_TOKENS.has(move))
  ) {
    throw new ProcedureLogV1Error("INVALID_MOVE_SEQUENCE");
  }
  return Object.freeze([...value]) as readonly MoveV1[];
}

export function parseCreateProcedureLogRequestV1(
  value: unknown,
): CreateProcedureLogRequestV1 {
  if (!isRecord(value)) {
    throw new ProcedureLogV1Error("INVALID_REQUEST");
  }
  const expectedKeys = value.label === undefined
    ? ["cubeState", "moves", "schemaVersion"]
    : ["cubeState", "label", "moves", "schemaVersion"];
  if (
    !hasExactKeys(value, expectedKeys) ||
    value.schemaVersion !== PROCEDURE_LOG_SCHEMA_VERSION_V1 ||
    !isRecord(value.cubeState) ||
    !hasExactKeys(value.cubeState, ["facelets", "format"]) ||
    value.cubeState.format !== "URFDLB_FACELETS_V1" ||
    typeof value.cubeState.facelets !== "string"
  ) {
    throw new ProcedureLogV1Error("INVALID_REQUEST");
  }

  const label = normalizedLabel(value.label);
  return Object.freeze({
    schemaVersion: PROCEDURE_LOG_SCHEMA_VERSION_V1,
    cubeState: Object.freeze({
      format: "URFDLB_FACELETS_V1" as const,
      facelets: value.cubeState.facelets,
    }),
    moves: parsedMoves(value.moves),
    ...(label === undefined ? {} : { label }),
  });
}

export function encodeProcedureLogCursorV1(
  cursor: ProcedureLogCursorV1,
): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeProcedureLogCursorV1(
  value: string,
): ProcedureLogCursorV1 {
  try {
    if (value.length < 1 || value.length > 256) throw new Error("cursor size");
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as unknown;
    if (
      !isRecord(parsed) ||
      !hasExactKeys(parsed, ["createdAt", "id"]) ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.id !== "string" ||
      !UUID_PATTERN.test(parsed.id) ||
      new Date(parsed.createdAt).toISOString() !== parsed.createdAt
    ) {
      throw new Error("cursor contract");
    }
    return Object.freeze({ createdAt: parsed.createdAt, id: parsed.id });
  } catch {
    throw new ProcedureLogV1Error("INVALID_REQUEST");
  }
}

export function parseProcedureLogListQueryV1(url: URL): Readonly<{
  limit: number;
  cursor?: ProcedureLogCursorV1;
}> {
  const keys = [...url.searchParams.keys()];
  if (keys.some((key) => key !== "limit" && key !== "cursor")) {
    throw new ProcedureLogV1Error("INVALID_REQUEST");
  }
  if (
    url.searchParams.getAll("limit").length > 1 ||
    url.searchParams.getAll("cursor").length > 1
  ) {
    throw new ProcedureLogV1Error("INVALID_REQUEST");
  }
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null
    ? PROCEDURE_LOG_DEFAULT_PAGE_SIZE_V1
    : Number(rawLimit);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > PROCEDURE_LOG_MAX_PAGE_SIZE_V1
  ) {
    throw new ProcedureLogV1Error("INVALID_REQUEST");
  }
  const rawCursor = url.searchParams.get("cursor");
  return Object.freeze({
    limit,
    ...(rawCursor === null ? {} : { cursor: decodeProcedureLogCursorV1(rawCursor) }),
  });
}

function assertCompatibleMetadata(record: ProcedureLogListRecordV1): void {
  if (
    !UUID_PATTERN.test(record.id) ||
    record.schemaVersion !== PROCEDURE_LOG_SCHEMA_VERSION_V1 ||
    record.cubeFormat !== "URFDLB_FACELETS_V1" ||
    !STATE_ID_PATTERN.test(record.cubeStateId) ||
    !Number.isInteger(record.htm) ||
    record.htm < 0 ||
    record.htm > PROCEDURE_LOG_MAX_MOVES_V1 ||
    !Number.isInteger(record.qtm) ||
    record.qtm < record.htm ||
    record.qtm > PROCEDURE_LOG_MAX_MOVES_V1 * 2 ||
    (record.label !== undefined &&
      (Array.from(record.label).length < 1 ||
        Array.from(record.label).length > PROCEDURE_LOG_MAX_LABEL_CHARACTERS_V1))
  ) {
    throw new ProcedureLogV1Error("INTERNAL_FAILURE");
  }
}

function assertCompatibleRecord(record: ProcedureLogRecordV1): void {
  assertCompatibleMetadata(record);
  if (
    !/^[URFDLB]{54}$/.test(record.cubeFacelets) ||
    record.moves.length !== record.htm ||
    countQTM(record.moves) !== record.qtm ||
    !record.moves.every((move) => MOVE_TOKENS.has(move))
  ) {
    throw new ProcedureLogV1Error("INTERNAL_FAILURE");
  }
  try {
    const cube = createCubeFaceletStateV1(record.cubeFacelets);
    if (
      cube.stateId !== record.cubeStateId ||
      applyMoves(cube.facelets, record.moves) !== SOLVED_STATE
    ) {
      throw new ProcedureLogV1Error("INTERNAL_FAILURE");
    }
  } catch {
    throw new ProcedureLogV1Error("INTERNAL_FAILURE");
  }
}

export function serializeProcedureLogV1(
  record: ProcedureLogRecordV1,
): ProcedureLogV1 {
  assertCompatibleRecord(record);
  return Object.freeze({
    id: record.id,
    schemaVersion: PROCEDURE_LOG_SCHEMA_VERSION_V1,
    ...(record.label === undefined ? {} : { label: record.label }),
    cubeState: Object.freeze({
      format: record.cubeFormat,
      facelets: record.cubeFacelets,
      stateId: record.cubeStateId,
    }),
    moves: Object.freeze([...record.moves]),
    moveCount: record.htm,
    htm: record.htm,
    qtm: record.qtm,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function serializeProcedureLogListItemV1(
  record: ProcedureLogListRecordV1,
): ProcedureLogListItemV1 {
  assertCompatibleMetadata(record);
  return Object.freeze({
    id: record.id,
    schemaVersion: PROCEDURE_LOG_SCHEMA_VERSION_V1,
    ...(record.label === undefined ? {} : { label: record.label }),
    cubeState: Object.freeze({
      format: record.cubeFormat,
      stateId: record.cubeStateId,
    }),
    moveCount: record.htm,
    htm: record.htm,
    qtm: record.qtm,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function serializeProcedureLogListV1(
  page: ProcedureLogRecordPageV1,
): ProcedureLogListV1 {
  return Object.freeze({
    items: Object.freeze(page.records.map(serializeProcedureLogListItemV1)),
    ...(page.nextCursor === undefined
      ? {}
      : { nextCursor: encodeProcedureLogCursorV1(page.nextCursor) }),
  });
}

export function isProcedureLogIdV1(value: string): boolean {
  return UUID_PATTERN.test(value);
}
