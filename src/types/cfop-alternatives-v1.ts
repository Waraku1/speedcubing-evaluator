import type {
  CFOPErrorValueV1,
  CFOPF2LSlotV1,
  CFOPPhaseResultV1,
} from "./cfop-v1";
import type { MoveV1 } from "./solver-v1";

export const CFOP_ALTERNATIVES_SCHEMA_VERSION_V1 = "1.0" as const;
export const CFOP_ALTERNATIVES_SCHEMA_ID_V1 = "CFOPAlternativesV1" as const;
export const CFOP_ALTERNATIVES_DEFAULT_LIMIT_V1 = 3;
export const CFOP_ALTERNATIVES_MAX_LIMIT_V1 = 4;

export const CFOP_ALTERNATIVE_STRATEGIES_V1 = [
  "DEFAULT",
  "CROSS_VARIANT",
  "F2L_FIRST_SLOT",
] as const;

export type CFOPAlternativeStrategyV1 =
  (typeof CFOP_ALTERNATIVE_STRATEGIES_V1)[number];

export type CFOPAlternativesRequestV1 = Readonly<{
  schemaVersion: typeof CFOP_ALTERNATIVES_SCHEMA_VERSION_V1;
  inputMode: "FACELET_STATE";
  cubeState: Readonly<{
    format: "URFDLB_FACELETS_V1";
    facelets: string;
  }>;
  maxAlternatives: number;
}>;

export type CFOPAlternativeF2LStageV1 = Readonly<{
  slot: CFOPF2LSlotV1;
  moves: readonly MoveV1[];
  macroIds: readonly string[];
  htm: number;
  qtm: number;
}>;

export type CFOPAlternativeV1 = Readonly<{
  ordinal: number;
  strategy: CFOPAlternativeStrategyV1;
  phases: Readonly<{
    cross: CFOPPhaseResultV1;
    f2l: CFOPPhaseResultV1 &
      Readonly<{
        solvedOrder: readonly CFOPF2LSlotV1[];
        stages: readonly CFOPAlternativeF2LStageV1[];
      }>;
    oll: CFOPPhaseResultV1 &
      Readonly<{
        caseId: string;
        algorithmIds: readonly string[];
      }>;
    pll: CFOPPhaseResultV1 &
      Readonly<{
        caseId: string;
        algorithmIds: readonly string[];
      }>;
  }>;
  solution: Readonly<{
    moves: readonly MoveV1[];
    htm: number;
    qtm: number;
    verified: true;
  }>;
}>;

export type CFOPAlternativesResultV1 = Readonly<{
  schemaId: typeof CFOP_ALTERNATIVES_SCHEMA_ID_V1;
  schemaVersion: typeof CFOP_ALTERNATIVES_SCHEMA_VERSION_V1;
  input: Readonly<{
    stateId: string;
    format: "URFDLB_FACELETS_V1";
    inputMode: "FACELET_STATE";
  }>;
  method: Readonly<{
    id: "CFOP";
    version: "1.0";
    orientation: "D_CROSS_U_LAST_LAYER";
    historyUsage: "NONE";
  }>;
  alternatives: readonly CFOPAlternativeV1[];
  generatedCount: number;
  requestedLimit: number;
  timings: Readonly<{
    durationMs: number;
  }>;
}>;

export type CFOPAlternativesApiErrorV1 = Readonly<{
  schemaVersion: typeof CFOP_ALTERNATIVES_SCHEMA_VERSION_V1;
  requestId: string;
  error: CFOPErrorValueV1;
}>;

export type CFOPAlternativesApiResponseV1 =
  | CFOPAlternativesResultV1
  | CFOPAlternativesApiErrorV1;
