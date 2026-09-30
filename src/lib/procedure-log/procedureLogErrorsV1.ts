import type {
  ProcedureLogErrorCodeV1,
  ProcedureLogErrorValueV1,
} from "../../types/procedure-log-v1";

const PUBLIC_ERRORS: Readonly<
  Record<
    ProcedureLogErrorCodeV1,
    Readonly<{ message: string; retryable: boolean; status: number }>
  >
> = Object.freeze({
  UNAUTHORIZED: {
    message: "Sign in with GitHub to use procedure logs.",
    retryable: false,
    status: 401,
  },
  INVALID_REQUEST: {
    message: "The procedure-log request is not valid.",
    retryable: false,
    status: 400,
  },
  INVALID_CUBE_STATE: {
    message: "The cube state is not a valid solvable URFDLB facelet state.",
    retryable: false,
    status: 422,
  },
  INVALID_MOVE_SEQUENCE: {
    message: "The procedure contains an invalid move sequence.",
    retryable: false,
    status: 422,
  },
  PROCEDURE_DOES_NOT_SOLVE: {
    message: "The procedure does not solve the supplied cube state.",
    retryable: false,
    status: 422,
  },
  NOT_FOUND: {
    message: "The procedure log was not found.",
    retryable: false,
    status: 404,
  },
  STORAGE_UNAVAILABLE: {
    message: "Procedure-log storage is temporarily unavailable.",
    retryable: true,
    status: 503,
  },
  INTERNAL_FAILURE: {
    message: "The procedure-log request could not be completed.",
    retryable: true,
    status: 500,
  },
});

export class ProcedureLogV1Error extends Error {
  readonly code: ProcedureLogErrorCodeV1;

  constructor(code: ProcedureLogErrorCodeV1) {
    super(code);
    this.name = "ProcedureLogV1Error";
    this.code = code;
  }
}

export function isProcedureLogV1Error(
  error: unknown,
): error is ProcedureLogV1Error {
  return error instanceof ProcedureLogV1Error;
}

export function normalizeProcedureLogErrorV1(
  error: unknown,
): ProcedureLogV1Error {
  return isProcedureLogV1Error(error)
    ? error
    : new ProcedureLogV1Error("INTERNAL_FAILURE");
}

export function procedureLogHttpStatusV1(
  code: ProcedureLogErrorCodeV1,
): number {
  return PUBLIC_ERRORS[code].status;
}

export function procedureLogErrorValueV1(
  error: ProcedureLogV1Error,
): ProcedureLogErrorValueV1 {
  const publicError = PUBLIC_ERRORS[error.code];
  return Object.freeze({
    code: error.code,
    message: publicError.message,
    retryable: publicError.retryable,
  });
}
