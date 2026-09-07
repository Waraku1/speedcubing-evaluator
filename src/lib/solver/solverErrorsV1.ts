import {
  SOLVER_ERROR_CODES_V1,
  type SolverErrorCodeV1,
  type SolverErrorValueV1,
} from "../../types/solver-v1";

const PUBLIC_MESSAGES: Record<SolverErrorCodeV1, string> = {
  INVALID_CUBE_STATE: "The cube state representation is invalid.",
  UNSOLVABLE_CUBE: "The cube state is not physically solvable.",
  SOLVER_UNAVAILABLE: "The solver is currently unavailable.",
  SOLVER_TIMEOUT: "The solver deadline was exceeded.",
  SOLUTION_VERIFICATION_FAILED:
    "The generated solution failed independent verification.",
  INTERNAL_FAILURE: "The solver could not complete the request.",
};

const RETRYABLE: Record<SolverErrorCodeV1, boolean> = {
  INVALID_CUBE_STATE: false,
  UNSOLVABLE_CUBE: false,
  SOLVER_UNAVAILABLE: true,
  SOLVER_TIMEOUT: true,
  SOLUTION_VERIFICATION_FAILED: false,
  INTERNAL_FAILURE: true,
};

export class SolverV1Error extends Error {
  readonly code: SolverErrorCodeV1;

  constructor(code: SolverErrorCodeV1) {
    super(PUBLIC_MESSAGES[code]);
    this.name = "SolverV1Error";
    this.code = code;
    Object.setPrototypeOf(this, SolverV1Error.prototype);
  }
}

export function isSolverV1Error(value: unknown): value is SolverV1Error {
  if (
    typeof value !== "object" ||
    value === null ||
    !("code" in value)
  ) {
    return false;
  }

  return SOLVER_ERROR_CODES_V1.some(
    (code) => code === (value as { code: unknown }).code
  );
}

export function toSolverErrorValueV1(error: unknown): SolverErrorValueV1 {
  const code = isSolverV1Error(error) ? error.code : "INTERNAL_FAILURE";

  return Object.freeze({
    code,
    message: PUBLIC_MESSAGES[code],
    retryable: RETRYABLE[code],
  });
}

export function normalizeSolverError(error: unknown): SolverV1Error {
  return isSolverV1Error(error)
    ? new SolverV1Error(error.code)
    : new SolverV1Error("INTERNAL_FAILURE");
}
