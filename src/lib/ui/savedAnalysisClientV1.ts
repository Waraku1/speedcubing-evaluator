import type { CFOPResultV1 } from "../../types/cfop-v1";
import type {
  SavedAnalysisListItemV1,
  SavedAnalysisV1,
} from "../../types/saved-analysis-v1";
import { parseCFOPResponseV1 } from "./cfopCube";
import { parseEvaluateResponseV1 } from "./evaluateCube";
import type { UiEvaluateResultV1 } from "./evaluateUiTypesV1";

export class SavedAnalysisClientErrorV1 extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "SavedAnalysisClientErrorV1";
  }
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

function incompatible(): never {
  throw new SavedAnalysisClientErrorV1(
    "INCOMPATIBLE_RESPONSE",
    "The saved-analysis response is incompatible with this AES release.",
    false
  );
}

function parseError(payload: unknown): never {
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ["error", "requestId", "schemaVersion"]) ||
    payload.schemaVersion !== "1.0" ||
    typeof payload.requestId !== "string" ||
    !isRecord(payload.error) ||
    !hasExactKeys(payload.error, ["code", "message", "retryable"]) ||
    typeof payload.error.code !== "string" ||
    typeof payload.error.message !== "string" ||
    typeof payload.error.retryable !== "boolean"
  ) {
    incompatible();
  }
  throw new SavedAnalysisClientErrorV1(
    payload.error.code,
    payload.error.message,
    payload.error.retryable
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

function parseListItem(value: unknown): SavedAnalysisListItemV1 {
  if (!isRecord(value)) incompatible();
  const expected = value.label === undefined
    ? ["createdAt", "cubeState", "hasCfop", "id", "schemaVersion", "updatedAt"]
    : ["createdAt", "cubeState", "hasCfop", "id", "label", "schemaVersion", "updatedAt"];
  if (
    !hasExactKeys(value, expected) ||
    typeof value.id !== "string" ||
    value.schemaVersion !== "1.0" ||
    (value.label !== undefined && typeof value.label !== "string") ||
    !validTimestamp(value.createdAt) ||
    !validTimestamp(value.updatedAt) ||
    typeof value.hasCfop !== "boolean" ||
    !isRecord(value.cubeState) ||
    !hasExactKeys(value.cubeState, ["format", "stateId"]) ||
    value.cubeState.format !== "URFDLB_FACELETS_V1" ||
    typeof value.cubeState.stateId !== "string"
  ) {
    incompatible();
  }
  return value as SavedAnalysisListItemV1;
}

export function parseSavedAnalysisListResponseV1(
  payload: unknown,
  responseOk: boolean
): Readonly<{ items: readonly SavedAnalysisListItemV1[]; nextCursor?: string }> {
  if (!responseOk) parseError(payload);
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ["list", "requestId", "schemaVersion"]) ||
    payload.schemaVersion !== "1.0" ||
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

export type SavedAnalysisDetailClientV1 = Readonly<{
  savedAnalysis: SavedAnalysisV1;
  evaluation: UiEvaluateResultV1;
  cfop?: CFOPResultV1;
}>;

export function parseSavedAnalysisDetailResponseV1(
  payload: unknown,
  responseOk: boolean
): SavedAnalysisDetailClientV1 {
  if (!responseOk) parseError(payload);
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ["requestId", "savedAnalysis", "schemaVersion"]) ||
    payload.schemaVersion !== "1.0" ||
    typeof payload.requestId !== "string" ||
    !isRecord(payload.savedAnalysis)
  ) {
    incompatible();
  }
  const saved = payload.savedAnalysis;
  const expected = [
    "createdAt", "cubeState", "evaluation", "id", "schemaVersion", "updatedAt",
    ...(saved.label === undefined ? [] : ["label"]),
    ...(saved.cfop === undefined ? [] : ["cfop"]),
  ];
  if (
    !hasExactKeys(saved, expected) ||
    typeof saved.id !== "string" ||
    saved.schemaVersion !== "1.0" ||
    (saved.label !== undefined && typeof saved.label !== "string") ||
    !validTimestamp(saved.createdAt) ||
    !validTimestamp(saved.updatedAt) ||
    !isRecord(saved.cubeState) ||
    !hasExactKeys(saved.cubeState, ["facelets", "format", "stateId"]) ||
    saved.cubeState.format !== "URFDLB_FACELETS_V1" ||
    typeof saved.cubeState.facelets !== "string" ||
    typeof saved.cubeState.stateId !== "string" ||
    !isRecord(saved.evaluation) ||
    !hasExactKeys(saved.evaluation, ["result", "schemaVersion"]) ||
    saved.evaluation.schemaVersion !== "1.0"
  ) {
    incompatible();
  }
  const evaluation = parseEvaluateResponseV1(
    { schemaVersion: "1.0", requestId: `saved:${saved.id}`, result: saved.evaluation.result },
    true
  );
  if (evaluation.cube.stateId !== saved.cubeState.stateId) incompatible();

  let cfop: CFOPResultV1 | undefined;
  if (saved.cfop !== undefined) {
    if (
      !isRecord(saved.cfop) ||
      !hasExactKeys(saved.cfop, ["result", "schemaVersion"]) ||
      saved.cfop.schemaVersion !== "1.0"
    ) {
      incompatible();
    }
    cfop = parseCFOPResponseV1(
      { schemaVersion: "1.0", requestId: `saved-cfop:${saved.id}`, result: saved.cfop.result },
      true
    ).result;
    if (cfop.input.stateId !== saved.cubeState.stateId) incompatible();
  }

  return Object.freeze({
    savedAnalysis: saved as unknown as SavedAnalysisV1,
    evaluation,
    ...(cfop === undefined ? {} : { cfop }),
  });
}

export async function savedAnalysisJsonV1(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    incompatible();
  }
}
