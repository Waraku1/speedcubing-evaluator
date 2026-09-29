import {
  CFOP_ERROR_CODES_V1,
  type CFOPErrorCodeV1,
  type CFOPErrorStageV1,
  type CFOPErrorValueV1,
} from "../../types/cfop-v1";
import { isSolverV1Error } from "../solver/solverErrorsV1";

const PUBLIC_MESSAGES: Record<CFOPErrorCodeV1, string> = {
  INVALID_JSON: "The request body is not valid CFOP API V1 JSON.",
  REQUEST_TOO_LARGE: "The request payload is too large.",
  UNSUPPORTED_MEDIA_TYPE: "The request media type is unsupported.",
  METHOD_NOT_ALLOWED: "The request method is unsupported.",
  UNSUPPORTED_INPUT_MODE:
    "Only direct facelet-state CFOP input is supported; cube history is not reconstructed.",
  INVALID_CUBE_STATE: "The cube state representation is invalid.",
  UNSOLVABLE_CUBE: "The cube state is not physically solvable.",
  CFOP_UNAVAILABLE: "The human-style CFOP solver is currently unavailable.",
  CFOP_VERIFICATION_FAILED:
    "The human-style CFOP result failed independent verification.",
  INTERNAL_FAILURE: "The CFOP request could not be completed.",
};

const STAGES: Record<CFOPErrorCodeV1, CFOPErrorStageV1> = {
  INVALID_JSON: "REQUEST",
  REQUEST_TOO_LARGE: "REQUEST",
  UNSUPPORTED_MEDIA_TYPE: "REQUEST",
  METHOD_NOT_ALLOWED: "REQUEST",
  UNSUPPORTED_INPUT_MODE: "VALIDATION",
  INVALID_CUBE_STATE: "VALIDATION",
  UNSOLVABLE_CUBE: "VALIDATION",
  CFOP_UNAVAILABLE: "CFOP",
  CFOP_VERIFICATION_FAILED: "VERIFICATION",
  INTERNAL_FAILURE: "INTERNAL",
};

const RETRYABLE: Record<CFOPErrorCodeV1, boolean> = {
  INVALID_JSON: false,
  REQUEST_TOO_LARGE: false,
  UNSUPPORTED_MEDIA_TYPE: false,
  METHOD_NOT_ALLOWED: false,
  UNSUPPORTED_INPUT_MODE: false,
  INVALID_CUBE_STATE: false,
  UNSOLVABLE_CUBE: false,
  CFOP_UNAVAILABLE: true,
  CFOP_VERIFICATION_FAILED: true,
  INTERNAL_FAILURE: false,
};

export const CFOP_HTTP_STATUS_V1: Record<CFOPErrorCodeV1, number> = {
  INVALID_JSON: 400,
  REQUEST_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  METHOD_NOT_ALLOWED: 405,
  UNSUPPORTED_INPUT_MODE: 422,
  INVALID_CUBE_STATE: 422,
  UNSOLVABLE_CUBE: 422,
  CFOP_UNAVAILABLE: 503,
  CFOP_VERIFICATION_FAILED: 502,
  INTERNAL_FAILURE: 500,
};

export class CFOPV1Error extends Error {
  readonly code: CFOPErrorCodeV1;

  constructor(code: CFOPErrorCodeV1) {
    super(PUBLIC_MESSAGES[code]);
    this.name = "CFOPV1Error";
    this.code = code;
    Object.setPrototypeOf(this, CFOPV1Error.prototype);
  }
}

export function isCFOPV1Error(value: unknown): value is CFOPV1Error {
  if (typeof value !== "object" || value === null || !("code" in value)) {
    return false;
  }

  return CFOP_ERROR_CODES_V1.some(
    (code) => code === (value as { code: unknown }).code
  );
}

export function normalizeCFOPErrorV1(error: unknown): CFOPV1Error {
  if (isCFOPV1Error(error)) {
    return new CFOPV1Error(error.code);
  }

  if (isSolverV1Error(error)) {
    if (error.code === "INVALID_CUBE_STATE" || error.code === "UNSOLVABLE_CUBE") {
      return new CFOPV1Error(error.code);
    }
  }

  return new CFOPV1Error("CFOP_UNAVAILABLE");
}

export function toCFOPErrorValueV1(error: unknown): CFOPErrorValueV1 {
  const normalized = normalizeCFOPErrorV1(error);

  return Object.freeze({
    code: normalized.code,
    message: PUBLIC_MESSAGES[normalized.code],
    stage: STAGES[normalized.code],
    retryable: RETRYABLE[normalized.code],
  });
}
