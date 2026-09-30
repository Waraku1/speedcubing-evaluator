import {
  CFOP_ALTERNATIVES_DEFAULT_LIMIT_V1,
  CFOP_ALTERNATIVES_SCHEMA_ID_V1,
  CFOP_ALTERNATIVES_SCHEMA_VERSION_V1,
  CFOP_ALTERNATIVE_STRATEGIES_V1,
  type CFOPAlternativeV1,
  type CFOPAlternativesResultV1,
} from "../../types/cfop-alternatives-v1";
import { CFOP_F2L_SLOTS_V1, type CFOPPhaseNameV1 } from "../../types/cfop-v1";
import { parseCFOPResponseV1, UiCFOPErrorV1 } from "./cfopCube";
import { UI_MOVE_TOKENS_V1 } from "./evaluateUiTypesV1";

const MAX_MOVES = 512;
const MAX_IDENTIFIER_LENGTH = 512;
const MOVE_TOKENS = new Set<string>(UI_MOVE_TOKENS_V1);
const F2L_SLOTS = new Set<string>(CFOP_F2L_SLOTS_V1);
const STRATEGIES = new Set<string>(CFOP_ALTERNATIVE_STRATEGIES_V1);

function incompatibleResponse(): never {
  throw new UiCFOPErrorV1(Object.freeze({
    code: "INCOMPATIBLE_RESPONSE",
    title: "Incompatible CFOP response",
    explanation: "The server response did not match the CFOP V1 contract.",
    retryable: false,
  }));
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

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_IDENTIFIER_LENGTH
  );
}

function isIdentifierArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_MOVES &&
    value.every(isIdentifier)
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
    0,
  );
}

function isPhaseBase(
  value: Record<string, unknown>,
  phase: CFOPPhaseNameV1,
): boolean {
  return (
    value.phase === phase &&
    isMoveArray(value.moves) &&
    value.htm === value.moves.length &&
    value.qtm === qtm(value.moves) &&
    value.verified === true
  );
}

function isSimplePhase(value: unknown, phase: "CROSS"): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["htm", "moves", "phase", "qtm", "verified"]) &&
    isPhaseBase(value, phase)
  );
}

function isF2LPhase(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "htm",
      "moves",
      "phase",
      "qtm",
      "solvedOrder",
      "stages",
      "verified",
    ]) ||
    !isPhaseBase(value, "F2L") ||
    !Array.isArray(value.solvedOrder) ||
    value.solvedOrder.length > CFOP_F2L_SLOTS_V1.length ||
    !value.solvedOrder.every(
      (slot) => typeof slot === "string" && F2L_SLOTS.has(slot),
    ) ||
    new Set(value.solvedOrder).size !== value.solvedOrder.length ||
    !Array.isArray(value.stages) ||
    value.stages.length !== value.solvedOrder.length
  ) {
    return false;
  }

  const stagedMoves: string[] = [];
  for (let index = 0; index < value.stages.length; index++) {
    const stage = value.stages[index];
    if (
      !isRecord(stage) ||
      !hasExactKeys(stage, ["htm", "macroIds", "moves", "qtm", "slot"]) ||
      stage.slot !== value.solvedOrder[index] ||
      !isMoveArray(stage.moves) ||
      stage.htm !== stage.moves.length ||
      stage.qtm !== qtm(stage.moves) ||
      !isIdentifierArray(stage.macroIds)
    ) {
      return false;
    }
    stagedMoves.push(...stage.moves);
  }

  return stagedMoves.join(" ") === (value.moves as readonly string[]).join(" ");
}

function isLastLayerPhase(value: unknown, phase: "OLL" | "PLL"): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "algorithmIds",
      "caseId",
      "htm",
      "moves",
      "phase",
      "qtm",
      "verified",
    ]) &&
    isPhaseBase(value, phase) &&
    isIdentifier(value.caseId) &&
    isIdentifierArray(value.algorithmIds)
  );
}

function isAlternative(value: unknown, expectedOrdinal: number): value is CFOPAlternativeV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["ordinal", "phases", "solution", "strategy"]) ||
    value.ordinal !== expectedOrdinal ||
    typeof value.strategy !== "string" ||
    !STRATEGIES.has(value.strategy) ||
    !isRecord(value.phases) ||
    !hasExactKeys(value.phases, ["cross", "f2l", "oll", "pll"]) ||
    !isSimplePhase(value.phases.cross, "CROSS") ||
    !isF2LPhase(value.phases.f2l) ||
    !isLastLayerPhase(value.phases.oll, "OLL") ||
    !isLastLayerPhase(value.phases.pll, "PLL") ||
    !isRecord(value.solution) ||
    !hasExactKeys(value.solution, ["htm", "moves", "qtm", "verified"]) ||
    !isMoveArray(value.solution.moves) ||
    value.solution.htm !== value.solution.moves.length ||
    value.solution.qtm !== qtm(value.solution.moves) ||
    value.solution.verified !== true
  ) {
    return false;
  }

  const phaseMoves = [
    ...(value.phases.cross as { moves: readonly string[] }).moves,
    ...(value.phases.f2l as { moves: readonly string[] }).moves,
    ...(value.phases.oll as { moves: readonly string[] }).moves,
    ...(value.phases.pll as { moves: readonly string[] }).moves,
  ];
  return phaseMoves.join(" ") === value.solution.moves.join(" ");
}

function isResult(value: unknown): value is CFOPAlternativesResultV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "alternatives",
      "generatedCount",
      "input",
      "method",
      "requestedLimit",
      "schemaId",
      "schemaVersion",
      "timings",
    ]) ||
    value.schemaId !== CFOP_ALTERNATIVES_SCHEMA_ID_V1 ||
    value.schemaVersion !== CFOP_ALTERNATIVES_SCHEMA_VERSION_V1 ||
    !Number.isInteger(value.requestedLimit) ||
    (value.requestedLimit as number) < 2 ||
    (value.requestedLimit as number) > 4 ||
    !Array.isArray(value.alternatives) ||
    value.alternatives.length < 1 ||
    value.alternatives.length > (value.requestedLimit as number) ||
    value.generatedCount !== value.alternatives.length ||
    !isRecord(value.input) ||
    !hasExactKeys(value.input, ["format", "inputMode", "stateId"]) ||
    !isIdentifier(value.input.stateId) ||
    value.input.format !== "URFDLB_FACELETS_V1" ||
    value.input.inputMode !== "FACELET_STATE" ||
    !isRecord(value.method) ||
    !hasExactKeys(value.method, ["historyUsage", "id", "orientation", "version"]) ||
    value.method.id !== "CFOP" ||
    value.method.version !== "1.0" ||
    value.method.orientation !== "D_CROSS_U_LAST_LAYER" ||
    value.method.historyUsage !== "NONE" ||
    !isRecord(value.timings) ||
    !hasExactKeys(value.timings, ["durationMs"]) ||
    typeof value.timings.durationMs !== "number" ||
    !Number.isFinite(value.timings.durationMs) ||
    value.timings.durationMs < 0
  ) {
    return false;
  }

  const solutionKeys = new Set<string>();
  for (let index = 0; index < value.alternatives.length; index++) {
    const alternative = value.alternatives[index];
    if (!isAlternative(alternative, index + 1)) return false;
    if (index === 0 && alternative.strategy !== "DEFAULT") return false;
    const key = alternative.solution.moves.join(" ");
    if (solutionKeys.has(key)) return false;
    solutionKeys.add(key);
  }
  return true;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export function serializeCFOPAlternativesRequestV1(
  facelets: string,
  maxAlternatives = CFOP_ALTERNATIVES_DEFAULT_LIMIT_V1,
) {
  return Object.freeze({
    schemaVersion: CFOP_ALTERNATIVES_SCHEMA_VERSION_V1,
    inputMode: "FACELET_STATE" as const,
    cubeState: Object.freeze({
      format: "URFDLB_FACELETS_V1" as const,
      facelets,
    }),
    maxAlternatives,
  });
}

export function parseCFOPAlternativesResponseV1(
  payload: unknown,
  responseOk: boolean,
): CFOPAlternativesResultV1 {
  if (!responseOk && isRecord(payload) && "error" in payload) {
    parseCFOPResponseV1(payload, false);
  }
  if (!responseOk || !isResult(payload)) incompatibleResponse();
  return deepFreeze(payload);
}

export type CFOPAlternativesOperationV1 = Readonly<{
  result: Promise<CFOPAlternativesResultV1>;
  cancel(): void;
}>;

export function requestCFOPAlternatives(input: Readonly<{
  facelets: string;
  maxAlternatives?: number;
}>): CFOPAlternativesOperationV1 {
  const controller = new AbortController();
  const body = serializeCFOPAlternativesRequestV1(
    input.facelets,
    input.maxAlternatives,
  );

  const result = fetch("/api/cfop/alternatives", {
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
    return parseCFOPAlternativesResponseV1(payload, response.ok);
  });

  return Object.freeze({
    result,
    cancel: () => controller.abort(),
  });
}
