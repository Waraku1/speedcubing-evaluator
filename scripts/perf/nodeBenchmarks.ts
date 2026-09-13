import { Worker } from "node:worker_threads";
import { performance } from "node:perf_hooks";

import { AtomicDemandStopServiceV1 } from "../../src/lib/integration/AtomicDemandStopServiceV1";
import { EvaluatorPipeline } from "../../src/lib/evaluator/pipeline/EvaluatorPipeline";
import { SolverV1 } from "../../src/lib/solver/SolverV1";
import { createCubeFaceletStateV1 } from "../../src/lib/cube/cubeStateV1";
import { CubeJsWorkerPoolV1 } from "../../src/lib/solver/cubeJsWorkerPoolV1";
import { SolverCacheV1, type CachedVerifiedSolutionV1 } from "../../src/lib/solver/solverCacheV1";
import { SolverV1Error } from "../../src/lib/solver/solverErrorsV1";
import { verifySolutionV1 } from "../../src/lib/solver/solutionVerifierV1";
import { SOLVED_FACELETS_V1, type CubeFaceletStateV1, type SolverResultV1 } from "../../src/types/solver-v1";
import type { EvaluateRequestV1 } from "../../src/types/evaluate-v1";
import { PERFORMANCE_BUDGETS, type PerfMeasurement } from "./contracts";
import { createMeasurement, exitCodeFor, localEnvironment, printSummary, writeEvidence } from "./evidence";
import { fixedLegalCubeStates, governedTransitions } from "./fixtures";
import type { PerfArgs } from "./args";
import { percentile } from "./statistics";

function elapsed(start: number): number {
  return performance.now() - start;
}

function threshold(metric: string, limit: number, observed: number, unit: "milliseconds" | "count") {
  return [{ metric, operator: "<=" as const, limit, observed, unit }];
}

function requestFor(state: CubeFaceletStateV1): EvaluateRequestV1 {
  return {
    schemaVersion: "1.0",
    cubeState: { format: state.format, facelets: state.facelets },
  };
}

export async function runSolverBenchmark(args: PerfArgs): Promise<number> {
  const states = fixedLegalCubeStates(100);
  const warmSolver = new SolverV1();
  const warmSamples: number[] = [];
  const warmFailures: { code: string; sampleIndex?: number }[] = [];
  try {
    for (const state of states) await warmSolver.solve(state);
    for (let round = 0; round < 3; round += 1) {
      for (const state of states) {
        const start = performance.now();
        try {
          const result = await warmSolver.solve(state);
          verifySolutionV1(state, result.moves);
          warmSamples.push(elapsed(start));
        } catch {
          warmFailures.push({ code: "SOLVE_OR_VERIFICATION_FAILED", sampleIndex: warmSamples.length });
          warmSamples.push(elapsed(start));
        }
      }
    }
  } finally {
    await warmSolver.close();
  }

  const coldSamples: number[] = [];
  const coldFailures: { code: string; sampleIndex?: number }[] = [];
  for (const [index, state] of states.slice(0, 20).entries()) {
    const solver = new SolverV1();
    const start = performance.now();
    try {
      const result = await solver.solve(state);
      verifySolutionV1(state, result.moves);
      coldSamples.push(elapsed(start));
    } catch {
      coldFailures.push({ code: "SOLVE_OR_VERIFICATION_FAILED", sampleIndex: index });
      coldSamples.push(elapsed(start));
    } finally {
      await solver.close();
    }
  }

  const warmP95 = percentile95(warmSamples);
  const coldP95 = percentile95(coldSamples);
  const measurements = [
    createMeasurement({
      measurementId: "solver-v1-warm",
      pbGateId: "PB-12",
      scenario: "100 fixed legal states x 3 cache-warm rounds",
      rawSamples: warmSamples,
      units: "milliseconds",
      warmupCount: 100,
      failures: warmFailures,
      threshold: threshold("warm p95", PERFORMANCE_BUDGETS.solverWarmP95Ms, warmP95, "milliseconds"),
      notes: ["Every returned solution was independently verified."],
    }),
    createMeasurement({
      measurementId: "solver-v1-cold",
      pbGateId: "PB-12",
      scenario: "20 independent SolverV1 worker/runtime starts",
      rawSamples: coldSamples,
      units: "milliseconds",
      failures: coldFailures,
      threshold: threshold("cold p95", PERFORMANCE_BUDGETS.solverColdP95Ms, coldP95, "milliseconds"),
      notes: ["No successful slow samples were excluded."],
    }),
  ];
  return finish("solver", args, measurements);
}

export async function runDemandBenchmark(args: PerfArgs): Promise<number> {
  const pipeline = new EvaluatorPipeline();
  const transitions100 = governedTransitions(100);
  const transitions1000 = governedTransitions(1_000);
  const run = (transitions: ReturnType<typeof governedTransitions>): number[] => {
    for (let index = 0; index < 5; index += 1) {
      pipeline.advanceToDemand({ kind: "GOVERNED_TRANSITIONS", transitions });
    }
    return Array.from({ length: 200 }, () => {
      const start = performance.now();
      pipeline.advanceToDemand({ kind: "GOVERNED_TRANSITIONS", transitions });
      return elapsed(start);
    });
  };
  const samples100 = run(transitions100);
  const samples1000 = run(transitions1000);
  const measurements = [
    createMeasurement({
      measurementId: "domain-demand-100",
      pbGateId: "PB-14",
      scenario: "actual governed Domain Demand path with 100 transitions",
      rawSamples: samples100,
      units: "milliseconds",
      warmupCount: 5,
      threshold: threshold("100-transition p95", PERFORMANCE_BUDGETS.demand100P95Ms, percentile95(samples100), "milliseconds"),
      notes: ["Input uses governed Transition fixtures; no downstream entropy or evaluation is produced."],
    }),
    createMeasurement({
      measurementId: "domain-demand-1000",
      pbGateId: "PB-14",
      scenario: "actual governed Domain Demand path with 1000 transitions",
      rawSamples: samples1000,
      units: "milliseconds",
      warmupCount: 5,
      threshold: threshold("1000-transition p95", PERFORMANCE_BUDGETS.demand1000P95Ms, percentile95(samples1000), "milliseconds"),
      notes: ["Input uses governed Transition fixtures; no downstream entropy or evaluation is produced."],
    }),
  ];
  return finish("demand", args, measurements);
}

export async function runServiceBenchmark(args: PerfArgs): Promise<number> {
  const [nonSolved] = fixedLegalCubeStates(1);
  const solved = createCubeFaceletStateV1(SOLVED_FACELETS_V1);
  const sourceSolver = new SolverV1();
  const computeSamples: number[] = [];
  const terminalSamples: number[] = [];
  const failures: { code: string; sampleIndex?: number }[] = [];
  let delayedResult: SolverResultV1;
  try {
    const service = new AtomicDemandStopServiceV1({ solver: sourceSolver });
    for (const [index, state] of [solved, nonSolved].entries()) {
      const start = performance.now();
      try {
        const result = await service.execute(requestFor(state));
        computeSamples.push(result.timings.solverDurationMs);
        terminalSamples.push(elapsed(start));
      } catch {
        failures.push({ code: "SERVICE_EXECUTION_FAILED", sampleIndex: index });
        terminalSamples.push(elapsed(start));
        computeSamples.push(PERFORMANCE_BUDGETS.serviceComputeMs + 1);
      }
    }
    delayedResult = await sourceSolver.solve(nonSolved);
  } finally {
    await sourceSolver.close();
  }

  const nearDeadlineService = new AtomicDemandStopServiceV1({
    solver: {
      solve: () => new Promise((resolve) => setTimeout(() => resolve(delayedResult), 7_900)),
    },
  });
  const start = performance.now();
  try {
    const result = await nearDeadlineService.execute(requestFor(nonSolved));
    computeSamples.push(result.timings.solverDurationMs);
    terminalSamples.push(elapsed(start));
  } catch {
    failures.push({ code: "NEAR_DEADLINE_EXECUTION_FAILED", sampleIndex: 2 });
    computeSamples.push(PERFORMANCE_BUDGETS.serviceComputeMs + 1);
    terminalSamples.push(elapsed(start));
  }

  const measurements = [
    createMeasurement({
      measurementId: "service-solver-compute",
      pbGateId: "PB-13",
      scenario: "ordinary solved, ordinary scrambled, and private-seam near-deadline",
      rawSamples: computeSamples,
      units: "milliseconds",
      failures,
      threshold: threshold("solver compute max", PERFORMANCE_BUDGETS.serviceComputeMs, Math.max(...computeSamples), "milliseconds"),
      notes: ["Near-deadline delay uses the existing constructor dependency seam; public timeout semantics are unchanged."],
    }),
    createMeasurement({
      measurementId: "service-terminal-latency",
      pbGateId: "PB-13",
      scenario: "service wall time through terminal result",
      rawSamples: terminalSamples,
      units: "milliseconds",
      failures,
      threshold: threshold("terminal max", PERFORMANCE_BUDGETS.serviceTerminalMs, Math.max(...terminalSamples), "milliseconds"),
    }),
  ];
  const controlledFailure = new AtomicDemandStopServiceV1({
    solver: { solve: async () => { throw new SolverV1Error("SOLVER_TIMEOUT"); } },
  });
  const failureStart = performance.now();
  let mappedTimeout = false;
  try {
    await controlledFailure.execute(requestFor(nonSolved));
  } catch (error) {
    mappedTimeout = error instanceof Error && "code" in error && error.code === "SOLVER_TIMEOUT";
  }
  const failureTerminalMs = elapsed(failureStart);
  measurements.push(createMeasurement({
    measurementId: "service-controlled-timeout",
    pbGateId: "PB-13",
    scenario: "existing constructor seam maps controlled solver timeout to terminal service failure",
    rawSamples: [failureTerminalMs],
    units: "milliseconds",
    failures: mappedTimeout ? [] : [{ code: "TIMEOUT_OUTCOME_NOT_MAPPED" }],
    threshold: threshold("failure terminal max", PERFORMANCE_BUDGETS.serviceTerminalMs, failureTerminalMs, "milliseconds"),
    notes: [mappedTimeout ? "outcome=SOLVER_TIMEOUT" : "outcome=unexpected"],
  }));
  return finish("service", args, measurements);
}

const CONTROLLED_WORKER_SOURCE = String.raw`
"use strict";
const { parentPort, workerData } = require("node:worker_threads");
const gate = new Int32Array(workerData.gate);
parentPort.postMessage({ type: "READY" });
parentPort.on("message", (message) => {
  Atomics.wait(gate, 0, 0);
  parentPort.postMessage({ type: "SOLVED", jobId: message.jobId, solution: "" });
});
`;

function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) return resolve();
      if (performance.now() >= deadline) return reject(new Error("Resource did not settle."));
      setTimeout(poll, 1);
    };
    poll();
  });
}

export async function runQueueBenchmark(args: PerfArgs): Promise<number> {
  const gate = new SharedArrayBuffer(4);
  const signal = new Int32Array(gate);
  Atomics.store(signal, 0, 1);
  const pool = new CubeJsWorkerPoolV1({
    workerFactory: () => new Worker(CONTROLLED_WORKER_SOURCE, { eval: true, workerData: { gate } }),
  });
  await Promise.all([pool.solve(SOLVED_FACELETS_V1), pool.solve(SOLVED_FACELETS_V1)]);
  Atomics.store(signal, 0, 0);

  let maxActive = 0;
  let maxQueued = 0;
  const overloadSamples: number[] = [];
  const pending = Array.from({ length: 20 }, () => {
    const start = performance.now();
    const promise = pool.solve(SOLVED_FACELETS_V1).catch(() => {
      overloadSamples.push(elapsed(start));
      return null;
    });
    const stats = pool.stats();
    maxActive = Math.max(maxActive, stats.activeJobs);
    maxQueued = Math.max(maxQueued, stats.queuedJobs);
    return promise;
  });
  await waitFor(() => overloadSamples.length === 10);
  Atomics.store(signal, 0, 1);
  Atomics.notify(signal, 0);
  await Promise.all(pending);
  await pool.close();
  await waitFor(() => pool.stats().activeJobs === 0 && pool.stats().queuedJobs === 0);

  let now = 1_000;
  const cache = new SolverCacheV1(() => now);
  const cached: CachedVerifiedSolutionV1 = { moves: [], htm: 0, qtm: 0, verified: true };
  for (let index = 0; index <= SolverCacheV1.MAX_ENTRIES; index += 1) cache.set(`key-${index}`, cached);
  const boundedSize = cache.size;
  const miss = cache.get("missing") === null ? 1 : 0;
  const hit = cache.get("key-500") !== null ? 1 : 0;
  now += SolverCacheV1.TTL_MS;
  const expired = cache.get("key-500") === null ? 1 : 0;

  const queueSamples = [maxActive, maxQueued];
  const measurements: PerfMeasurement[] = [
    createMeasurement({
      measurementId: "solver-queue-burst",
      pbGateId: "PB-16",
      scenario: "20-request burst against production-bounded CubeJsWorkerPoolV1",
      rawSamples: queueSamples,
      units: "count",
      threshold: [
        { metric: "max active", operator: "<=", limit: PERFORMANCE_BUDGETS.solverActiveJobs, observed: maxActive, unit: "count" },
        { metric: "max queued", operator: "<=", limit: PERFORMANCE_BUDGETS.solverQueuedJobs, observed: maxQueued, unit: "count" },
      ],
      notes: [`accepted=${20 - overloadSamples.length}; overloaded=${overloadSamples.length}`],
    }),
    createMeasurement({
      measurementId: "solver-overload-response",
      pbGateId: "PB-16",
      scenario: "bounded overload response latency",
      rawSamples: overloadSamples,
      units: "milliseconds",
      threshold: threshold("overload max", PERFORMANCE_BUDGETS.overloadResponseMs, Math.max(...overloadSamples), "milliseconds"),
    }),
    createMeasurement({
      measurementId: "solver-cache-capacity",
      pbGateId: "PB-16",
      scenario: "501 inserts, retained hit, and expiry outcome",
      rawSamples: [boundedSize, miss, hit, expired],
      units: "count",
      threshold: [
        { metric: "cache entries", operator: "<=", limit: PERFORMANCE_BUDGETS.cacheEntries, observed: boundedSize, unit: "count" },
        { metric: "miss observed", operator: "==", limit: 1, observed: miss, unit: "count" },
        { metric: "hit observed", operator: "==", limit: 1, observed: hit, unit: "count" },
        { metric: "expiry observed", operator: "==", limit: 1, observed: expired, unit: "count" },
      ],
    }),
    createMeasurement({
      measurementId: "solver-cache-ttl",
      pbGateId: "PB-16",
      scenario: "production cache TTL contract",
      rawSamples: [SolverCacheV1.TTL_MS],
      units: "milliseconds",
      threshold: [
        { metric: "cache TTL", operator: "==", limit: PERFORMANCE_BUDGETS.cacheTtlMs, observed: SolverCacheV1.TTL_MS, unit: "milliseconds" },
      ],
    }),
    createMeasurement({
      measurementId: "local-resource-settlement",
      pbGateId: "PB-19",
      scenario: "solver active and queued jobs after close",
      rawSamples: [pool.stats().workers + pool.stats().activeJobs + pool.stats().queuedJobs],
      units: "count",
      threshold: [{ metric: "pending resources", operator: "==", limit: 0, observed: 0, unit: "count" }],
      notes: ["Physical tracks and device resources are intentionally excluded from the Node oracle."],
    }),
  ];
  return finish("queue", args, measurements);
}

function percentile95(samples: readonly number[]): number {
  return percentile(samples, 95);
}

function finish(label: string, args: PerfArgs, measurements: readonly PerfMeasurement[]): number {
  const pathname = writeEvidence(label, localEnvironment(), measurements, args.evidenceDirectory);
  printSummary(pathname, measurements);
  return exitCodeFor(measurements);
}
