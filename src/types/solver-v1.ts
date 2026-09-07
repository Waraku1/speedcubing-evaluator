export const CUBE_FACELET_FORMAT_V1 = "URFDLB_FACELETS_V1" as const;

export const SOLVED_FACELETS_V1 =
  "UUUUUUUUU" +
  "RRRRRRRRR" +
  "FFFFFFFFF" +
  "DDDDDDDDD" +
  "LLLLLLLLL" +
  "BBBBBBBBB";

export const MOVE_V1_TOKENS = [
  "U",
  "U'",
  "U2",
  "R",
  "R'",
  "R2",
  "F",
  "F'",
  "F2",
  "D",
  "D'",
  "D2",
  "L",
  "L'",
  "L2",
  "B",
  "B'",
  "B2",
] as const;

export type MoveV1 = (typeof MOVE_V1_TOKENS)[number];

export type CubeFaceletStateV1 = {
  schemaId: "CubeFaceletStateV1";
  format: typeof CUBE_FACELET_FORMAT_V1;
  facelets: string;
  stateId: string;
};

export const SOLVER_ERROR_CODES_V1 = [
  "INVALID_CUBE_STATE",
  "UNSOLVABLE_CUBE",
  "SOLVER_UNAVAILABLE",
  "SOLVER_TIMEOUT",
  "SOLUTION_VERIFICATION_FAILED",
  "INTERNAL_FAILURE",
] as const;

export type SolverErrorCodeV1 =
  (typeof SOLVER_ERROR_CODES_V1)[number];

export type SolverErrorValueV1 = {
  code: SolverErrorCodeV1;
  message: string;
  retryable: boolean;
};

export type SolverEngineV1 = {
  id: "cubejs";
  version: "1.3.2";
  adapterVersion: "1.0";
};

export type SolverResultV1 = {
  solverRunId: string;
  inputStateId: string;
  engine: SolverEngineV1;
  moves: readonly MoveV1[];
  htm: number;
  qtm: number;
  verified: true;
  cache: {
    hit: boolean;
    keyVersion: "1";
  };
  durationMs: number;
};

export type SolverV1Options = {
  signal?: AbortSignal;
};
