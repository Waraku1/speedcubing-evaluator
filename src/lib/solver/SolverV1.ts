import {
  SOLVED_FACELETS_V1,
  type CubeFaceletStateV1,
  type SolverResultV1,
  type SolverV1Options,
} from "../../types/solver-v1";
import { parseCubeFaceletStateV1 } from "../cube/cubeStateV1";
import {
  CUBE_JS_ENGINE_V1,
  CubeJsSolverV1,
  type CubeSolverEngineV1Port,
} from "./cubeJsSolverV1";
import {
  SolverCacheV1,
  type CachedVerifiedSolutionV1,
  type SolverCacheV1Port,
} from "./solverCacheV1";
import { normalizeSolverError, SolverV1Error } from "./solverErrorsV1";
import { sha256V1 } from "./solverIdentityV1";
import {
  verifySolutionV1,
  type VerifiedSolutionV1,
} from "./solutionVerifierV1";

const CACHE_KEY_VERSION = "1" as const;
const SOLVER_CONFIGURATION_V1 =
  "node-worker:max=2;queue=8;deadlineMs=8000;cache=500;ttlMs=1800000";

export type SolverV1Dependencies = {
  engine?: CubeSolverEngineV1Port;
  cache?: SolverCacheV1Port;
  now?: () => number;
};

function cacheKey(input: CubeFaceletStateV1): string {
  return sha256V1(
    [
      CACHE_KEY_VERSION,
      input.format,
      input.facelets,
      CUBE_JS_ENGINE_V1.id,
      CUBE_JS_ENGINE_V1.version,
      CUBE_JS_ENGINE_V1.adapterVersion,
      SOLVER_CONFIGURATION_V1,
    ].join("|")
  );
}

function solverRunId(
  input: CubeFaceletStateV1,
  verified: VerifiedSolutionV1
): string {
  return sha256V1(
    [
      input.stateId,
      CUBE_JS_ENGINE_V1.id,
      CUBE_JS_ENGINE_V1.version,
      CUBE_JS_ENGINE_V1.adapterVersion,
      SOLVER_CONFIGURATION_V1,
      verified.moves.join(" "),
      verified.htm,
      verified.qtm,
    ].join("|")
  );
}

function duration(start: number, end: number): number {
  const elapsed = end - start;
  return Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
}

function resultFrom(
  input: CubeFaceletStateV1,
  verified: VerifiedSolutionV1,
  cacheHit: boolean,
  durationMs: number
): SolverResultV1 {
  return Object.freeze({
    solverRunId: solverRunId(input, verified),
    inputStateId: input.stateId,
    engine: CUBE_JS_ENGINE_V1,
    moves: Object.freeze([...verified.moves]),
    htm: verified.htm,
    qtm: verified.qtm,
    verified: true as const,
    cache: Object.freeze({
      hit: cacheHit,
      keyVersion: CACHE_KEY_VERSION,
    }),
    durationMs,
  });
}

function cacheValue(
  verified: VerifiedSolutionV1
): CachedVerifiedSolutionV1 {
  return Object.freeze({
    moves: Object.freeze([...verified.moves]),
    htm: verified.htm,
    qtm: verified.qtm,
    verified: true as const,
  });
}

export class SolverV1 {
  private readonly engine: CubeSolverEngineV1Port;
  private readonly cache: SolverCacheV1Port;
  private readonly now: () => number;

  constructor(dependencies: SolverV1Dependencies = {}) {
    this.engine = dependencies.engine ?? new CubeJsSolverV1();
    this.cache = dependencies.cache ?? new SolverCacheV1();
    this.now = dependencies.now ?? Date.now;
  }

  async solve(
    governedInput: CubeFaceletStateV1,
    options: SolverV1Options = {}
  ): Promise<SolverResultV1> {
    try {
      return await this.solveGoverned(governedInput, options);
    } catch (error) {
      throw normalizeSolverError(error);
    }
  }

  private async solveGoverned(
    governedInput: CubeFaceletStateV1,
    options: SolverV1Options
  ): Promise<SolverResultV1> {
    const startedAt = this.now();
    const input = parseCubeFaceletStateV1(governedInput);

    if (options.signal?.aborted) {
      throw new SolverV1Error("SOLVER_UNAVAILABLE");
    }

    const key = cacheKey(input);
    const cached = this.cache.get(key);

    if (cached) {
      try {
        const reverified = verifySolutionV1(input, cached.moves);

        if (
          !cached.verified ||
          reverified.htm !== cached.htm ||
          reverified.qtm !== cached.qtm
        ) {
          throw new SolverV1Error("SOLUTION_VERIFICATION_FAILED");
        }

        return resultFrom(
          input,
          reverified,
          true,
          duration(startedAt, this.now())
        );
      } catch {
        this.cache.delete(key);
      }
    }

    let untrustedSolution: unknown;

    if (input.facelets === SOLVED_FACELETS_V1) {
      untrustedSolution = [];
    } else {
      untrustedSolution = await this.engine.solve(
        input.facelets,
        options.signal
      );
    }

    const verified = verifySolutionV1(input, untrustedSolution);
    this.cache.set(key, cacheValue(verified));

    return resultFrom(
      input,
      verified,
      false,
      duration(startedAt, this.now())
    );
  }

  close(): Promise<void> {
    return this.engine.close();
  }
}

export const solverV1 = new SolverV1();
