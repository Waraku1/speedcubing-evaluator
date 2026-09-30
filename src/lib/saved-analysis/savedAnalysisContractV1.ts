import { Buffer } from "node:buffer";

import {
  CFOP_SCHEMA_VERSION_V1,
  type CFOPResultV1,
} from "../../types/cfop-v1";
import {
  EVALUATE_SCHEMA_VERSION_V1,
  type EvaluateResultV1,
} from "../../types/evaluate-v1";
import {
  SAVED_ANALYSIS_DEFAULT_PAGE_SIZE_V1,
  SAVED_ANALYSIS_MAX_LABEL_CHARACTERS_V1,
  SAVED_ANALYSIS_MAX_PAGE_SIZE_V1,
  SAVED_ANALYSIS_SCHEMA_VERSION_V1,
  type SaveAnalysisRequestV1,
  type SavedAnalysisListItemV1,
  type SavedAnalysisListV1,
  type SavedAnalysisV1,
} from "../../types/saved-analysis-v1";
import type {
  SavedAnalysisCursorV1,
  SavedAnalysisRecordPageV1,
  SavedAnalysisRecordV1,
} from "./SavedAnalysisRepositoryV1";
import { SavedAnalysisV1Error } from "./savedAnalysisErrorsV1";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATE_ID_PATTERN = /^[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): boolean {
  return Object.keys(value).sort().join("|") === [...keys].sort().join("|");
}

function normalizedLabel(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new SavedAnalysisV1Error("INVALID_REQUEST");
  }
  const normalized = value.trim();
  if (normalized === "") return undefined;
  if (Array.from(normalized).length > SAVED_ANALYSIS_MAX_LABEL_CHARACTERS_V1) {
    throw new SavedAnalysisV1Error("INVALID_REQUEST");
  }
  return normalized;
}

export function parseSaveAnalysisRequestV1(
  value: unknown
): SaveAnalysisRequestV1 {
  if (!isRecord(value)) {
    throw new SavedAnalysisV1Error("INVALID_REQUEST");
  }
  const expectedKeys =
    value.label === undefined
      ? ["cubeState", "includeCfop", "schemaVersion"]
      : ["cubeState", "includeCfop", "label", "schemaVersion"];
  if (
    !hasExactKeys(value, expectedKeys) ||
    value.schemaVersion !== SAVED_ANALYSIS_SCHEMA_VERSION_V1 ||
    typeof value.includeCfop !== "boolean" ||
    !isRecord(value.cubeState) ||
    !hasExactKeys(value.cubeState, ["facelets", "format"]) ||
    value.cubeState.format !== "URFDLB_FACELETS_V1" ||
    typeof value.cubeState.facelets !== "string"
  ) {
    throw new SavedAnalysisV1Error("INVALID_REQUEST");
  }
  const label = normalizedLabel(value.label);
  return Object.freeze({
    schemaVersion: SAVED_ANALYSIS_SCHEMA_VERSION_V1,
    cubeState: Object.freeze({
      format: "URFDLB_FACELETS_V1" as const,
      facelets: value.cubeState.facelets,
    }),
    includeCfop: value.includeCfop,
    ...(label === undefined ? {} : { label }),
  });
}

export function encodeSavedAnalysisCursorV1(
  cursor: SavedAnalysisCursorV1
): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeSavedAnalysisCursorV1(
  value: string
): SavedAnalysisCursorV1 {
  try {
    if (value.length < 1 || value.length > 256) throw new Error("cursor size");
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
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
    throw new SavedAnalysisV1Error("INVALID_REQUEST");
  }
}

export function parseSavedAnalysisListQueryV1(url: URL): Readonly<{
  limit: number;
  cursor?: SavedAnalysisCursorV1;
}> {
  const keys = [...url.searchParams.keys()];
  if (keys.some((key) => key !== "limit" && key !== "cursor")) {
    throw new SavedAnalysisV1Error("INVALID_REQUEST");
  }
  if (
    url.searchParams.getAll("limit").length > 1 ||
    url.searchParams.getAll("cursor").length > 1
  ) {
    throw new SavedAnalysisV1Error("INVALID_REQUEST");
  }
  const rawLimit = url.searchParams.get("limit");
  const limit =
    rawLimit === null ? SAVED_ANALYSIS_DEFAULT_PAGE_SIZE_V1 : Number(rawLimit);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > SAVED_ANALYSIS_MAX_PAGE_SIZE_V1
  ) {
    throw new SavedAnalysisV1Error("INVALID_REQUEST");
  }
  const rawCursor = url.searchParams.get("cursor");
  return Object.freeze({
    limit,
    ...(rawCursor === null
      ? {}
      : { cursor: decodeSavedAnalysisCursorV1(rawCursor) }),
  });
}

function assertCompatibleRecord(record: SavedAnalysisRecordV1): void {
  const evaluation = record.evaluationResult as unknown;
  const cfop = record.cfopResult as unknown;
  if (
    !UUID_PATTERN.test(record.id) ||
    record.schemaVersion !== SAVED_ANALYSIS_SCHEMA_VERSION_V1 ||
    record.cubeFormat !== "URFDLB_FACELETS_V1" ||
    !STATE_ID_PATTERN.test(record.cubeStateId) ||
    record.evaluationSchemaVersion !== EVALUATE_SCHEMA_VERSION_V1 ||
    !isRecord(evaluation) ||
    !isRecord(evaluation.cubeState) ||
    evaluation.cubeState.stateId !== record.cubeStateId ||
    (record.cfopResult === undefined) !==
      (record.cfopSchemaVersion === undefined) ||
    (cfop !== undefined &&
      (!isRecord(cfop) ||
        record.cfopSchemaVersion !== CFOP_SCHEMA_VERSION_V1 ||
        !isRecord(cfop.input) ||
        cfop.input.stateId !== record.cubeStateId))
  ) {
    throw new SavedAnalysisV1Error("INTERNAL_FAILURE");
  }
}

export function serializeSavedAnalysisV1(
  record: SavedAnalysisRecordV1
): SavedAnalysisV1 {
  assertCompatibleRecord(record);
  return Object.freeze({
    id: record.id,
    schemaVersion: SAVED_ANALYSIS_SCHEMA_VERSION_V1,
    ...(record.label === undefined ? {} : { label: record.label }),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    cubeState: Object.freeze({
      format: record.cubeFormat,
      facelets: record.cubeFacelets,
      stateId: record.cubeStateId,
    }),
    evaluation: Object.freeze({
      schemaVersion: EVALUATE_SCHEMA_VERSION_V1,
      result: record.evaluationResult as EvaluateResultV1,
    }),
    ...(record.cfopResult === undefined
      ? {}
      : {
          cfop: Object.freeze({
            schemaVersion: CFOP_SCHEMA_VERSION_V1,
            result: record.cfopResult as CFOPResultV1,
          }),
        }),
  });
}

export function serializeSavedAnalysisListItemV1(
  record: SavedAnalysisRecordV1
): SavedAnalysisListItemV1 {
  assertCompatibleRecord(record);
  return Object.freeze({
    id: record.id,
    schemaVersion: SAVED_ANALYSIS_SCHEMA_VERSION_V1,
    ...(record.label === undefined ? {} : { label: record.label }),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    cubeState: Object.freeze({
      format: record.cubeFormat,
      stateId: record.cubeStateId,
    }),
    hasCfop: record.cfopResult !== undefined,
  });
}

export function serializeSavedAnalysisListV1(
  page: SavedAnalysisRecordPageV1
): SavedAnalysisListV1 {
  return Object.freeze({
    items: Object.freeze(page.records.map(serializeSavedAnalysisListItemV1)),
    ...(page.nextCursor === undefined
      ? {}
      : { nextCursor: encodeSavedAnalysisCursorV1(page.nextCursor) }),
  });
}

export function isSavedAnalysisIdV1(value: string): boolean {
  return UUID_PATTERN.test(value);
}
