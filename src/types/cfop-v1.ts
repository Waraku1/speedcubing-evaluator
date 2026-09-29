import type { MoveV1 } from "./solver-v1";

export const CFOP_SCHEMA_VERSION_V1 = "1.0" as const;
export const CFOP_INPUT_MODE_V1 = "FACELET_STATE" as const;

export type CFOPRequestV1 = Readonly<{
  schemaVersion: typeof CFOP_SCHEMA_VERSION_V1;
  inputMode: typeof CFOP_INPUT_MODE_V1;
  cubeState: Readonly<{
    format: "URFDLB_FACELETS_V1";
    facelets: string;
  }>;
}>;

export type CFOPPhaseNameV1 = "CROSS" | "F2L" | "OLL" | "PLL";

export type CFOPPhaseResultV1 = Readonly<{
  phase: CFOPPhaseNameV1;
  moves: readonly MoveV1[];
  htm: number;
  qtm: number;
  verified: true;
}>;

export const CFOP_F2L_SLOTS_V1 = ["FR", "FL", "BR", "BL"] as const;
export type CFOPF2LSlotV1 = (typeof CFOP_F2L_SLOTS_V1)[number];

export type CFOPF2LSlotResultV1 = Readonly<{
  slot: CFOPF2LSlotV1;
  moves: readonly MoveV1[];
  htm: number;
  qtm: number;
}>;

export type CFOPResultV1 = Readonly<{
  schemaId: "CFOPSolutionV1";
  schemaVersion: typeof CFOP_SCHEMA_VERSION_V1;
  input: Readonly<{
    stateId: string;
    format: "URFDLB_FACELETS_V1";
    inputMode: typeof CFOP_INPUT_MODE_V1;
  }>;
  method: Readonly<{
    id: "CFOP";
    version: "1.0";
    orientation: "D_CROSS_U_LAST_LAYER";
    historyUsage: "NONE";
  }>;
  phases: Readonly<{
    cross: CFOPPhaseResultV1;
    f2l: CFOPPhaseResultV1 &
      Readonly<{
        slots: readonly CFOPF2LSlotResultV1[];
        solvedOrder: readonly CFOPF2LSlotV1[];
      }>;
    oll: CFOPPhaseResultV1;
    pll: CFOPPhaseResultV1;
  }>;
  solution: Readonly<{
    moves: readonly MoveV1[];
    htm: number;
    qtm: number;
    verified: true;
  }>;
  timings: Readonly<{
    durationMs: number;
  }>;
}>;

export const CFOP_ERROR_CODES_V1 = [
  "INVALID_JSON",
  "REQUEST_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "METHOD_NOT_ALLOWED",
  "UNSUPPORTED_INPUT_MODE",
  "INVALID_CUBE_STATE",
  "UNSOLVABLE_CUBE",
  "CFOP_UNAVAILABLE",
  "CFOP_VERIFICATION_FAILED",
  "INTERNAL_FAILURE",
] as const;

export type CFOPErrorCodeV1 = (typeof CFOP_ERROR_CODES_V1)[number];

export type CFOPErrorStageV1 =
  | "REQUEST"
  | "VALIDATION"
  | "CFOP"
  | "VERIFICATION"
  | "INTERNAL";

export type CFOPErrorValueV1 = Readonly<{
  code: CFOPErrorCodeV1;
  message: string;
  stage: CFOPErrorStageV1;
  retryable: boolean;
}>;

export type CFOPApiSuccessV1 = Readonly<{
  schemaVersion: typeof CFOP_SCHEMA_VERSION_V1;
  requestId: string;
  result: CFOPResultV1;
}>;

export type CFOPApiErrorV1 = Readonly<{
  schemaVersion: typeof CFOP_SCHEMA_VERSION_V1;
  requestId: string;
  error: CFOPErrorValueV1;
}>;

export type CFOPApiResponseV1 = CFOPApiSuccessV1 | CFOPApiErrorV1;
