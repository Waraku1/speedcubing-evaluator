import {
  DOWNSTREAM_UNAVAILABLE_REASON_V1,
  DOWNSTREAM_UNAVAILABLE_STATUS_V1,
  type DownstreamAvailabilityV1,
  type EvaluateRequestV1,
  type EvaluateSuccessV1,
} from "../../types/evaluate-v1";
import type {
  CubeFaceletStateV1,
  MoveV1,
  SolverResultV1,
  SolverV1Options,
} from "../../types/solver-v1";
import type { Move as TransitionMove } from "../cube/cube";
import { createCubeFaceletStateV1 } from "../cube/cubeStateV1";
import type { DomainDemandV1 } from "../evaluator/demand/DomainDemandV1";
import { TransitionDemandExtractor } from "../evaluator/demand/TransitionDemandExtractor";
import type { HumanState } from "../evaluator/state/HumanState";
import { createInitialHumanState } from "../evaluator/transition/HumanStateFactory";
import type { Transition } from "../evaluator/transition/Transition";
import { generateTransitions } from "../evaluator/transition/TransitionGenerator";
import { solverV1 } from "../solver/SolverV1";
import type { VerifiedSolutionV1 } from "../solver/solutionVerifierV1";
import { verifySolutionV1 } from "../solver/solutionVerifierV1";
import {
  EvaluateV1Error,
  evaluateErrorFromSolverV1,
} from "./evaluateErrorsV1";
import { adaptVerifiedMovesForTransitionsV1 } from "./moveV1TransitionAdapter";
import {
  assertDomainDemandV1,
  assertTransitionTraceV1,
} from "./productionContractV1";

export interface SolverV1Port {
  solve(
    input: CubeFaceletStateV1,
    options?: SolverV1Options
  ): Promise<SolverResultV1>;
}

export type AtomicDemandStopDependenciesV1 = {
  solver: SolverV1Port;
  verifier: (
    input: CubeFaceletStateV1,
    moves: unknown
  ) => VerifiedSolutionV1;
  moveAdapter: (moves: readonly MoveV1[]) => TransitionMove[];
  initialHumanState: () => HumanState;
  transitionGenerator: (
    initialState: HumanState,
    moves: TransitionMove[]
  ) => unknown;
  demandProducer: (transitions: readonly Transition[]) => unknown;
};

const demandExtractor = new TransitionDemandExtractor();

const PRODUCTION_DEPENDENCIES: AtomicDemandStopDependenciesV1 = {
  solver: solverV1,
  verifier: verifySolutionV1,
  moveAdapter: adaptVerifiedMovesForTransitionsV1,
  initialHumanState: createInitialHumanState,
  transitionGenerator: generateTransitions,
  demandProducer: (transitions) => demandExtractor.extract(transitions),
};

function sameMoves(
  left: readonly MoveV1[],
  right: readonly MoveV1[]
): boolean {
  return (
    left.length === right.length &&
    left.every((move, index) => move === right[index])
  );
}

function assertSolverResult(
  input: CubeFaceletStateV1,
  result: unknown
): asserts result is SolverResultV1 {
  if (
    typeof result !== "object" ||
    result === null ||
    !("inputStateId" in result) ||
    result.inputStateId !== input.stateId ||
    !("solverRunId" in result) ||
    typeof result.solverRunId !== "string" ||
    result.solverRunId.length === 0 ||
    !("verified" in result) ||
    result.verified !== true ||
    !("moves" in result) ||
    !Array.isArray(result.moves) ||
    !("htm" in result) ||
    typeof result.htm !== "number" ||
    !Number.isInteger(result.htm) ||
    result.htm < 0 ||
    !("qtm" in result) ||
    typeof result.qtm !== "number" ||
    !Number.isInteger(result.qtm) ||
    result.qtm < 0 ||
    !("durationMs" in result) ||
    typeof result.durationMs !== "number" ||
    !Number.isFinite(result.durationMs) ||
    result.durationMs < 0 ||
    !("cache" in result) ||
    typeof result.cache !== "object" ||
    result.cache === null ||
    !("hit" in result.cache) ||
    typeof result.cache.hit !== "boolean" ||
    !("keyVersion" in result.cache) ||
    result.cache.keyVersion !== "1" ||
    !("engine" in result) ||
    typeof result.engine !== "object" ||
    result.engine === null ||
    !("id" in result.engine) ||
    result.engine.id !== "cubejs" ||
    !("version" in result.engine) ||
    result.engine.version !== "1.3.2" ||
    !("adapterVersion" in result.engine) ||
    result.engine.adapterVersion !== "1.0"
  ) {
    throw new EvaluateV1Error("SOLUTION_VERIFICATION_FAILED");
  }
}

function downstreamAvailability(
  demandArtifactId: string
): DownstreamAvailabilityV1 {
  const unavailable = () =>
    Object.freeze({
      status: DOWNSTREAM_UNAVAILABLE_STATUS_V1,
      reason: DOWNSTREAM_UNAVAILABLE_REASON_V1,
      demandArtifactId,
    });

  return Object.freeze({
    schemaId: "DownstreamAvailabilityV1" as const,
    demandArtifactId,
    entropy: unavailable(),
    interpretation: unavailable(),
    evaluation: unavailable(),
  });
}

export class AtomicDemandStopServiceV1 {
  private readonly dependencies: AtomicDemandStopDependenciesV1;

  constructor(
    dependencies: Partial<AtomicDemandStopDependenciesV1> = {}
  ) {
    this.dependencies = {
      ...PRODUCTION_DEPENDENCIES,
      ...dependencies,
    };
  }

  async execute(
    request: EvaluateRequestV1,
    options: SolverV1Options = {}
  ): Promise<EvaluateSuccessV1> {
    const input = createCubeFaceletStateV1(request.facelets);
    let solverResult: SolverResultV1;

    try {
      solverResult = await this.dependencies.solver.solve(input, options);
    } catch (error) {
      throw evaluateErrorFromSolverV1(error);
    }

    let verified: VerifiedSolutionV1;
    let transitionMoves: TransitionMove[];

    try {
      assertSolverResult(input, solverResult);
      verified = this.dependencies.verifier(input, solverResult.moves);

      if (
        verified.verified !== true ||
        verified.htm !== solverResult.htm ||
        verified.qtm !== solverResult.qtm ||
        !sameMoves(verified.moves, solverResult.moves)
      ) {
        throw new EvaluateV1Error("SOLUTION_VERIFICATION_FAILED");
      }

      transitionMoves = this.dependencies.moveAdapter(verified.moves);
    } catch {
      throw new EvaluateV1Error("SOLUTION_VERIFICATION_FAILED");
    }

    let transitions: Transition[];

    try {
      const initialState = this.dependencies.initialHumanState();
      const generated = this.dependencies.transitionGenerator(
        initialState,
        transitionMoves
      );
      assertTransitionTraceV1(generated, initialState, transitionMoves);
      transitions = generated;
    } catch {
      throw new EvaluateV1Error("TRANSITION_FAILED");
    }

    let demand: DomainDemandV1;

    try {
      const produced = this.dependencies.demandProducer(transitions);
      assertDomainDemandV1(produced, transitions.length);
      demand = produced;
    } catch {
      throw new EvaluateV1Error("DEMAND_CONTRACT_FAILED");
    }

    const transitionIds = Object.freeze(
      demand.executionEpisode.transitionRefs.map(
        (reference) => reference.transitionId
      )
    );

    return Object.freeze({
      schemaId: "EvaluateSuccessV1" as const,
      semanticStop: "DEMAND" as const,
      input,
      solver: solverResult,
      transitionTrace: Object.freeze({
        executionId: demand.executionEpisode.executionId,
        count: transitions.length,
        transitionIds,
      }),
      demand,
      downstreamAvailability: downstreamAvailability(demand.artifactId),
    });
  }
}

export const atomicDemandStopServiceV1 = new AtomicDemandStopServiceV1();
