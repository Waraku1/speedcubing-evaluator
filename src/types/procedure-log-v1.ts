import type { MoveV1 } from "./solver-v1";

export const PROCEDURE_LOG_SCHEMA_VERSION_V1 = "1.0" as const;
export const PROCEDURE_LOG_DEFAULT_PAGE_SIZE_V1 = 20;
export const PROCEDURE_LOG_MAX_PAGE_SIZE_V1 = 50;
export const PROCEDURE_LOG_MAX_LABEL_CHARACTERS_V1 = 120;
export const PROCEDURE_LOG_MAX_MOVES_V1 = 512;

export type CreateProcedureLogRequestV1 = Readonly<{
  schemaVersion: typeof PROCEDURE_LOG_SCHEMA_VERSION_V1;
  cubeState: Readonly<{
    format: "URFDLB_FACELETS_V1";
    facelets: string;
  }>;
  moves: readonly MoveV1[];
  label?: string;
}>;

export type ProcedureLogV1 = Readonly<{
  id: string;
  schemaVersion: typeof PROCEDURE_LOG_SCHEMA_VERSION_V1;
  label?: string;
  cubeState: Readonly<{
    format: "URFDLB_FACELETS_V1";
    facelets: string;
    stateId: string;
  }>;
  moves: readonly MoveV1[];
  moveCount: number;
  htm: number;
  qtm: number;
  createdAt: string;
  updatedAt: string;
}>;

export type ProcedureLogListItemV1 = Readonly<{
  id: string;
  schemaVersion: typeof PROCEDURE_LOG_SCHEMA_VERSION_V1;
  label?: string;
  cubeState: Readonly<{
    format: "URFDLB_FACELETS_V1";
    stateId: string;
  }>;
  moveCount: number;
  htm: number;
  qtm: number;
  createdAt: string;
  updatedAt: string;
}>;

export type ProcedureLogListV1 = Readonly<{
  items: readonly ProcedureLogListItemV1[];
  nextCursor?: string;
}>;

export const PROCEDURE_LOG_ERROR_CODES_V1 = [
  "UNAUTHORIZED",
  "INVALID_REQUEST",
  "INVALID_CUBE_STATE",
  "INVALID_MOVE_SEQUENCE",
  "PROCEDURE_DOES_NOT_SOLVE",
  "NOT_FOUND",
  "STORAGE_UNAVAILABLE",
  "INTERNAL_FAILURE",
] as const;

export type ProcedureLogErrorCodeV1 =
  (typeof PROCEDURE_LOG_ERROR_CODES_V1)[number];

export type ProcedureLogErrorValueV1 = Readonly<{
  code: ProcedureLogErrorCodeV1;
  message: string;
  retryable: boolean;
}>;

export type ProcedureLogApiErrorV1 = Readonly<{
  schemaVersion: typeof PROCEDURE_LOG_SCHEMA_VERSION_V1;
  requestId: string;
  error: ProcedureLogErrorValueV1;
}>;

export type ProcedureLogCreateResponseV1 = Readonly<{
  schemaVersion: typeof PROCEDURE_LOG_SCHEMA_VERSION_V1;
  requestId: string;
  procedureLog: ProcedureLogV1;
}>;

export type ProcedureLogListResponseV1 = Readonly<{
  schemaVersion: typeof PROCEDURE_LOG_SCHEMA_VERSION_V1;
  requestId: string;
  list: ProcedureLogListV1;
}>;

export type ProcedureLogDetailResponseV1 = Readonly<{
  schemaVersion: typeof PROCEDURE_LOG_SCHEMA_VERSION_V1;
  requestId: string;
  procedureLog: ProcedureLogV1;
}>;

export type ProcedureLogDeleteResponseV1 = Readonly<{
  schemaVersion: typeof PROCEDURE_LOG_SCHEMA_VERSION_V1;
  requestId: string;
  deleted: true;
}>;
