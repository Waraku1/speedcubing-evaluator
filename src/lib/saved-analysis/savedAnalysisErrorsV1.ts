import type {
  SavedAnalysisErrorCodeV1,
  SavedAnalysisErrorValueV1,
} from "../../types/saved-analysis-v1";

const PUBLIC_ERRORS: Readonly<
  Record<
    SavedAnalysisErrorCodeV1,
    Readonly<{ message: string; retryable: boolean; status: number }>
  >
> = Object.freeze({
  UNAUTHORIZED: {
    message: "Sign in with GitHub to use saved analyses.",
    retryable: false,
    status: 401,
  },
  INVALID_REQUEST: {
    message: "The saved-analysis request is not valid.",
    retryable: false,
    status: 400,
  },
  INVALID_CUBE_STATE: {
    message: "The cube state is not a valid URFDLB facelet state.",
    retryable: false,
    status: 422,
  },
  UNSOLVABLE_CUBE: {
    message: "The cube state is physically unsolvable.",
    retryable: false,
    status: 422,
  },
  ANALYSIS_FAILED: {
    message: "The verified analysis could not be produced.",
    retryable: true,
    status: 503,
  },
  CFOP_FAILED: {
    message: "The optional verified CFOP analysis could not be produced.",
    retryable: true,
    status: 503,
  },
  NOT_FOUND: {
    message: "The saved analysis was not found.",
    retryable: false,
    status: 404,
  },
  STORAGE_UNAVAILABLE: {
    message: "Saved-analysis storage is temporarily unavailable.",
    retryable: true,
    status: 503,
  },
  INTERNAL_FAILURE: {
    message: "The saved-analysis request could not be completed.",
    retryable: true,
    status: 500,
  },
});

export class SavedAnalysisV1Error extends Error {
  readonly code: SavedAnalysisErrorCodeV1;

  constructor(code: SavedAnalysisErrorCodeV1) {
    super(code);
    this.name = "SavedAnalysisV1Error";
    this.code = code;
  }
}

export function isSavedAnalysisV1Error(
  error: unknown
): error is SavedAnalysisV1Error {
  return error instanceof SavedAnalysisV1Error;
}

export function normalizeSavedAnalysisErrorV1(
  error: unknown
): SavedAnalysisV1Error {
  return isSavedAnalysisV1Error(error)
    ? error
    : new SavedAnalysisV1Error("INTERNAL_FAILURE");
}

export function savedAnalysisHttpStatusV1(
  code: SavedAnalysisErrorCodeV1
): number {
  return PUBLIC_ERRORS[code].status;
}

export function savedAnalysisErrorValueV1(
  error: SavedAnalysisV1Error
): SavedAnalysisErrorValueV1 {
  const publicError = PUBLIC_ERRORS[error.code];
  return Object.freeze({
    code: error.code,
    message: publicError.message,
    retryable: publicError.retryable,
  });
}
