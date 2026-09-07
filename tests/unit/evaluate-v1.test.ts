import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { applyMoves } from "../../src/lib/cube/moves";
import { TransitionDemandExtractor } from "../../src/lib/evaluator/demand/TransitionDemandExtractor";
import { createInitialHumanState } from "../../src/lib/evaluator/transition/HumanStateFactory";
import { generateTransitions } from "../../src/lib/evaluator/transition/TransitionGenerator";
import {
  AtomicDemandStopServiceV1,
  type SolverV1Port,
} from "../../src/lib/integration/AtomicDemandStopServiceV1";
import { adaptVerifiedMovesForTransitionsV1 } from "../../src/lib/integration/moveV1TransitionAdapter";
import { SolverV1Error } from "../../src/lib/solver/solverErrorsV1";
import {
  MOVE_V1_TOKENS,
  SOLVED_FACELETS_V1,
  type CubeFaceletStateV1,
  type MoveV1,
  type SolverResultV1,
} from "../../src/types/solver-v1";

function resultFor(
  input: CubeFaceletStateV1,
  moves: readonly MoveV1[],
  durationMs = 0
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
    cache: { hit: false, keyVersion: "1" },
    durationMs,
  };
}

function solverReturning(
  moves: readonly MoveV1[],
  duration: () => number = () => 0
): SolverV1Port {
  return {
    solve: vi.fn(async (input) => resultFor(input, moves, duration())),
  };
}

async function expectCode(
  promise: Promise<unknown>,
  code: string
): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

function semanticIds(result: Awaited<ReturnType<AtomicDemandStopServiceV1["execute"]>>) {
  return {
    inputStateId: result.input.stateId,
    solverRunId: result.solver.solverRunId,
    executionId: result.transitionTrace.executionId,
    transitionIds: result.transitionTrace.transitionIds,
    artifactId: result.demand.artifactId,
  };
}

describe("C3 Atomic Demand-stop service", () => {
  it("maps every closed MoveV1 token exactly through a copying adapter", () => {
    const adapted = adaptVerifiedMovesForTransitionsV1(MOVE_V1_TOKENS);

    expect(adapted).toEqual(MOVE_V1_TOKENS);
    expect(adapted).not.toBe(MOVE_V1_TOKENS);
    expect(() =>
      adaptVerifiedMovesForTransitionsV1(["Rw" as MoveV1])
    ).toThrowError(
      expect.objectContaining({ code: "SOLUTION_VERIFICATION_FAILED" })
    );
  });

  it("C3-02 returns zero Transitions and status-only Demand for solved input", async () => {
    const service = new AtomicDemandStopServiceV1({
      solver: solverReturning([]),
    });
    const result = await service.execute({ facelets: SOLVED_FACELETS_V1 });
    const channels = result.demand.executionEpisode.t3Consequences;

    expect(result).toMatchObject({
      schemaId: "EvaluateSuccessV1",
      semanticStop: "DEMAND",
      solver: { moves: [], htm: 0, qtm: 0, verified: true },
      transitionTrace: { count: 0, transitionIds: [] },
    });
    expect(result.demand.executionEpisode.transitionRefs).toEqual([]);

    for (const channel of Object.values(channels)) {
      expect(channel.propositionRecords).toEqual([]);
      expect(channel.statusOnlyRecord).toMatchObject({
        status: "NOT_OBSERVED",
      });
      expect(channel.statusOnlyRecord).not.toHaveProperty("value");
    }

    for (const stage of Object.values(result.downstreamAvailability).filter(
      (value) => typeof value === "object"
    )) {
      expect(stage).toMatchObject({
        status: "NOT_SEMANTICALLY_AVAILABLE",
        reason: "ENTROPY_SEMANTICS_UNCLOSED",
        demandArtifactId: result.demand.artifactId,
      });
    }
  });

  it("C3-04 rejects invalid and unsolvable cubes before solver execution", async () => {
    const solver = solverReturning([]);
    const service = new AtomicDemandStopServiceV1({ solver });
    const twisted = SOLVED_FACELETS_V1.split("");
    [twisted[8], twisted[9], twisted[20]] = [
      twisted[9],
      twisted[20],
      twisted[8],
    ];

    await expectCode(
      service.execute({ facelets: "short" }),
      "INVALID_CUBE_STATE"
    );
    await expectCode(
      service.execute({ facelets: twisted.join("") }),
      "UNSOLVABLE_CUBE"
    );
    expect(solver.solve).not.toHaveBeenCalled();
  });

  it("C3-06 rejects wrong or verifier-failed solutions before Transitions", async () => {
    const inputFacelets = applyMoves(SOLVED_FACELETS_V1, ["R"]);
    const transitionGenerator = vi.fn();
    const demandProducer = vi.fn();
    const wrong = new AtomicDemandStopServiceV1({
      solver: solverReturning(["U"]),
      transitionGenerator,
      demandProducer,
    });

    await expectCode(
      wrong.execute({ facelets: inputFacelets }),
      "SOLUTION_VERIFICATION_FAILED"
    );
    expect(transitionGenerator).not.toHaveBeenCalled();
    expect(demandProducer).not.toHaveBeenCalled();

    const verifierFailure = new AtomicDemandStopServiceV1({
      solver: solverReturning(["R'"]),
      verifier: () => {
        throw new SolverV1Error("SOLUTION_VERIFICATION_FAILED");
      },
      transitionGenerator,
      demandProducer,
    });

    await expectCode(
      verifierFailure.execute({ facelets: inputFacelets }),
      "SOLUTION_VERIFICATION_FAILED"
    );
    expect(transitionGenerator).not.toHaveBeenCalled();
    expect(demandProducer).not.toHaveBeenCalled();
  });

  it.each([
    ["throws", () => {
      throw new Error("transition internals");
    }],
    ["returns a malformed trace", () => []],
  ])("C3-07 maps a Transition generator that %s atomically", async (_case, generator) => {
    const demandProducer = vi.fn();
    const service = new AtomicDemandStopServiceV1({
      solver: solverReturning(["R'"]),
      transitionGenerator: generator,
      demandProducer,
    });
    const facelets = applyMoves(SOLVED_FACELETS_V1, ["R"]);

    await expectCode(
      service.execute({ facelets }),
      "TRANSITION_FAILED"
    );
    expect(demandProducer).not.toHaveBeenCalled();
  });

  it.each([
    ["throws", () => {
      throw new Error("demand internals");
    }],
    ["returns a malformed artifact", () => ({ schemaId: "wrong" })],
  ])("C3-08 maps a Demand producer that %s atomically", async (_case, producer) => {
    const service = new AtomicDemandStopServiceV1({
      solver: solverReturning(["R'"]),
      demandProducer: producer,
    });
    const facelets = applyMoves(SOLVED_FACELETS_V1, ["R"]);

    await expectCode(
      service.execute({ facelets }),
      "DEMAND_CONTRACT_FAILED"
    );
  });

  it("C3-09 preserves the governed identity and provenance chain", async () => {
    const moves: MoveV1[] = ["R'", "U'"];
    const facelets = applyMoves(SOLVED_FACELETS_V1, ["U", "R"]);
    const service = new AtomicDemandStopServiceV1({
      solver: solverReturning(moves),
    });
    const result = await service.execute({ facelets });
    const episode = result.demand.executionEpisode;

    expect(result.solver.inputStateId).toBe(result.input.stateId);
    expect(result.transitionTrace.executionId).toBe(episode.executionId);
    expect(result.transitionTrace.transitionIds).toEqual(
      episode.transitionRefs.map((reference) => reference.transitionId)
    );
    expect(episode.transitionRefs.map((reference) => reference.ordinal)).toEqual([
      0,
      1,
    ]);
    expect(result.downstreamAvailability.demandArtifactId).toBe(
      result.demand.artifactId
    );

    for (const event of episode.eventRecords) {
      const reference = episode.transitionRefs[event.ordinal];
      expect(event.transitionId).toBe(reference.transitionId);
      expect(event.beforeHumanStateRef).toBe(reference.beforeHumanStateRef);
      expect(event.afterHumanStateRef).toBe(reference.afterHumanStateRef);
    }
  });

  it("C3-10 keeps semantic identities stable when duration changes", async () => {
    let duration = 10;
    const facelets = applyMoves(SOLVED_FACELETS_V1, ["R"]);
    const service = new AtomicDemandStopServiceV1({
      solver: solverReturning(["R'"], () => duration++),
    });
    const first = await service.execute({ facelets });
    const second = await service.execute({ facelets });

    expect(second.solver.durationMs).not.toBe(first.solver.durationMs);
    expect(semanticIds(second)).toEqual(semanticIds(first));
  });

  it("validates the unchanged C1 producer and avoids downstream imports", () => {
    const initial = createInitialHumanState();
    const transitions = generateTransitions(initial, ["R"]);
    const demand = new TransitionDemandExtractor().extract(transitions);
    const source = readFileSync(
      path.resolve(
        process.cwd(),
        "src/lib/integration/AtomicDemandStopServiceV1.ts"
      ),
      "utf8"
    );

    expect(demand.schemaId).toBe("SPEC-DM-001");
    expect(source).not.toMatch(/evaluator\/(metrics|entropy|interpretation|evaluation|prototype|legacy)/i);
    expect(source).not.toMatch(/evaluateMoves|ergonomicsScore|totalScore/);
  });
});
