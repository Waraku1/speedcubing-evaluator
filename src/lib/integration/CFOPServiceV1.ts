import {
  CFOP_F2L_SLOTS_V1,
  CFOP_INPUT_MODE_V1,
  CFOP_SCHEMA_VERSION_V1,
  type CFOPF2LSlotV1,
  type CFOPPhaseNameV1,
  type CFOPPhaseResultV1,
  type CFOPRequestV1,
  type CFOPResultV1,
} from "../../types/cfop-v1";
import type { MoveV1 } from "../../types/solver-v1";
import {
  solveCFOPFromState,
  verifyStateSolveResult,
  type CFOPStateSolveResult,
  type PhaseResult,
} from "../cfop-solver/cfop-solver";
import { countHTM, countQTM } from "../cube/moves";
import { createCubeFaceletStateV1 } from "../cube/cubeStateV1";
import { CFOPV1Error, normalizeCFOPErrorV1 } from "./cfopErrorsV1";

export interface CFOPBackendV1Port {
  solve(facelets: string): CFOPStateSolveResult;
  verify(result: CFOPStateSolveResult): boolean;
}

export type CFOPServiceDependenciesV1 = Readonly<{
  backend?: CFOPBackendV1Port;
  now?: () => number;
}>;

export type CFOPServiceOptionsV1 = Readonly<{
  signal?: AbortSignal;
}>;

const DEFAULT_BACKEND: CFOPBackendV1Port = Object.freeze({
  solve: solveCFOPFromState,
  verify: verifyStateSolveResult,
});

function readonlyMoves(moves: readonly string[]): readonly MoveV1[] {
  return Object.freeze([...moves]) as readonly MoveV1[];
}

function phaseResult(
  phase: CFOPPhaseNameV1,
  result: PhaseResult
): CFOPPhaseResultV1 {
  return Object.freeze({
    phase,
    moves: readonlyMoves(result.moves),
    htm: result.htm,
    qtm: result.qtm,
    verified: true as const,
  });
}

function elapsed(startedAt: number, endedAt: number): number {
  const value = endedAt - startedAt;
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export class CFOPServiceV1 {
  private readonly backend: CFOPBackendV1Port;
  private readonly now: () => number;

  constructor(dependencies: CFOPServiceDependenciesV1 = {}) {
    this.backend = dependencies.backend ?? DEFAULT_BACKEND;
    this.now = dependencies.now ?? Date.now;
  }

  execute(
    request: CFOPRequestV1,
    options: CFOPServiceOptionsV1 = {}
  ): CFOPResultV1 {
    const startedAt = this.now();

    try {
      if (options.signal?.aborted) {
        throw new CFOPV1Error("CFOP_UNAVAILABLE");
      }

      const input = createCubeFaceletStateV1(request.cubeState.facelets);
      const solved = this.backend.solve(input.facelets);

      if (options.signal?.aborted) {
        throw new CFOPV1Error("CFOP_UNAVAILABLE");
      }

      let verified = false;
      try {
        verified = this.backend.verify(solved);
      } catch {
        throw new CFOPV1Error("CFOP_VERIFICATION_FAILED");
      }

      if (solved.inputState !== input.facelets || !verified) {
        throw new CFOPV1Error("CFOP_VERIFICATION_FAILED");
      }

      const cross = phaseResult("CROSS", solved.phases.cross);
      const oll = phaseResult("OLL", solved.phases.oll);
      const pll = phaseResult("PLL", solved.phases.pll);
      const slots = CFOP_F2L_SLOTS_V1.map((slot) => {
        const moves = solved.phases.f2l.slotMoves[slot];
        return Object.freeze({
          slot,
          moves: readonlyMoves(moves),
          htm: countHTM(moves),
          qtm: countQTM(moves),
        });
      });
      const f2l = Object.freeze({
        ...phaseResult("F2L", solved.phases.f2l),
        slots: Object.freeze(slots),
        solvedOrder: Object.freeze(
          [...solved.phases.f2l.solvedOrder]
        ) as readonly CFOPF2LSlotV1[],
      });

      return Object.freeze({
        schemaId: "CFOPSolutionV1" as const,
        schemaVersion: CFOP_SCHEMA_VERSION_V1,
        input: Object.freeze({
          stateId: input.stateId,
          format: input.format,
          inputMode: CFOP_INPUT_MODE_V1,
        }),
        method: Object.freeze({
          id: "CFOP" as const,
          version: "1.0" as const,
          orientation: "D_CROSS_U_LAST_LAYER" as const,
          historyUsage: "NONE" as const,
        }),
        phases: Object.freeze({ cross, f2l, oll, pll }),
        solution: Object.freeze({
          moves: readonlyMoves(solved.solution),
          htm: solved.totalHTM,
          qtm: solved.totalQTM,
          verified: true as const,
        }),
        timings: Object.freeze({
          durationMs: elapsed(startedAt, this.now()),
        }),
      });
    } catch (error) {
      throw normalizeCFOPErrorV1(error);
    }
  }
}

export const cfopServiceV1 = new CFOPServiceV1();
