import {
  DOWNSTREAM_UNAVAILABLE_REASON_V1,
  DOWNSTREAM_UNAVAILABLE_STATUS_V1,
  EVALUATE_RELEASE_V1,
  type DownstreamAvailabilityV1,
  type EvaluateRequestV1,
  type EvaluateResultV1,
  type TransitionTraceV1,
} from "../../types/evaluate-v1";
import type {
  CubeFaceletStateV1,
  SolverResultV1,
  SolverV1Options,
} from "../../types/solver-v1";
import { createCubeFaceletStateV1 } from "../cube/cubeStateV1";
import type { DemandAdvanceInputV1 } from "../evaluator/demand/DemandAdvanceInputV1";
import { EvaluatorPipeline } from "../evaluator/pipeline/EvaluatorPipeline";
import { solverV1 } from "../solver/SolverV1";
import type { VerifiedSolutionV1 } from "../solver/solutionVerifierV1";
import { verifySolutionV1 } from "../solver/solutionVerifierV1";
import {
  EvaluateV1Error,
  evaluateErrorFromSolverV1,
} from "./evaluateErrorsV1";
import {
  SolutionTraceBuilderV1,
  type BuiltSolutionTraceV1,
} from "./SolutionTraceBuilderV1";
import {
  assertSolutionTraceV1,
  assertStatusOnlyDomainDemandV1,
} from "./productionContractV1";

const REQUIRED_HEAD_BUILD_COMMIT =
  "4a37bd23c3155c8cff1d4c71ec2f80d0e7c85a94";

export interface SolverV1Port {
  solve(
    input: CubeFaceletStateV1,
    options?: SolverV1Options
  ): Promise<SolverResultV1>;
}

export interface SolutionTraceBuilderV1Port {
  build(
    input: CubeFaceletStateV1,
    solverResult: SolverResultV1,
    verified: VerifiedSolutionV1
  ): unknown;
}

export interface EvaluatorPipelineV1Port {
  advanceToDemand(input: DemandAdvanceInputV1): unknown;
}

export type AtomicDemandStopDependenciesV1 = {
  solver: SolverV1Port;
  verifier: (
    input: CubeFaceletStateV1,
    moves: unknown
  ) => VerifiedSolutionV1;
  traceBuilder: SolutionTraceBuilderV1Port;
  evaluatorPipeline: EvaluatorPipelineV1Port;
  buildCommit: string;
};

function defaultBuildCommit(): string {
  for (const candidate of [
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.GIT_COMMIT_SHA,
    REQUIRED_HEAD_BUILD_COMMIT,
  ]) {
    if (typeof candidate === "string" && /^[0-9a-f]{40}$/i.test(candidate)) {
      return candidate.toLowerCase();
    }
  }

  return REQUIRED_HEAD_BUILD_COMMIT;
}

const PRODUCTION_DEPENDENCIES: AtomicDemandStopDependenciesV1 = {
  solver: solverV1,
  verifier: verifySolutionV1,
  traceBuilder: new SolutionTraceBuilderV1(),
  evaluatorPipeline: new EvaluatorPipeline(),
  buildCommit: defaultBuildCommit(),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  record: Record<string, unknown>,
  expectedKeys: readonly string[]
): boolean {
  return (
    Object.keys(record).sort().join("|") ===
    [...expectedKeys].sort().join("|")
  );
}

function assertRequest(request: unknown): asserts request is EvaluateRequestV1 {
  if (!isRecord(request)) {
    throw new EvaluateV1Error("INVALID_JSON");
  }

  const rootKeys = Object.keys(request);
  const expectedRootKeys = request.clientRequestId === undefined
    ? ["cubeState", "schemaVersion"]
    : ["clientRequestId", "cubeState", "schemaVersion"];

  if (
    !hasExactKeys(request, expectedRootKeys) ||
    request.schemaVersion !== "1.0" ||
    !isRecord(request.cubeState) ||
    !hasExactKeys(request.cubeState, ["facelets", "format"]) ||
    typeof request.cubeState.format !== "string" ||
    typeof request.cubeState.facelets !== "string" ||
    (rootKeys.includes("clientRequestId") &&
      (typeof request.clientRequestId !== "string" ||
        request.clientRequestId.length < 1 ||
        request.clientRequestId.length > 64))
  ) {
    throw new EvaluateV1Error("INVALID_JSON");
  }


  if (request.cubeState.format !== "URFDLB_FACELETS_V1") {
    throw new EvaluateV1Error("INVALID_CUBE_STATE");
  }
}

function sameMoves(
  left: VerifiedSolutionV1["moves"],
  right: SolverResultV1["moves"]
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
    !isRecord(result) ||
    result.inputStateId !== input.stateId ||
    typeof result.solverRunId !== "string" ||
    result.solverRunId.length === 0 ||
    result.verified !== true ||
    !Array.isArray(result.moves) ||
    typeof result.htm !== "number" ||
    !Number.isInteger(result.htm) ||
    result.htm < 0 ||
    typeof result.qtm !== "number" ||
    !Number.isInteger(result.qtm) ||
    result.qtm < 0 ||
    typeof result.durationMs !== "number" ||
    !Number.isFinite(result.durationMs) ||
    result.durationMs < 0 ||
    !isRecord(result.cache) ||
    typeof result.cache.hit !== "boolean" ||
    result.cache.keyVersion !== "1" ||
    !isRecord(result.engine) ||
    result.engine.id !== "cubejs" ||
    result.engine.version !== "1.3.2" ||
    result.engine.adapterVersion !== "1.0"
  ) {
    throw new EvaluateV1Error("SOLUTION_VERIFICATION_FAILED");
  }
}

function downstreamAvailability(
  demandArtifactId: string,
  executionId: string,
  buildCommit: string
): DownstreamAvailabilityV1 {
  const unavailable = () =>
    Object.freeze({
      status: DOWNSTREAM_UNAVAILABLE_STATUS_V1,
      reason: DOWNSTREAM_UNAVAILABLE_REASON_V1,
    });

  return Object.freeze({
    schemaId: "DownstreamAvailabilityV1",
    schemaVersion: "1.0",
    demandArtifactId,
    demandSchemaId: "SPEC-DM-001",
    demandSchemaVersion: "1.0",
    provenance: Object.freeze({
      executionId,
      release: EVALUATE_RELEASE_V1,
      buildCommit,
    }),
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

    if (!/^[0-9a-f]{40}$/i.test(this.dependencies.buildCommit)) {
      throw new TypeError("buildCommit must be a 40-hex commit identity.");
    }
  }

  async execute(
    request: EvaluateRequestV1,
    options: SolverV1Options = {}
  ): Promise<EvaluateResultV1> {
    assertRequest(request);

    let input: CubeFaceletStateV1;

    try {
      input = createCubeFaceletStateV1(request.cubeState.facelets);
    } catch (error) {
      throw evaluateErrorFromSolverV1(error);
    }

    let solverResult: SolverResultV1;

    try {
      solverResult = await this.dependencies.solver.solve(input, options);
    } catch (error) {
      throw evaluateErrorFromSolverV1(error);
    }

    let verified: VerifiedSolutionV1;

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
    } catch {
      throw new EvaluateV1Error("SOLUTION_VERIFICATION_FAILED");
    }

    let builtTrace: BuiltSolutionTraceV1;

    try {
      const producedTrace = this.dependencies.traceBuilder.build(
        input,
        solverResult,
        verified
      );
      assertSolutionTraceV1(producedTrace, input, solverResult, verified);
      builtTrace = producedTrace;
    } catch {
      throw new EvaluateV1Error("TRANSITION_GENERATION_FAILED");
    }

    let domainDemand;

    try {
      const producedDemand = this.dependencies.evaluatorPipeline.advanceToDemand({
        kind: "UNOBSERVED_HUMAN_STATE",
        executionId: builtTrace.executionId,
        solutionTraceId: builtTrace.solutionTraceId,
        solutionTransitionIds: builtTrace.solutionTransitions.map(
          (transition) => transition.transitionId
        ),
        humanStateBoundaries:
          builtTrace.humanStateObservationBoundaries,
      });
      assertStatusOnlyDomainDemandV1(producedDemand, builtTrace);
      domainDemand = producedDemand;
    } catch {
      throw new EvaluateV1Error("DEMAND_CONTRACT_FAILED");
    }

    const transitionIds = Object.freeze(
      builtTrace.solutionTransitions.map(
        (transition) => transition.transitionId
      )
    );
    const transitionTrace: TransitionTraceV1 = Object.freeze({
      schemaId: builtTrace.schemaId,
      schemaVersion: builtTrace.schemaVersion,
      executionId: builtTrace.executionId,
      solutionId: builtTrace.solutionId,
      cubeStateBoundaries: builtTrace.cubeStateBoundaries,
      solutionTransitions: builtTrace.solutionTransitions,
      humanStateObservationBoundaries:
        builtTrace.humanStateObservationBoundaries,
    });

    return Object.freeze({
      cubeState: Object.freeze({
        stateId: input.stateId,
        format: input.format,
      }),
      solution: Object.freeze({
        solutionId: transitionTrace.solutionId,
        moves: Object.freeze([...verified.moves]),
        htm: verified.htm,
        qtm: verified.qtm,
        verified: true,
        solver: Object.freeze({
          solverRunId: solverResult.solverRunId,
          id: solverResult.engine.id,
          version: solverResult.engine.version,
          adapterVersion: solverResult.engine.adapterVersion,
          cacheHit: solverResult.cache.hit,
          cacheKeyVersion: solverResult.cache.keyVersion,
        }),
      }),
      transitionTrace,
      domainDemand,
      downstreamAvailability: downstreamAvailability(
        domainDemand.artifactId,
        transitionTrace.executionId,
        this.dependencies.buildCommit.toLowerCase()
      ),
      warnings: Object.freeze([
        Object.freeze({
          code: "HUMAN_STATE_NOT_OBSERVED",
          executionId: transitionTrace.executionId,
          transitionIds,
        }),
      ]),
      timings: Object.freeze({
        solverDurationMs: solverResult.durationMs,
      }),
      build: Object.freeze({
        release: EVALUATE_RELEASE_V1,
        commit: this.dependencies.buildCommit.toLowerCase(),
      }),
    });
  }
}

export const atomicDemandStopServiceV1 = new AtomicDemandStopServiceV1();
