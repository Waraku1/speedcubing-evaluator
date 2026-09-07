import type { SolverEngineV1 } from "../../types/solver-v1";
import {
  CubeJsWorkerPoolV1,
  type CubeJsWorkerPoolStatsV1,
} from "./cubeJsWorkerPoolV1";

export const CUBE_JS_ENGINE_V1: SolverEngineV1 = Object.freeze({
  id: "cubejs",
  version: "1.3.2",
  adapterVersion: "1.0",
});

export interface CubeSolverEngineV1Port {
  solve(facelets: string, signal?: AbortSignal): Promise<unknown>;
  close(): Promise<void>;
}

export class CubeJsSolverV1 implements CubeSolverEngineV1Port {
  constructor(
    private readonly workerPool = new CubeJsWorkerPoolV1()
  ) {}

  solve(facelets: string, signal?: AbortSignal): Promise<unknown> {
    return this.workerPool.solve(facelets, signal);
  }

  stats(): CubeJsWorkerPoolStatsV1 {
    return this.workerPool.stats();
  }

  close(): Promise<void> {
    return this.workerPool.close();
  }
}
