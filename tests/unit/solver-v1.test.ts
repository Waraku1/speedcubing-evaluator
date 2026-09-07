import { readFileSync } from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";

import { describe, expect, it, vi } from "vitest";

import {
  applyMoves,
  invertMoves,
} from "../../src/lib/cube/moves";
import {
  createCubeFaceletStateV1,
  parseCubeFaceletStateV1,
} from "../../src/lib/cube/cubeStateV1";
import { SolverV1 } from "../../src/lib/solver/SolverV1";
import {
  CubeJsSolverV1,
  type CubeSolverEngineV1Port,
} from "../../src/lib/solver/cubeJsSolverV1";
import {
  CubeJsWorkerPoolV1,
  type CubeJsWorkerFactoryV1,
} from "../../src/lib/solver/cubeJsWorkerPoolV1";
import {
  type CachedVerifiedSolutionV1,
  SolverCacheV1,
  type SolverCacheV1Port,
} from "../../src/lib/solver/solverCacheV1";
import {
  SolverV1Error,
  toSolverErrorValueV1,
} from "../../src/lib/solver/solverErrorsV1";
import { verifySolutionV1 } from "../../src/lib/solver/solutionVerifierV1";
import {
  CUBE_FACELET_FORMAT_V1,
  MOVE_V1_TOKENS,
  SOLVED_FACELETS_V1,
  type CubeFaceletStateV1,
  type MoveV1,
  type SolverErrorCodeV1,
} from "../../src/types/solver-v1";

const TEST_WORKER_PREFIX = String.raw`
"use strict";
const { parentPort } = require("node:worker_threads");
parentPort.postMessage({ type: "READY" });
`;

function swap(facelets: string, left: number, right: number): string {
  const result = facelets.split("");
  [result[left], result[right]] = [result[right], result[left]];
  return result.join("");
}

function rotateThree(
  facelets: string,
  first: number,
  second: number,
  third: number
): string {
  const result = facelets.split("");
  [result[first], result[second], result[third]] = [
    result[second],
    result[third],
    result[first],
  ];
  return result.join("");
}

function fixedSeedScrambles(count: number): MoveV1[][] {
  let seed = 0x51f15e;
  const results: MoveV1[][] = [];

  for (let stateIndex = 0; stateIndex < count; stateIndex += 1) {
    const moves: MoveV1[] = [];
    let previousFace = "";

    while (moves.length < 18) {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      const candidate = MOVE_V1_TOKENS[seed % MOVE_V1_TOKENS.length];

      if (candidate[0] === previousFace) {
        continue;
      }

      moves.push(candidate);
      previousFace = candidate[0];
    }

    results.push(moves);
  }

  return results;
}

function fakeEngine(solution: unknown): CubeSolverEngineV1Port {
  return {
    solve: vi.fn(async () => solution),
    close: vi.fn(async () => undefined),
  };
}

async function expectSolverCode(
  promise: Promise<unknown>,
  code: SolverErrorCodeV1
): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for worker state");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function replyingWorkerFactory(
  delayMs: number,
  solution = ""
): CubeJsWorkerFactoryV1 {
  const source = `${TEST_WORKER_PREFIX}
parentPort.on("message", (request) => {
  setTimeout(() => parentPort.postMessage({
    type: "SOLVED",
    jobId: request.jobId,
    solution: ${JSON.stringify(solution)},
  }), ${delayMs});
});`;

  return () => new Worker(source, { eval: true });
}

function neverReplyingWorkerFactory(): CubeJsWorkerFactoryV1 {
  const source = `${TEST_WORKER_PREFIX}
parentPort.on("message", () => undefined);`;
  return () => new Worker(source, { eval: true });
}

describe("Production SolverV1", () => {
  it("SV-01 returns and independently verifies [] for solved input", async () => {
    const engine = fakeEngine("must not execute");
    const solver = new SolverV1({ engine });
    const state = createCubeFaceletStateV1(SOLVED_FACELETS_V1);
    const result = await solver.solve(state);

    expect(result).toMatchObject({
      inputStateId: state.stateId,
      engine: {
        id: "cubejs",
        version: "1.3.2",
        adapterVersion: "1.0",
      },
      moves: [],
      htm: 0,
      qtm: 0,
      verified: true,
      cache: { hit: false, keyVersion: "1" },
    });
    expect(engine.solve).not.toHaveBeenCalled();
    expect(verifySolutionV1(state, result.moves).verified).toBe(true);
    await solver.close();
  });

  it(
    "SV-02 solves and independently verifies 100 fixed-seed legal states",
    async () => {
      const scrambles = fixedSeedScrambles(100);
      const faceletStates = scrambles.map((moves) =>
        applyMoves(SOLVED_FACELETS_V1, moves)
      );

      expect(new Set(faceletStates).size).toBe(100);

      const states = faceletStates.map(createCubeFaceletStateV1);
      const solver = new SolverV1();

      try {
        for (const state of states) {
          const result = await solver.solve(state);

          expect(result.verified).toBe(true);
          expect(applyMoves(state.facelets, result.moves)).toBe(
            SOLVED_FACELETS_V1
          );
          expect(result.htm).toBe(result.moves.length);
          expect(result.qtm).toBe(
            result.moves.reduce(
              (sum, move) => sum + (move.endsWith("2") ? 2 : 1),
              0
            )
          );
        }
      } finally {
        await solver.close();
      }
    },
    120_000
  );

  it("SV-03 maps schema/count/center failures to INVALID_CUBE_STATE", async () => {
    const engine = fakeEngine("");
    const solver = new SolverV1({ engine });
    const valid = createCubeFaceletStateV1(SOLVED_FACELETS_V1);
    const invalidInputs: CubeFaceletStateV1[] = [
      { ...valid, schemaId: "wrong" as "CubeFaceletStateV1" },
      { ...valid, format: "wrong" as typeof CUBE_FACELET_FORMAT_V1 },
      { ...valid, facelets: valid.facelets.slice(1) },
      { ...valid, facelets: `X${valid.facelets.slice(1)}` },
      { ...valid, facelets: `R${valid.facelets.slice(1)}` },
      { ...valid, facelets: swap(valid.facelets, 4, 13) },
      { ...valid, stateId: "tampered" },
    ];

    for (const input of invalidInputs) {
      await expectSolverCode(solver.solve(input), "INVALID_CUBE_STATE");
    }

    expect(engine.solve).not.toHaveBeenCalled();
    expect(() => parseCubeFaceletStateV1({})).toThrowError(
      expect.objectContaining({ code: "INVALID_CUBE_STATE" })
    );
    await solver.close();
  });

  it("SV-03 maps cubie/orientation/parity failures to UNSOLVABLE_CUBE", () => {
    const cubieFailure = swap(SOLVED_FACELETS_V1, 9, 18);
    const cornerTwist = rotateThree(SOLVED_FACELETS_V1, 8, 9, 20);
    const edgeFlip = swap(SOLVED_FACELETS_V1, 5, 10);
    const parityMismatch = swap(SOLVED_FACELETS_V1, 10, 19);

    for (const facelets of [
      cubieFailure,
      cornerTwist,
      edgeFlip,
      parityMismatch,
    ]) {
      expect(() => createCubeFaceletStateV1(facelets)).toThrowError(
        expect.objectContaining({ code: "UNSOLVABLE_CUBE" })
      );
    }
  });

  it(
    "SV-04 returns identical semantic results across three cache and cold runs",
    async () => {
      const scramble = fixedSeedScrambles(1)[0];
      const state = createCubeFaceletStateV1(
        applyMoves(SOLVED_FACELETS_V1, scramble)
      );
      const warmSolver = new SolverV1();
      const coldSolver = new SolverV1();

      try {
        const first = await warmSolver.solve(state);
        const second = await warmSolver.solve(state);
        const third = await warmSolver.solve(state);
        const cold = await coldSolver.solve(state);

        for (const result of [second, third, cold]) {
          expect(result.moves).toEqual(first.moves);
          expect(result.htm).toBe(first.htm);
          expect(result.qtm).toBe(first.qtm);
          expect(result.solverRunId).toBe(first.solverRunId);
          expect(result.inputStateId).toBe(first.inputStateId);
        }
        expect([first.cache.hit, second.cache.hit, third.cache.hit]).toEqual([
          false,
          true,
          true,
        ]);
        expect(cold.cache.hit).toBe(false);
      } finally {
        await warmSolver.close();
        await coldSolver.close();
      }
    },
    30_000
  );

  it("SV-05 rejects bad tokens and plausible wrong solutions", () => {
    const state = createCubeFaceletStateV1(
      applyMoves(SOLVED_FACELETS_V1, ["R"])
    );

    expect(() => verifySolutionV1(state, ["Rw"])).toThrowError(
      expect.objectContaining({ code: "SOLUTION_VERIFICATION_FAILED" })
    );
    expect(() => verifySolutionV1(state, ["U"])).toThrowError(
      expect.objectContaining({ code: "SOLUTION_VERIFICATION_FAILED" })
    );
  });

  it("SV-05 evicts a tampered cache entry and independently recomputes", async () => {
    const state = createCubeFaceletStateV1(
      applyMoves(SOLVED_FACELETS_V1, ["R"])
    );
    const correctMoves = invertMoves(["R"]);
    let deleted = false;
    const stored: CachedVerifiedSolutionV1[] = [];
    const cache: SolverCacheV1Port = {
      get: () => ({
        moves: ["U"],
        htm: 1,
        qtm: 1,
        verified: true,
      }),
      set: (_key, value) => {
        stored.push(value);
      },
      delete: () => {
        deleted = true;
        return true;
      },
      clear: () => undefined,
    };
    const engine = fakeEngine(correctMoves);
    const solver = new SolverV1({ cache, engine });
    const result = await solver.solve(state);

    expect(deleted).toBe(true);
    expect(engine.solve).toHaveBeenCalledOnce();
    expect(result.moves).toEqual(correctMoves);
    expect(result.verified).toBe(true);
    expect(stored[0]?.moves).toEqual(correctMoves);
    await solver.close();
  });

  it("SV-06 is lazy, caps concurrency at two, bounds its queue, and cancels queued work", async () => {
    let workersCreated = 0;
    const baseFactory = replyingWorkerFactory(100);
    const pool = new CubeJsWorkerPoolV1({
      maxWorkers: 2,
      maxQueueLength: 2,
      deadlineMs: 1_000,
      workerFactory: () => {
        workersCreated += 1;
        return baseFactory();
      },
    });

    expect(pool.stats().workers).toBe(0);

    const first = pool.solve("first");
    const second = pool.solve("second");
    await waitFor(() => pool.stats().activeJobs === 2);

    const third = pool.solve("third");
    const controller = new AbortController();
    const cancelled = pool.solve("cancelled", controller.signal);
    const overflow = pool.solve("overflow");

    expect(pool.stats()).toMatchObject({
      workers: 2,
      activeJobs: 2,
      queuedJobs: 2,
    });
    expect(workersCreated).toBe(2);
    await expectSolverCode(overflow, "SOLVER_UNAVAILABLE");

    controller.abort();
    await expectSolverCode(cancelled, "SOLVER_UNAVAILABLE");
    expect(pool.stats().queuedJobs).toBe(1);

    await Promise.all([first, second, third]);
    expect(pool.stats().workers).toBeLessThanOrEqual(2);
    await pool.close();
  });

  it("SV-06 terminates and replaces a running worker on abort and timeout", async () => {
    const abortPool = new CubeJsWorkerPoolV1({
      maxWorkers: 1,
      deadlineMs: 500,
      workerFactory: neverReplyingWorkerFactory(),
    });
    const controller = new AbortController();
    const aborted = abortPool.solve("abort-running", controller.signal);

    await waitFor(() => abortPool.stats().activeJobs === 1);
    controller.abort();
    await expectSolverCode(aborted, "SOLVER_UNAVAILABLE");
    await waitFor(() => abortPool.stats().workerReplacements === 1);
    await abortPool.close();

    const timeoutPool = new CubeJsWorkerPoolV1({
      maxWorkers: 1,
      deadlineMs: 30,
      workerFactory: neverReplyingWorkerFactory(),
    });

    await expectSolverCode(timeoutPool.solve("timeout"), "SOLVER_TIMEOUT");
    await waitFor(() => timeoutPool.stats().workerReplacements === 1);
    await timeoutPool.close();
  });

  it("SV-06 replaces a crashed worker and serves the next job", async () => {
    const crashSource = `${TEST_WORKER_PREFIX}
parentPort.on("message", () => process.exit(1));`;
    const healthyFactory = replyingWorkerFactory(0, "U");
    let factoryCalls = 0;
    const pool = new CubeJsWorkerPoolV1({
      maxWorkers: 1,
      deadlineMs: 500,
      workerFactory: () => {
        factoryCalls += 1;
        return factoryCalls === 1
          ? new Worker(crashSource, { eval: true })
          : healthyFactory();
      },
    });

    await expectSolverCode(pool.solve("crash"), "SOLVER_UNAVAILABLE");
    await waitFor(
      () =>
        pool.stats().workerReplacements === 1 &&
        pool.stats().readyWorkers === 1
    );
    await expect(pool.solve("after-crash")).resolves.toBe("U");
    expect(factoryCalls).toBe(2);
    await pool.close();
  });

  it("SV-06 enforces verified-cache capacity, TTL, and immutable copies", () => {
    let now = 1_000;
    const cache = new SolverCacheV1(() => now);
    const value: CachedVerifiedSolutionV1 = {
      moves: ["R"],
      htm: 1,
      qtm: 1,
      verified: true,
    };

    for (let index = 0; index <= SolverCacheV1.MAX_ENTRIES; index += 1) {
      cache.set(`key-${index}`, value);
    }

    expect(cache.size).toBe(500);
    expect(cache.get("key-0")).toBeNull();
    expect(Object.isFrozen(cache.get("key-500"))).toBe(true);
    expect(Object.isFrozen(cache.get("key-500")?.moves)).toBe(true);

    now += SolverCacheV1.TTL_MS;
    expect(cache.get("key-500")).toBeNull();
  });

  it(
    "SV-07 starts the real cubejs 1.3.2 Node worker path",
    async () => {
      const engine = new CubeJsSolverV1();
      const scramble: MoveV1[] = ["R", "U", "R'", "U'"];
      const state = createCubeFaceletStateV1(
        applyMoves(SOLVED_FACELETS_V1, scramble)
      );

      expect(engine.stats().workers).toBe(0);

      try {
        const untrusted = await engine.solve(state.facelets);
        const verified = verifySolutionV1(state, untrusted);

        expect(verified.verified).toBe(true);
        expect(engine.stats()).toMatchObject({
          workers: 1,
          readyWorkers: 1,
        });
      } finally {
        await engine.close();
      }
    },
    15_000
  );

  it("keeps one isolated canonical SolverV1 import surface", () => {
    const solverDirectory = path.resolve(
      process.cwd(),
      "src/lib/solver"
    );
    const canonicalFiles = [
      "SolverV1.ts",
      "cubeJsSolverV1.ts",
      "cubeJsSolver.worker.ts",
      "cubeJsWorkerPoolV1.ts",
      "moveV1.ts",
      "solutionVerifierV1.ts",
      "solverCacheV1.ts",
      "solverErrorsV1.ts",
      "solverIdentityV1.ts",
    ];
    const source = canonicalFiles
      .map((fileName) =>
        readFileSync(path.join(solverDirectory, fileName), "utf8")
      )
      .join("\n");

    expect(source).not.toMatch(/from ["'].+\/solver["']/);
    expect(source).not.toMatch(/solverPool|solverWorker|wasmLoader/);
    expect(source).not.toMatch(/cfop/i);
    expect(source).not.toMatch(/onnx/i);
    expect(source).not.toMatch(/evaluator/i);
    expect(source).not.toMatch(/process\.(once|on)\(/);
  });

  it("exposes only closed public errors without internal details", () => {
    const error = new SolverV1Error("SOLVER_UNAVAILABLE");
    const publicValue = toSolverErrorValueV1(
      Object.assign(error, {
        cause: new Error("/private/internal/worker.ts"),
        stderr: "engine internals",
      })
    );

    expect(error).toMatchObject({
      code: "SOLVER_UNAVAILABLE",
      message: "The solver is currently unavailable.",
    });
    expect(publicValue).toEqual({
      code: "SOLVER_UNAVAILABLE",
      message: "The solver is currently unavailable.",
      retryable: true,
    });
    expect(Object.keys(publicValue)).toEqual([
      "code",
      "message",
      "retryable",
    ]);
  });
});
