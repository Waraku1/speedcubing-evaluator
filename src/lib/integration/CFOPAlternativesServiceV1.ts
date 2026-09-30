import {
  CFOP_ALTERNATIVES_SCHEMA_ID_V1,
  CFOP_ALTERNATIVES_SCHEMA_VERSION_V1,
  type CFOPAlternativeV1,
  type CFOPAlternativesRequestV1,
  type CFOPAlternativesResultV1,
} from "../../types/cfop-alternatives-v1";
import type { CFOPPhaseNameV1, CFOPPhaseResultV1 } from "../../types/cfop-v1";
import type { MoveV1 } from "../../types/solver-v1";
import {
  solveCFOPAlternativesFromState,
  verifyStateSolveResult,
  type CFOPStateAlternativeResult,
  type CFOPStateSolveResult,
  type PhaseResult,
} from "../cfop-solver/cfop-solver";
import { applyMoves, countHTM, countQTM, SOLVED_STATE } from "../cube/moves";
import { createCubeFaceletStateV1 } from "../cube/cubeStateV1";
import { CFOPV1Error, normalizeCFOPErrorV1 } from "./cfopErrorsV1";

export interface CFOPAlternativesBackendV1Port {
  solve(
    facelets: string,
    limit: number,
  ): readonly CFOPStateAlternativeResult[];
  verify(result: CFOPStateSolveResult): boolean;
}

export type CFOPAlternativesServiceDependenciesV1 = Readonly<{
  backend?: CFOPAlternativesBackendV1Port;
  now?: () => number;
}>;

export type CFOPAlternativesServiceOptionsV1 = Readonly<{
  signal?: AbortSignal;
}>;

const DEFAULT_BACKEND: CFOPAlternativesBackendV1Port = Object.freeze({
  solve: solveCFOPAlternativesFromState,
  verify: verifyStateSolveResult,
});

function readonlyMoves(moves: readonly string[]): readonly MoveV1[] {
  return Object.freeze([...moves]) as readonly MoveV1[];
}

function phaseResult(
  phase: CFOPPhaseNameV1,
  result: PhaseResult,
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

function publicAlternative(
  candidate: CFOPStateAlternativeResult,
  ordinal: number,
): CFOPAlternativeV1 {
  const solved = candidate.result;
  const f2lStages = solved.f2l.stages.map((stage) => Object.freeze({
    slot: stage.slot,
    moves: readonlyMoves(stage.moves),
    macroIds: Object.freeze([...stage.macroIds]),
    htm: countHTM(stage.moves),
    qtm: countQTM(stage.moves),
  }));

  return Object.freeze({
    ordinal,
    strategy: candidate.strategy,
    phases: Object.freeze({
      cross: phaseResult("CROSS", solved.phases.cross),
      f2l: Object.freeze({
        ...phaseResult("F2L", solved.phases.f2l),
        solvedOrder: Object.freeze([...solved.f2l.solvedOrder]),
        stages: Object.freeze(f2lStages),
      }),
      oll: Object.freeze({
        ...phaseResult("OLL", solved.phases.oll),
        caseId: solved.oll.caseId,
        algorithmIds: Object.freeze([...solved.oll.algorithmIds]),
      }),
      pll: Object.freeze({
        ...phaseResult("PLL", solved.phases.pll),
        caseId: solved.pll.caseId,
        algorithmIds: Object.freeze([...solved.pll.algorithmIds]),
      }),
    }),
    solution: Object.freeze({
      moves: readonlyMoves(solved.solution),
      htm: solved.totalHTM,
      qtm: solved.totalQTM,
      verified: true as const,
    }),
  });
}

export class CFOPAlternativesServiceV1 {
  private readonly backend: CFOPAlternativesBackendV1Port;
  private readonly now: () => number;

  constructor(dependencies: CFOPAlternativesServiceDependenciesV1 = {}) {
    this.backend = dependencies.backend ?? DEFAULT_BACKEND;
    this.now = dependencies.now ?? Date.now;
  }

  execute(
    request: CFOPAlternativesRequestV1,
    options: CFOPAlternativesServiceOptionsV1 = {},
  ): CFOPAlternativesResultV1 {
    const startedAt = this.now();

    try {
      if (options.signal?.aborted) {
        throw new CFOPV1Error("CFOP_UNAVAILABLE");
      }

      const input = createCubeFaceletStateV1(request.cubeState.facelets);
      const solvedCandidates = this.backend.solve(
        input.facelets,
        request.maxAlternatives,
      );

      if (options.signal?.aborted) {
        throw new CFOPV1Error("CFOP_UNAVAILABLE");
      }
      if (solvedCandidates.length === 0) {
        throw new CFOPV1Error("CFOP_VERIFICATION_FAILED");
      }

      const alternatives: CFOPAlternativeV1[] = [];
      const solutionKeys = new Set<string>();

      for (let index = 0; index < solvedCandidates.length; index++) {
        if (alternatives.length >= request.maxAlternatives) break;
        const candidate = solvedCandidates[index];
        let verified = false;
        try {
          verified =
            candidate.result.inputState === input.facelets &&
            this.backend.verify(candidate.result) &&
            applyMoves(input.facelets, candidate.result.solution) === SOLVED_STATE;
        } catch {
          verified = false;
        }

        if (!verified) {
          if (index === 0) {
            throw new CFOPV1Error("CFOP_VERIFICATION_FAILED");
          }
          continue;
        }

        const key = candidate.result.solution.join(" ");
        if (solutionKeys.has(key)) continue;
        solutionKeys.add(key);
        alternatives.push(publicAlternative(candidate, alternatives.length + 1));
      }

      if (alternatives.length === 0 || alternatives[0].strategy !== "DEFAULT") {
        throw new CFOPV1Error("CFOP_VERIFICATION_FAILED");
      }

      return Object.freeze({
        schemaId: CFOP_ALTERNATIVES_SCHEMA_ID_V1,
        schemaVersion: CFOP_ALTERNATIVES_SCHEMA_VERSION_V1,
        input: Object.freeze({
          stateId: input.stateId,
          format: input.format,
          inputMode: "FACELET_STATE" as const,
        }),
        method: Object.freeze({
          id: "CFOP" as const,
          version: "1.0" as const,
          orientation: "D_CROSS_U_LAST_LAYER" as const,
          historyUsage: "NONE" as const,
        }),
        alternatives: Object.freeze(alternatives),
        generatedCount: alternatives.length,
        requestedLimit: request.maxAlternatives,
        timings: Object.freeze({
          durationMs: elapsed(startedAt, this.now()),
        }),
      });
    } catch (error) {
      throw normalizeCFOPErrorV1(error);
    }
  }
}

export const cfopAlternativesServiceV1 = new CFOPAlternativesServiceV1();
