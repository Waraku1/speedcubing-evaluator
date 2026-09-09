import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { applyMoves } from "../../src/lib/cube/moves";
import { EvaluatorPipeline } from "../../src/lib/evaluator/pipeline/EvaluatorPipeline";
import {
  AtomicDemandStopServiceV1,
  type EvaluatorPipelineV1Port,
  type SolverV1Port,
} from "../../src/lib/integration/AtomicDemandStopServiceV1";
import { SolutionTraceBuilderV1 } from "../../src/lib/integration/SolutionTraceBuilderV1";
import { SolverV1Error } from "../../src/lib/solver/solverErrorsV1";
import type { EvaluateRequestV1 } from "../../src/types/evaluate-v1";
import {
  SOLVED_FACELETS_V1,
  type CubeFaceletStateV1,
  type MoveV1,
  type SolverResultV1,
} from "../../src/types/solver-v1";

const BUILD_COMMIT = "a".repeat(40);

function request(
  facelets: string,
  clientRequestId?: string
): EvaluateRequestV1 {
  return {
    schemaVersion: "1.0",
    cubeState: {
      format: "URFDLB_FACELETS_V1",
      facelets,
    },
    ...(clientRequestId === undefined ? {} : { clientRequestId }),
  };
}

function resultFor(
  input: CubeFaceletStateV1,
  moves: readonly MoveV1[],
  options: { durationMs?: number; cacheHit?: boolean } = {}
): SolverResultV1 {
  return {
    solverRunId: `solver-run:${input.stateId}:${moves.join("-")}`,
    inputStateId: input.stateId,
    engine: {
      id: "cubejs",
      version: "1.3.2",
      adapterVersion: "1.0",
    },
    moves,
    htm: moves.length,
    qtm: moves.reduce(
      (sum, move) => sum + (move.endsWith("2") ? 2 : 1),
      0
    ),
    verified: true,
    cache: { hit: options.cacheHit ?? false, keyVersion: "1" },
    durationMs: options.durationMs ?? 0,
  };
}

function solverReturning(
  moves: readonly MoveV1[],
  resultOptions: () => { durationMs?: number; cacheHit?: boolean } = () => ({})
): SolverV1Port {
  return {
    solve: vi.fn(async (input) => resultFor(input, moves, resultOptions())),
  };
}

function semanticIds(
  result: Awaited<ReturnType<AtomicDemandStopServiceV1["execute"]>>
) {
  return {
    stateId: result.cubeState.stateId,
    solutionId: result.solution.solutionId,
    executionId: result.transitionTrace.executionId,
    cubeBoundaryIds: result.transitionTrace.cubeStateBoundaries.map(
      (boundary) => boundary.boundaryId
    ),
    transitionIds: result.transitionTrace.solutionTransitions.map(
      (transition) => transition.transitionId
    ),
    moveEventIds: result.transitionTrace.solutionTransitions.map(
      (transition) => transition.moveEventId
    ),
    humanBoundaryIds:
      result.transitionTrace.humanStateObservationBoundaries.map(
        (boundary) => boundary.boundaryId
      ),
    demandArtifactId: result.domainDemand.artifactId,
    demandStatusIds: Object.values(
      result.domainDemand.executionEpisode.t3Consequences
    ).map((channel) => channel.statusOnlyRecord?.statusRecordId),
  };
}

function allKeys(value: unknown): string[] {
  if (value === null || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(allKeys);
  }

  return Object.entries(value).flatMap(([key, nested]) => [
    key,
    ...allKeys(nested),
  ]);
}

function numericValues(value: unknown): number[] {
  if (typeof value === "number") {
    return [value];
  }

  if (value === null || typeof value !== "object") {
    return [];
  }

  return Object.values(value).flatMap(numericValues);
}

function assertStatusOnlyDemand(
  demand: Awaited<ReturnType<AtomicDemandStopServiceV1["execute"]>>["domainDemand"]
): void {
  expect(demand).toMatchObject({
    schemaId: "SPEC-DM-001",
    schemaVersion: "1.0",
    architecture: "P-C",
    claimClass: "T3_BOUNDED_DOMAIN_DEMAND",
    t1Plane: { status: "NOT_OBSERVED" },
    t2Plane: { status: "NOT_OBSERVED" },
  });
  expect(demand.executionEpisode).toMatchObject({
    transitionRefs: [],
    eventRecords: [],
    observationRecords: [],
    windowRecords: [],
    evidenceEdges: [],
  });

  expect(Object.keys(demand.executionEpisode.t3Consequences)).toEqual([
    "grip",
    "finger",
    "orientation",
    "continuity",
  ]);
  for (const channel of Object.values(
    demand.executionEpisode.t3Consequences
  )) {
    expect(channel.propositionRecords).toEqual([]);
    expect(channel.statusOnlyRecord).toMatchObject({
      status: "NOT_OBSERVED",
      reason: "HUMAN_STATE_SOURCE_NOT_PROVIDED",
    });
    expect(channel.statusOnlyRecord).not.toHaveProperty("value");
  }

  expect(numericValues(demand)).toEqual([]);
  expect(allKeys(demand)).not.toEqual(
    expect.arrayContaining([
      "move",
      "moveToken",
      "score",
      "rank",
      "total",
      "weight",
      "entropy",
      "interpretation",
      "evaluation",
    ])
  );
}

describe("C3R production contract reconciliation", () => {
  it("C3R-01 removes fabricated Human-State physics from production integration", () => {
    const productionSources = [
      "src/app/api/evaluate/route.ts",
      "src/lib/integration/AtomicDemandStopServiceV1.ts",
      "src/lib/integration/evaluateRouteV1.ts",
      "src/lib/integration/SolutionTraceBuilderV1.ts",
    ]
      .map((fileName) =>
        readFileSync(path.resolve(process.cwd(), fileName), "utf8")
      )
      .join("\n");

    expect(productionSources).not.toMatch(
      /HumanStateFactory|TransitionGenerator|TransitionPhysics|createInitialHumanState|generateTransitions|TransitionDemandExtractor/
    );
    expect(productionSources).not.toMatch(
      /leftContactCount|rightContactCount|fatigue|certainty|continuity|velocity/
    );
  });

  it("C3R-02 advances only through the evaluator-owned unobserved input", async () => {
    const facelets = applyMoves(SOLVED_FACELETS_V1, ["R"]);
    const governedPipeline = new EvaluatorPipeline();
    const advanceToDemand = vi.fn((input) =>
      governedPipeline.advanceToDemand(input)
    );
    const evaluatorPipeline: EvaluatorPipelineV1Port = { advanceToDemand };
    const service = new AtomicDemandStopServiceV1({
      solver: solverReturning(["R'"]),
      evaluatorPipeline,
      buildCommit: BUILD_COMMIT,
    });

    const result = await service.execute(request(facelets));

    expect(advanceToDemand).toHaveBeenCalledOnce();
    expect(advanceToDemand).toHaveBeenCalledWith({
      kind: "UNOBSERVED_HUMAN_STATE",
      executionId: result.transitionTrace.executionId,
      solutionTraceId: expect.any(String),
      solutionTransitionIds: result.transitionTrace.solutionTransitions.map(
        (transition) => transition.transitionId
      ),
      humanStateBoundaries:
        result.transitionTrace.humanStateObservationBoundaries,
    });
  });

  it("preserves the governed-Transition discriminator for C1 compatibility", () => {
    const pipeline = new EvaluatorPipeline();

    expect(
      pipeline.advanceToDemand({
        kind: "GOVERNED_TRANSITIONS",
        transitions: [],
      })
    ).toEqual(pipeline.advanceToDemand([]));
  });

  it("C3R-06 builds n solution transitions and n+1 boundary records", async () => {
    const facelets = applyMoves(SOLVED_FACELETS_V1, ["U", "R"]);
    const result = await new AtomicDemandStopServiceV1({
      solver: solverReturning(["R'", "U'"]),
      buildCommit: BUILD_COMMIT,
    }).execute(request(facelets));
    const trace = result.transitionTrace;

    expect(result.solution).toMatchObject({
      moves: ["R'", "U'"],
      htm: 2,
      qtm: 2,
      verified: true,
    });
    expect(trace.solutionTransitions).toHaveLength(2);
    expect(trace.cubeStateBoundaries).toHaveLength(3);
    expect(trace.humanStateObservationBoundaries).toHaveLength(3);
    expect(
      trace.humanStateObservationBoundaries.map((boundary) => ({
        ordinal: boundary.ordinal,
        status: boundary.status,
        reason: boundary.reason,
      }))
    ).toEqual([
      {
        ordinal: 0,
        status: "NOT_OBSERVED",
        reason: "HUMAN_STATE_SOURCE_NOT_PROVIDED",
      },
      {
        ordinal: 1,
        status: "NOT_OBSERVED",
        reason: "HUMAN_STATE_SOURCE_NOT_PROVIDED",
      },
      {
        ordinal: 2,
        status: "NOT_OBSERVED",
        reason: "HUMAN_STATE_SOURCE_NOT_PROVIDED",
      },
    ]);
    expect(
      trace.solutionTransitions.map((transition) => transition.move)
    ).toEqual(result.solution.moves);
    expect(result.domainDemand.executionEpisode.transitionRefs).toEqual([]);
    assertStatusOnlyDemand(result.domainDemand);
  });

  it("C3R-07 uses the same status-only path for an already solved cube", async () => {
    const result = await new AtomicDemandStopServiceV1({
      solver: solverReturning([]),
      buildCommit: BUILD_COMMIT,
    }).execute(request(SOLVED_FACELETS_V1));

    expect(result.solution).toMatchObject({
      moves: [],
      htm: 0,
      qtm: 0,
      verified: true,
    });
    expect(result.transitionTrace.solutionTransitions).toEqual([]);
    expect(result.transitionTrace.cubeStateBoundaries).toHaveLength(1);
    expect(
      result.transitionTrace.humanStateObservationBoundaries
    ).toHaveLength(1);
    assertStatusOnlyDemand(result.domainDemand);
  });

  it("C3R-08 excludes request metadata, cache state, and timings from semantic IDs", async () => {
    let call = 0;
    const solver = solverReturning(["R'"], () => ({
      durationMs: ++call,
      cacheHit: call % 2 === 0,
    }));
    const service = new AtomicDemandStopServiceV1({
      solver,
      buildCommit: BUILD_COMMIT,
    });
    const facelets = applyMoves(SOLVED_FACELETS_V1, ["R"]);
    const first = await service.execute(request(facelets, "client-a"));
    const second = await service.execute(request(facelets, "client-b"));

    expect(first.timings).not.toEqual(second.timings);
    expect(first.solution.solver.cacheHit).not.toBe(
      second.solution.solver.cacheHit
    );
    expect(semanticIds(first)).toEqual(semanticIds(second));
  });

  it("C3R-09 keeps MoveV1 only in solution provenance, never Domain Demand", async () => {
    const facelets = applyMoves(SOLVED_FACELETS_V1, ["R"]);
    const result = await new AtomicDemandStopServiceV1({
      solver: solverReturning(["R'"]),
      buildCommit: BUILD_COMMIT,
    }).execute(request(facelets));

    expect(result.solution.moves).toEqual(["R'"]);
    expect(result.transitionTrace.solutionTransitions[0].move).toBe("R'");
    expect(allKeys(result.domainDemand)).not.toContain("move");
    expect(JSON.stringify(result.domainDemand)).not.toContain("R'");
  });

  it("C3R-10 verifies independently before building a trace", async () => {
    const callOrder: string[] = [];
    const facelets = applyMoves(SOLVED_FACELETS_V1, ["R"]);
    const traceBuilder = new SolutionTraceBuilderV1();
    const service = new AtomicDemandStopServiceV1({
      solver: solverReturning(["R'"]),
      verifier: (input, moves) => {
        callOrder.push("verify");
        return {
          moves: moves as readonly MoveV1[],
          htm: 1,
          qtm: 1,
          verified: true,
        };
      },
      traceBuilder: {
        build: (...args) => {
          callOrder.push("trace");
          return traceBuilder.build(...args);
        },
      },
      buildCommit: BUILD_COMMIT,
    });

    await service.execute(request(facelets));
    expect(callOrder).toEqual(["verify", "trace"]);
  });

  it("maps verifier, trace, and Demand faults atomically", async () => {
    const facelets = applyMoves(SOLVED_FACELETS_V1, ["R"]);
    const base = request(facelets);

    await expect(
      new AtomicDemandStopServiceV1({
        solver: solverReturning(["U"]),
        buildCommit: BUILD_COMMIT,
      }).execute(base)
    ).rejects.toMatchObject({ code: "SOLUTION_VERIFICATION_FAILED" });

    await expect(
      new AtomicDemandStopServiceV1({
        solver: solverReturning(["R'"]),
        traceBuilder: {
          build: () => {
            throw new Error("trace internals");
          },
        },
        buildCommit: BUILD_COMMIT,
      }).execute(base)
    ).rejects.toMatchObject({ code: "TRANSITION_GENERATION_FAILED" });

    await expect(
      new AtomicDemandStopServiceV1({
        solver: solverReturning(["R'"]),
        traceBuilder: { build: () => ({ schemaId: "malformed" }) },
        buildCommit: BUILD_COMMIT,
      }).execute(base)
    ).rejects.toMatchObject({ code: "TRANSITION_GENERATION_FAILED" });

    await expect(
      new AtomicDemandStopServiceV1({
        solver: solverReturning(["R'"]),
        evaluatorPipeline: {
          advanceToDemand: () => {
            throw new Error("Demand internals");
          },
        },
        buildCommit: BUILD_COMMIT,
      }).execute(base)
    ).rejects.toMatchObject({ code: "DEMAND_CONTRACT_FAILED" });

    await expect(
      new AtomicDemandStopServiceV1({
        solver: solverReturning(["R'"]),
        evaluatorPipeline: {
          advanceToDemand: () => ({ schemaId: "malformed" }),
        },
        buildCommit: BUILD_COMMIT,
      }).execute(base)
    ).rejects.toMatchObject({ code: "DEMAND_CONTRACT_FAILED" });
  });

  it("keeps invalid and unsolvable states ahead of solver execution", async () => {
    const solver = solverReturning([]);
    const service = new AtomicDemandStopServiceV1({
      solver,
      buildCommit: BUILD_COMMIT,
    });
    const twisted = SOLVED_FACELETS_V1.split("");
    [twisted[8], twisted[9], twisted[20]] = [
      twisted[9],
      twisted[20],
      twisted[8],
    ];

    await expect(service.execute(request("short"))).rejects.toMatchObject({
      code: "INVALID_CUBE_STATE",
    });
    await expect(
      service.execute(request(twisted.join("")))
    ).rejects.toMatchObject({ code: "UNSOLVABLE_CUBE" });
    expect(solver.solve).not.toHaveBeenCalled();
  });

  it("does not leak unknown solver failures", async () => {
    const service = new AtomicDemandStopServiceV1({
      solver: {
        solve: async () => {
          throw new Error("/private/worker.ts: engine stderr");
        },
      },
      buildCommit: BUILD_COMMIT,
    });

    await expect(
      service.execute(request(SOLVED_FACELETS_V1))
    ).rejects.toMatchObject({ code: "INTERNAL_FAILURE" });
  });

  it("maps governed SolverV1 failures without changing C2", async () => {
    const service = new AtomicDemandStopServiceV1({
      solver: {
        solve: async () => {
          throw new SolverV1Error("SOLVER_TIMEOUT");
        },
      },
      buildCommit: BUILD_COMMIT,
    });

    await expect(
      service.execute(request(SOLVED_FACELETS_V1))
    ).rejects.toMatchObject({ code: "SOLVER_TIMEOUT" });
  });
});
