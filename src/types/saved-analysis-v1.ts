import type { CFOPResultV1 } from "./cfop-v1";
import type { EvaluateResultV1 } from "./evaluate-v1";

export const SAVED_ANALYSIS_SCHEMA_VERSION_V1 = "1.0" as const;
export const SAVED_ANALYSIS_DEFAULT_PAGE_SIZE_V1 = 20;
export const SAVED_ANALYSIS_MAX_PAGE_SIZE_V1 = 50;
export const SAVED_ANALYSIS_MAX_LABEL_CHARACTERS_V1 = 120;

export type SaveAnalysisRequestV1 = Readonly<{
  schemaVersion: typeof SAVED_ANALYSIS_SCHEMA_VERSION_V1;
  cubeState: Readonly<{
    format: "URFDLB_FACELETS_V1";
    facelets: string;
  }>;
  includeCfop: boolean;
  label?: string;
}>;

export type SavedAnalysisV1 = Readonly<{
  id: string;
  schemaVersion: typeof SAVED_ANALYSIS_SCHEMA_VERSION_V1;
  label?: string;
  createdAt: string;
  updatedAt: string;
  cubeState: Readonly<{
    format: "URFDLB_FACELETS_V1";
    facelets: string;
    stateId: string;
  }>;
  analysis: Readonly<{
    schemaVersion: "1.0";
    result: EvaluateResultV1;
  }>;
  cfop?: Readonly<{
    schemaVersion: "1.0";
    result: CFOPResultV1;
  }>;
}>;

export type SavedAnalysisListItemV1 = Readonly<{
  id: string;
  schemaVersion: typeof SAVED_ANALYSIS_SCHEMA_VERSION_V1;
  label?: string;
  createdAt: string;
  updatedAt: string;
  cubeState: Readonly<{
    format: "URFDLB_FACELETS_V1";
    stateId: string;
  }>;
  hasCfop: boolean;
}>;

export type SavedAnalysisListV1 = Readonly<{
  items: readonly SavedAnalysisListItemV1[];
  nextCursor?: string;
}>;

export const SAVED_ANALYSIS_ERROR_CODES_V1 = [
  "UNAUTHORIZED",
  "INVALID_REQUEST",
  "INVALID_CUBE_STATE",
  "UNSOLVABLE_CUBE",
  "ANALYSIS_FAILED",
  "CFOP_FAILED",
  "NOT_FOUND",
  "STORAGE_UNAVAILABLE",
  "INTERNAL_FAILURE",
] as const;

export type SavedAnalysisErrorCodeV1 =
  (typeof SAVED_ANALYSIS_ERROR_CODES_V1)[number];

export type SavedAnalysisErrorValueV1 = Readonly<{
  code: SavedAnalysisErrorCodeV1;
  message: string;
  retryable: boolean;
}>;

export type SavedAnalysisApiErrorV1 = Readonly<{
  schemaVersion: typeof SAVED_ANALYSIS_SCHEMA_VERSION_V1;
  requestId: string;
  error: SavedAnalysisErrorValueV1;
}>;

export type SavedAnalysisCreateResponseV1 = Readonly<{
  schemaVersion: typeof SAVED_ANALYSIS_SCHEMA_VERSION_V1;
  requestId: string;
  savedAnalysis: SavedAnalysisV1;
}>;

export type SavedAnalysisListResponseV1 = Readonly<{
  schemaVersion: typeof SAVED_ANALYSIS_SCHEMA_VERSION_V1;
  requestId: string;
  list: SavedAnalysisListV1;
}>;

export type SavedAnalysisDetailResponseV1 = Readonly<{
  schemaVersion: typeof SAVED_ANALYSIS_SCHEMA_VERSION_V1;
  requestId: string;
  savedAnalysis: SavedAnalysisV1;
}>;

export type SavedAnalysisDeleteResponseV1 = Readonly<{
  schemaVersion: typeof SAVED_ANALYSIS_SCHEMA_VERSION_V1;
  requestId: string;
  deleted: true;
}>;
