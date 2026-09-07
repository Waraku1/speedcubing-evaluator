import {
  EVALUATE_ERROR_CODES_V1,
  type EvaluateErrorCodeV1,
  type EvaluateErrorValueV1,
} from "../../types/evaluate-v1";
import { isSolverV1Error } from "../solver/solverErrorsV1";

const PUBLIC_MESSAGES: Record<EvaluateErrorCodeV1, string> = {
  INVALID_REQUEST: "The request is invalid.",
  INVALID_CUBE_STATE: "The cube state representation is invalid.",
  PAYLOAD_TOO_LARGE: "The request payload is too large.",
  UNSUPPORTED_MEDIA_TYPE: "The request media type is unsupported.",
  METHOD_NOT_ALLOWED: "The request method is unsupported.",
  UNSOLVABLE_CUBE: "The cube state is not physically solvable.",
  SOLVER_UNAVAILABLE: "The solver service is currently unavailable.",
  SOLVER_TIMEOUT: "The solver deadline was exceeded.",
  SOLUTION_VERIFICATION_FAILED:
    "The solver result failed independent verification.",
  TRANSITION_FAILED: "The Transition trace could not be produced.",
  DEMAND_CONTRACT_FAILED:
    "The Domain Demand artifact failed its production contract.",
  INTERNAL_FAILURE: "The evaluation request could not be completed.",
};

const RETRYABLE: Record<EvaluateErrorCodeV1, boolean> = {
  INVALID_REQUEST: false,
  INVALID_CUBE_STATE: false,
  PAYLOAD_TOO_LARGE: false,
  UNSUPPORTED_MEDIA_TYPE: false,
  METHOD_NOT_ALLOWED: false,
  UNSOLVABLE_CUBE: false,
  SOLVER_UNAVAILABLE: true,
  SOLVER_TIMEOUT: true,
  SOLUTION_VERIFICATION_FAILED: false,
  TRANSITION_FAILED: false,
  DEMAND_CONTRACT_FAILED: false,
  INTERNAL_FAILURE: true,
};

export const EVALUATE_HTTP_STATUS_V1: Record<EvaluateErrorCodeV1, number> = {
  INVALID_REQUEST: 400,
  INVALID_CUBE_STATE: 400,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  METHOD_NOT_ALLOWED: 405,
  UNSOLVABLE_CUBE: 422,
  SOLVER_UNAVAILABLE: 503,
  SOLVER_TIMEOUT: 504,
  SOLUTION_VERIFICATION_FAILED: 500,
  TRANSITION_FAILED: 500,
  DEMAND_CONTRACT_FAILED: 500,
  INTERNAL_FAILURE: 500,
};

export class EvaluateV1Error extends Error {
  readonly code: EvaluateErrorCodeV1;

  constructor(code: EvaluateErrorCodeV1) {
    super(PUBLIC_MESSAGES[code]);
    this.name = "EvaluateV1Error";
    this.code = code;
    Object.setPrototypeOf(this, EvaluateV1Error.prototype);
  }
}

export function isEvaluateV1Error(value: unknown): value is EvaluateV1Error {
  if (
    typeof value !== "object" ||
    value === null ||
    !("code" in value)
  ) {
    return false;
  }

  return EVALUATE_ERROR_CODES_V1.some(
    (code) => code === (value as { code: unknown }).code
  );
}

export function evaluateErrorFromSolverV1(error: unknown): EvaluateV1Error {
  if (!isSolverV1Error(error)) {
    return new EvaluateV1Error("INTERNAL_FAILURE");
  }

  return new EvaluateV1Error(error.code);
}

export function normalizeEvaluateErrorV1(error: unknown): EvaluateV1Error {
  if (isEvaluateV1Error(error)) {
    return new EvaluateV1Error(error.code);
  }

  if (isSolverV1Error(error)) {
    return evaluateErrorFromSolverV1(error);
  }

  return new EvaluateV1Error("INTERNAL_FAILURE");
}

export function toEvaluateErrorValueV1(
  error: unknown
): EvaluateErrorValueV1 {
  const normalized = normalizeEvaluateErrorV1(error);

  return Object.freeze({
    code: normalized.code,
    message: PUBLIC_MESSAGES[normalized.code],
    retryable: RETRYABLE[normalized.code],
  });
}
