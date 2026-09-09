import { afterAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  MAX_EVALUATE_BODY_BYTES_V1,
  createEvaluatePostHandlerV1,
  createMethodNotAllowedHandlerV1,
} from "../../src/lib/integration/evaluateRouteV1";
import * as evaluateRouteModule from "../../src/app/api/evaluate/route";
import { GET, POST } from "../../src/app/api/evaluate/route";
import { applyMoves } from "../../src/lib/cube/moves";
import { createCubeFaceletStateV1 } from "../../src/lib/cube/cubeStateV1";
import { EvaluatorPipeline } from "../../src/lib/evaluator/pipeline/EvaluatorPipeline";
import {
  AtomicDemandStopServiceV1,
  type SolverV1Port,
} from "../../src/lib/integration/AtomicDemandStopServiceV1";
import { EvaluateV1Error } from "../../src/lib/integration/evaluateErrorsV1";
import { SolutionTraceBuilderV1 } from "../../src/lib/integration/SolutionTraceBuilderV1";
import { solverV1 } from "../../src/lib/solver/SolverV1";
import { SolverV1Error } from "../../src/lib/solver/solverErrorsV1";
import { verifySolutionV1 } from "../../src/lib/solver/solutionVerifierV1";
import type {
  EvaluateApiErrorV1,
  EvaluateApiResponseV1,
  EvaluateApiSuccessV1,
  EvaluateErrorCodeV1,
} from "../../src/types/evaluate-v1";
import {
  SOLVED_FACELETS_V1,
  type CubeFaceletStateV1,
  type MoveV1,
  type SolverResultV1,
} from "../../src/types/solver-v1";

const REQUEST_ID = "request:server-owned";
const BUILD_COMMIT = "b".repeat(40);

function requestFromText(
  body: string,
  contentType = "application/json",
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest("http://localhost/api/evaluate", {
    method: "POST",
    body,
    headers: {
      "Content-Type": contentType,
      ...headers,
    },
  });
}

function jsonRequest(body: unknown): NextRequest {
  return requestFromText(JSON.stringify(body));
}

function apiRequest(facelets = SOLVED_FACELETS_V1): Record<string, unknown> {
  return {
    schemaVersion: "1.0",
    cubeState: {
      format: "URFDLB_FACELETS_V1",
      facelets,
    },
  };
}

async function responseBody(response: Response): Promise<EvaluateApiResponseV1> {
  return (await response.json()) as EvaluateApiResponseV1;
}

async function successBody(response: Response): Promise<EvaluateApiSuccessV1> {
  const body = await responseBody(response);

  if (!("result" in body)) {
    throw new Error(`Expected success, received ${body.error.code}`);
  }

  return body;
}

async function errorBody(response: Response): Promise<EvaluateApiErrorV1> {
  const body = await responseBody(response);

  if (!("error" in body)) {
    throw new Error("Expected an error response");
  }

  expect(body).not.toHaveProperty("result");
  return body;
}

function resultFor(
  input: CubeFaceletStateV1,
  moves: readonly MoveV1[],
  durationMs = 7,
  cacheHit = false
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
    cache: { hit: cacheHit, keyVersion: "1" },
    durationMs,
  };
}

function solverReturning(moves: readonly MoveV1[]): SolverV1Port {
  return {
    solve: vi.fn(async (input) => resultFor(input, moves)),
  };
}

function handlerFor(
  service: AtomicDemandStopServiceV1
): ReturnType<typeof createEvaluatePostHandlerV1> {
  return createEvaluatePostHandlerV1(service, () => REQUEST_ID);
}

function exactSuccessFixture(
  input: CubeFaceletStateV1,
  solverResult: SolverResultV1
): EvaluateApiSuccessV1 {
  const verified = verifySolutionV1(input, solverResult.moves);
  const builtTrace = new SolutionTraceBuilderV1().build(
    input,
    solverResult,
    verified
  );
  const domainDemand = new EvaluatorPipeline().advanceToDemand({
    kind: "UNOBSERVED_HUMAN_STATE",
    executionId: builtTrace.executionId,
    solutionTraceId: builtTrace.solutionTraceId,
    solutionTransitionIds: builtTrace.solutionTransitions.map(
      (transition) => transition.transitionId
    ),
    humanStateBoundaries:
      builtTrace.humanStateObservationBoundaries,
  });
  const transitionTrace = {
    schemaId: builtTrace.schemaId,
    schemaVersion: builtTrace.schemaVersion,
    executionId: builtTrace.executionId,
    solutionId: builtTrace.solutionId,
    cubeStateBoundaries: builtTrace.cubeStateBoundaries,
    solutionTransitions: builtTrace.solutionTransitions,
    humanStateObservationBoundaries:
      builtTrace.humanStateObservationBoundaries,
  } as const;

  return {
    schemaVersion: "1.0",
    requestId: REQUEST_ID,
    result: {
      cubeState: {
        stateId: input.stateId,
        format: "URFDLB_FACELETS_V1",
      },
      solution: {
        solutionId: transitionTrace.solutionId,
        moves: verified.moves,
        htm: verified.htm,
        qtm: verified.qtm,
        verified: true,
        solver: {
          solverRunId: solverResult.solverRunId,
          id: "cubejs",
          version: "1.3.2",
          adapterVersion: "1.0",
          cacheHit: solverResult.cache.hit,
          cacheKeyVersion: "1",
        },
      },
      transitionTrace,
      domainDemand,
      downstreamAvailability: {
        schemaId: "DownstreamAvailabilityV1",
        schemaVersion: "1.0",
        demandArtifactId: domainDemand.artifactId,
        demandSchemaId: "SPEC-DM-001",
        demandSchemaVersion: "1.0",
        provenance: {
          executionId: transitionTrace.executionId,
          release: "2026-09-10-rc",
          buildCommit: BUILD_COMMIT,
        },
        entropy: {
          status: "NOT_SEMANTICALLY_AVAILABLE",
          reason: "ENTROPY_SEMANTICS_UNCLOSED",
        },
        interpretation: {
          status: "NOT_SEMANTICALLY_AVAILABLE",
          reason: "ENTROPY_SEMANTICS_UNCLOSED",
        },
        evaluation: {
          status: "NOT_SEMANTICALLY_AVAILABLE",
          reason: "ENTROPY_SEMANTICS_UNCLOSED",
        },
      },
      warnings: [
        {
          code: "HUMAN_STATE_NOT_OBSERVED",
          executionId: transitionTrace.executionId,
          transitionIds: transitionTrace.solutionTransitions.map(
            (transition) => transition.transitionId
          ),
        },
      ],
      timings: { solverDurationMs: solverResult.durationMs },
      build: {
        release: "2026-09-10-rc",
        commit: BUILD_COMMIT,
      },
    },
  };
}

function twistedCorner(): string {
  const facelets = SOLVED_FACELETS_V1.split("");
  [facelets[8], facelets[9], facelets[20]] = [
    facelets[9],
    facelets[20],
    facelets[8],
  ];
  return facelets.join("");
}

afterAll(async () => {
  await solverV1.close();
});

describe("C3R POST /api/evaluate", () => {
  it("C7-B0 exposes only Next-supported route module exports", () => {
    expect(Object.keys(evaluateRouteModule).sort()).toEqual([
      "DELETE",
      "GET",
      "HEAD",
      "OPTIONS",
      "PATCH",
      "POST",
      "PUT",
      "runtime",
    ]);
  });

  it(
    "runs the real SolverV1 and returns verified status-only Demand",
    async () => {
      const facelets = applyMoves(SOLVED_FACELETS_V1, ["R"]);
      const response = await POST(jsonRequest(apiRequest(facelets)));
      const body = await successBody(response);

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(body.schemaVersion).toBe("1.0");
      expect(body.requestId).toMatch(/^request:/);
      expect(body.result.solution).toMatchObject({
        verified: true,
        solver: {
          id: "cubejs",
          version: "1.3.2",
          adapterVersion: "1.0",
          cacheKeyVersion: "1",
        },
      });
      expect(body.result.domainDemand).toMatchObject({
        schemaId: "SPEC-DM-001",
        schemaVersion: "1.0",
        architecture: "P-C",
      });
      expect(body.result.domainDemand.executionEpisode.transitionRefs).toEqual(
        []
      );
    },
    20_000
  );

  it("C3R-03 accepts only the exact request contract", async () => {
    const solver = solverReturning([]);
    const handler = handlerFor(
      new AtomicDemandStopServiceV1({
        solver,
        buildCommit: BUILD_COMMIT,
      })
    );
    const validCases = [
      apiRequest(),
      { ...apiRequest(), clientRequestId: "x" },
      { ...apiRequest(), clientRequestId: "x".repeat(64) },
    ];

    for (const valid of validCases) {
      const response = await handler(jsonRequest(valid));
      expect(response.status).toBe(200);
      expect(await successBody(response)).toMatchObject({
        schemaVersion: "1.0",
        requestId: REQUEST_ID,
      });
    }

    const invalidCases: unknown[] = [
      { ...apiRequest(), clientRequestId: "" },
      { ...apiRequest(), clientRequestId: "x".repeat(65) },
      { ...apiRequest(), schemaVersion: "2.0" },
      { schemaVersion: "1.0" },
      { cubeState: apiRequest().cubeState },
      { ...apiRequest(), unknown: true },
      {
        ...apiRequest(),
        cubeState: {
          format: "URFDLB_FACELETS_V1",
          facelets: SOLVED_FACELETS_V1,
          unknown: true,
        },
      },
    ];

    for (const invalid of invalidCases) {
      const response = await handler(jsonRequest(invalid));
      const body = await errorBody(response);

      expect(response.status).toBe(400);
      expect(body).toMatchObject({
        schemaVersion: "1.0",
        requestId: REQUEST_ID,
        error: {
          code: "INVALID_JSON",
          stage: "REQUEST",
          retryable: false,
        },
      });
    }

    const wrongFormat = await handler(
      jsonRequest({
        ...apiRequest(),
        cubeState: {
          format: "OTHER",
          facelets: SOLVED_FACELETS_V1,
        },
      })
    );
    expect(wrongFormat.status).toBe(422);
    expect((await errorBody(wrongFormat)).error).toMatchObject({
      code: "INVALID_CUBE_STATE",
      stage: "VALIDATION",
      retryable: false,
    });

    expect(solver.solve).toHaveBeenCalledTimes(validCases.length);
  });

  it("clientRequestId cannot control the server-owned requestId", async () => {
    const clientRequestId = "request:client-selected";
    const handler = handlerFor(
      new AtomicDemandStopServiceV1({
        solver: solverReturning([]),
        buildCommit: BUILD_COMMIT,
      })
    );
    const response = await handler(
      jsonRequest({ ...apiRequest(), clientRequestId })
    );
    const body = await successBody(response);

    expect(body.requestId).toBe(REQUEST_ID);
    expect(body.requestId).not.toBe(clientRequestId);
    expect(JSON.stringify(body.result)).not.toContain(clientRequestId);
  });

  it("C3R-08 keeps semantic IDs stable across all operational variance", async () => {
    const facelets = applyMoves(SOLVED_FACELETS_V1, ["R"]);
    let solverCall = 0;
    let requestCall = 0;
    const service = new AtomicDemandStopServiceV1({
      solver: {
        solve: vi.fn(async (input) => {
          solverCall += 1;
          return resultFor(
            input,
            ["R'"],
            solverCall,
            solverCall % 2 === 0
          );
        }),
      },
      buildCommit: BUILD_COMMIT,
    });
    const handler = createEvaluatePostHandlerV1(
      service,
      () => `request:server-${++requestCall}`
    );
    const first = await successBody(
      await handler(
        jsonRequest({ ...apiRequest(facelets), clientRequestId: "client-a" })
      )
    );
    const second = await successBody(
      await handler(
        jsonRequest({ ...apiRequest(facelets), clientRequestId: "client-b" })
      )
    );
    const ids = (body: EvaluateApiSuccessV1) => ({
      stateId: body.result.cubeState.stateId,
      solutionId: body.result.solution.solutionId,
      executionId: body.result.transitionTrace.executionId,
      cubeBoundaryIds: body.result.transitionTrace.cubeStateBoundaries.map(
        (boundary) => boundary.boundaryId
      ),
      transitionIds: body.result.transitionTrace.solutionTransitions.map(
        (transition) => transition.transitionId
      ),
      moveEventIds: body.result.transitionTrace.solutionTransitions.map(
        (transition) => transition.moveEventId
      ),
      humanBoundaryIds:
        body.result.transitionTrace.humanStateObservationBoundaries.map(
          (boundary) => boundary.boundaryId
        ),
      demandArtifactId: body.result.domainDemand.artifactId,
      demandStatusIds: Object.values(
        body.result.domainDemand.executionEpisode.t3Consequences
      ).map((channel) => channel.statusOnlyRecord?.statusRecordId),
    });

    expect(first.requestId).not.toBe(second.requestId);
    expect(first.result.timings).not.toEqual(second.result.timings);
    expect(first.result.solution.solver.cacheHit).not.toBe(
      second.result.solution.solver.cacheHit
    );
    expect(ids(first)).toEqual(ids(second));
  });

  it("C3R-04 returns the deep exact success envelope", async () => {
    const facelets = applyMoves(SOLVED_FACELETS_V1, ["R"]);
    const moves: readonly MoveV1[] = ["R'"];
    const input = createCubeFaceletStateV1(facelets);
    const solverResult = resultFor(input, moves);
    const service = new AtomicDemandStopServiceV1({
      solver: { solve: vi.fn(async () => solverResult) },
      buildCommit: BUILD_COMMIT,
    });
    const response = await handlerFor(service)(jsonRequest(apiRequest(facelets)));

    expect(await responseBody(response)).toEqual(
      exactSuccessFixture(input, solverResult)
    );
  });

  it("C3R-07 returns the deep exact solved-cube success fixture", async () => {
    const input = createCubeFaceletStateV1(SOLVED_FACELETS_V1);
    const solverResult = resultFor(input, []);
    const service = new AtomicDemandStopServiceV1({
      solver: { solve: vi.fn(async () => solverResult) },
      buildCommit: BUILD_COMMIT,
    });
    const response = await handlerFor(service)(jsonRequest(apiRequest()));
    const expected = exactSuccessFixture(input, solverResult);

    expect(await responseBody(response)).toEqual(expected);
    expect(expected.result.solution).toMatchObject({
      moves: [],
      htm: 0,
      qtm: 0,
    });
    expect(expected.result.transitionTrace.solutionTransitions).toEqual([]);
    expect(expected.result.transitionTrace.cubeStateBoundaries).toHaveLength(1);
    expect(
      expected.result.transitionTrace.humanStateObservationBoundaries
    ).toHaveLength(1);
  });

  it.each([
    ["INVALID_JSON", 400, "REQUEST", false],
    ["REQUEST_TOO_LARGE", 413, "REQUEST", false],
    ["UNSUPPORTED_MEDIA_TYPE", 415, "REQUEST", false],
    ["METHOD_NOT_ALLOWED", 405, "REQUEST", false],
    ["INVALID_CUBE_STATE", 422, "VALIDATION", false],
    ["UNSOLVABLE_CUBE", 422, "VALIDATION", false],
    ["SOLVER_UNAVAILABLE", 503, "SOLVER", true],
    ["SOLVER_TIMEOUT", 504, "SOLVER", true],
    ["SOLUTION_VERIFICATION_FAILED", 502, "VERIFICATION", true],
    ["TRANSITION_GENERATION_FAILED", 500, "TRANSITION", false],
    ["DEMAND_CONTRACT_FAILED", 500, "DEMAND", false],
    ["INTERNAL_FAILURE", 500, "INTERNAL", false],
  ] as const)(
    "C3R-05 maps %s to its exact public contract",
    async (code, httpStatus, stage, retryable) => {
      const service = {
        execute: vi.fn(async () => {
          throw new EvaluateV1Error(code as EvaluateErrorCodeV1);
        }),
      };
      const response = await createEvaluatePostHandlerV1(
        service,
        () => REQUEST_ID
      )(jsonRequest(apiRequest()));
      const body = await errorBody(response);

      expect(response.status).toBe(httpStatus);
      expect(body).toEqual({
        schemaVersion: "1.0",
        requestId: REQUEST_ID,
        error: {
          code,
          message: expect.any(String),
          stage,
          retryable,
        },
      });
      expect(Object.keys(body.error)).toEqual([
        "code",
        "message",
        "stage",
        "retryable",
      ]);
    }
  );

  it("exercises malformed, oversized, media-type, and method request paths", async () => {
    const service = new AtomicDemandStopServiceV1({
      solver: solverReturning([]),
      buildCommit: BUILD_COMMIT,
    });
    const handler = handlerFor(service);
    const cases = [
      [requestFromText("{"), 400, "INVALID_JSON"],
      [
        requestFromText(
          JSON.stringify({ padding: "x".repeat(MAX_EVALUATE_BODY_BYTES_V1) })
        ),
        413,
        "REQUEST_TOO_LARGE",
      ],
      [
        requestFromText(JSON.stringify(apiRequest()), "text/plain"),
        415,
        "UNSUPPORTED_MEDIA_TYPE",
      ],
    ] as const;

    for (const [request, status, code] of cases) {
      const response = await handler(request);
      const body = await errorBody(response);
      expect(response.status).toBe(status);
      expect(body.error.code).toBe(code);
      expect(body.requestId).toBe(REQUEST_ID);
    }

    const methodResponse = createMethodNotAllowedHandlerV1(
      () => REQUEST_ID
    )();
    const methodBody = await errorBody(methodResponse);
    expect(methodResponse.status).toBe(405);
    expect(methodResponse.headers.get("allow")).toBe("POST");
    expect(methodBody.error).toMatchObject({
      code: "METHOD_NOT_ALLOWED",
      stage: "REQUEST",
      retryable: false,
    });

    const defaultMethodResponse = GET();
    expect(defaultMethodResponse.status).toBe(405);
  });

  it("maps invalid and physically unsolvable cubes to closed 422 errors", async () => {
    const solver = solverReturning([]);
    const handler = handlerFor(
      new AtomicDemandStopServiceV1({
        solver,
        buildCommit: BUILD_COMMIT,
      })
    );

    for (const [facelets, code] of [
      ["short", "INVALID_CUBE_STATE"],
      [twistedCorner(), "UNSOLVABLE_CUBE"],
    ] as const) {
      const response = await handler(jsonRequest(apiRequest(facelets)));
      const body = await errorBody(response);

      expect(response.status).toBe(422);
      expect(body.error.code).toBe(code);
      expect(body.error.stage).toBe("VALIDATION");
    }

    expect(solver.solve).not.toHaveBeenCalled();
  });

  it("hides malformed worker exceptions and returns no partial result", async () => {
    const service = new AtomicDemandStopServiceV1({
      solver: {
        solve: vi.fn(async () => {
          throw new Error("/private/worker.ts: engine stderr");
        }),
      },
      buildCommit: BUILD_COMMIT,
    });
    const response = await handlerFor(service)(jsonRequest(apiRequest()));
    const body = await errorBody(response);
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(500);
    expect(body.error).toEqual({
      code: "INTERNAL_FAILURE",
      message: "The evaluation request could not be completed.",
      stage: "INTERNAL",
      retryable: false,
    });
    expect(serialized).not.toContain("/private/worker.ts");
    expect(serialized).not.toContain("stderr");
    expect(body).not.toHaveProperty("result");
  });

  it("maps real solver failures without partial success", async () => {
    for (const [code, status] of [
      ["SOLVER_UNAVAILABLE", 503],
      ["SOLVER_TIMEOUT", 504],
    ] as const) {
      const service = new AtomicDemandStopServiceV1({
        solver: {
          solve: vi.fn(async () => {
            throw new SolverV1Error(code);
          }),
        },
        buildCommit: BUILD_COMMIT,
      });
      const response = await handlerFor(service)(jsonRequest(apiRequest()));
      const body = await errorBody(response);

      expect(response.status).toBe(status);
      expect(body.error.code).toBe(code);
      expect(body).not.toHaveProperty("result");
    }
  });

  it("propagates cancellation and does not reuse stale success", async () => {
    let calls = 0;
    const solver: SolverV1Port = {
      solve: vi.fn(async (input, options) => {
        calls += 1;

        if (calls === 1) {
          return resultFor(input, []);
        }

        expect(options?.signal?.aborted).toBe(true);
        throw new SolverV1Error("SOLVER_UNAVAILABLE");
      }),
    };
    const handler = handlerFor(
      new AtomicDemandStopServiceV1({
        solver,
        buildCommit: BUILD_COMMIT,
      })
    );
    const first = await handler(jsonRequest(apiRequest()));
    expect(first.status).toBe(200);

    const controller = new AbortController();
    controller.abort();
    const cancelledRequest = new NextRequest(
      "http://localhost/api/evaluate",
      {
        method: "POST",
        body: JSON.stringify(apiRequest()),
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      }
    );
    const failed = await handler(cancelledRequest);
    const failedBody = await errorBody(failed);

    expect(failed.status).toBe(503);
    expect(failedBody.error.code).toBe("SOLVER_UNAVAILABLE");
    expect(calls).toBe(2);
  });
});
