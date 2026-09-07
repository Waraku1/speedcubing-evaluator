import { afterAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  GET,
  MAX_EVALUATE_BODY_BYTES_V1,
  POST,
  createEvaluatePostHandlerV1,
} from "../../src/app/api/evaluate/route";
import { applyMoves } from "../../src/lib/cube/moves";
import {
  AtomicDemandStopServiceV1,
  type SolverV1Port,
} from "../../src/lib/integration/AtomicDemandStopServiceV1";
import { solverV1 } from "../../src/lib/solver/SolverV1";
import { SolverV1Error } from "../../src/lib/solver/solverErrorsV1";
import type {
  EvaluateApiResponseV1,
  EvaluateErrorValueV1,
  EvaluateSuccessV1,
} from "../../src/types/evaluate-v1";
import {
  SOLVED_FACELETS_V1,
  type CubeFaceletStateV1,
  type MoveV1,
  type SolverErrorCodeV1,
  type SolverResultV1,
} from "../../src/types/solver-v1";

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

async function successBody(response: Response): Promise<EvaluateSuccessV1> {
  const body = (await response.json()) as EvaluateApiResponseV1;

  if (!body.success) {
    throw new Error(`Expected success, received ${body.error.code}`);
  }

  return body.data;
}

async function errorBody(response: Response): Promise<EvaluateErrorValueV1> {
  const body = (await response.json()) as EvaluateApiResponseV1;

  if (body.success) {
    throw new Error("Expected an error response");
  }

  expect(body).not.toHaveProperty("data");
  return body.error;
}

function resultFor(
  input: CubeFaceletStateV1,
  moves: readonly MoveV1[]
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
    durationMs: 1,
  };
}

function solverReturning(moves: readonly MoveV1[]): SolverV1Port {
  return {
    solve: vi.fn(async (input) => resultFor(input, moves)),
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

describe("C3 POST /api/evaluate", () => {
  it(
    "C3-01 executes the real verified SolverV1 through ordered Demand",
    async () => {
      const facelets = applyMoves(SOLVED_FACELETS_V1, ["R", "U"]);
      const response = await POST(jsonRequest({ facelets }));
      const data = await successBody(response);

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(data.semanticStop).toBe("DEMAND");
      expect(data.solver).toMatchObject({
        inputStateId: data.input.stateId,
        verified: true,
        engine: { id: "cubejs", version: "1.3.2", adapterVersion: "1.0" },
      });
      expect(data.transitionTrace.count).toBe(data.solver.moves.length);
      expect(data.transitionTrace.transitionIds).toEqual(
        data.demand.executionEpisode.transitionRefs.map(
          (reference) => reference.transitionId
        )
      );
      expect(data.demand).toMatchObject({
        schemaId: "SPEC-DM-001",
        schemaVersion: "1.0",
        architecture: "P-C",
        claimClass: "T3_BOUNDED_DOMAIN_DEMAND",
      });
      expect(data.downstreamAvailability).toMatchObject({
        demandArtifactId: data.demand.artifactId,
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
      });
    },
    20_000
  );

  it("C3-02 exposes solved input as an atomic status-only success", async () => {
    const service = new AtomicDemandStopServiceV1({
      solver: solverReturning([]),
    });
    const handler = createEvaluatePostHandlerV1(service);
    const response = await handler(
      jsonRequest({ facelets: SOLVED_FACELETS_V1 })
    );
    const data = await successBody(response);

    expect(response.status).toBe(200);
    expect(data.solver).toMatchObject({ moves: [], verified: true });
    expect(data.transitionTrace.count).toBe(0);
    for (const channel of Object.values(
      data.demand.executionEpisode.t3Consequences
    )) {
      expect(channel.propositionRecords).toEqual([]);
      expect(channel.statusOnlyRecord?.status).toBe("NOT_OBSERVED");
      expect(channel.statusOnlyRecord).not.toHaveProperty("value");
    }
  });

  it("C3-03 rejects malformed boundaries without calling the solver", async () => {
    const solver = solverReturning([]);
    const handler = createEvaluatePostHandlerV1(
      new AtomicDemandStopServiceV1({ solver })
    );
    const cases: Array<{
      request: NextRequest;
      status: number;
      code: string;
    }> = [
      {
        request: requestFromText("{"),
        status: 400,
        code: "INVALID_REQUEST",
      },
      {
        request: jsonRequest({
          facelets: SOLVED_FACELETS_V1,
          unknown: true,
        }),
        status: 400,
        code: "INVALID_REQUEST",
      },
      {
        request: jsonRequest({ facelets: "short" }),
        status: 400,
        code: "INVALID_CUBE_STATE",
      },
      {
        request: requestFromText(
          JSON.stringify({ facelets: SOLVED_FACELETS_V1 }),
          "text/plain"
        ),
        status: 415,
        code: "UNSUPPORTED_MEDIA_TYPE",
      },
      {
        request: requestFromText(
          JSON.stringify({ padding: "x".repeat(MAX_EVALUATE_BODY_BYTES_V1) })
        ),
        status: 413,
        code: "PAYLOAD_TOO_LARGE",
      },
    ];

    for (const testCase of cases) {
      const response = await handler(testCase.request);
      const error = await errorBody(response);

      expect(response.status).toBe(testCase.status);
      expect(error.code).toBe(testCase.code);
      expect(Object.keys(error)).toEqual(["code", "message", "retryable"]);
    }

    expect(solver.solve).not.toHaveBeenCalled();

    const methodResponse = GET();
    const methodError = await errorBody(methodResponse);
    expect(methodResponse.status).toBe(405);
    expect(methodResponse.headers.get("allow")).toBe("POST");
    expect(methodError.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("C3-04 maps a physically unsolvable cube to 422 before solve", async () => {
    const solver = solverReturning([]);
    const handler = createEvaluatePostHandlerV1(
      new AtomicDemandStopServiceV1({ solver })
    );
    const response = await handler(
      jsonRequest({ facelets: twistedCorner() })
    );
    const error = await errorBody(response);

    expect(response.status).toBe(422);
    expect(error.code).toBe("UNSOLVABLE_CUBE");
    expect(solver.solve).not.toHaveBeenCalled();
  });

  it.each([
    ["SOLVER_UNAVAILABLE", 503],
    ["SOLVER_TIMEOUT", 504],
    ["INTERNAL_FAILURE", 500],
  ] as const)(
    "C3-05 maps %s atomically to %i",
    async (code: SolverErrorCodeV1, status) => {
      const service = new AtomicDemandStopServiceV1({
        solver: {
          solve: vi.fn(async () => {
            throw new SolverV1Error(code);
          }),
        },
      });
      const response = await createEvaluatePostHandlerV1(service)(
        jsonRequest({ facelets: SOLVED_FACELETS_V1 })
      );
      const error = await errorBody(response);

      expect(response.status).toBe(status);
      expect(error.code).toBe(code);
    }
  );

  it("C3-05 hides unknown solver internals behind a closed 500", async () => {
    const service = new AtomicDemandStopServiceV1({
      solver: {
        solve: vi.fn(async () => {
          throw new Error("/private/worker.ts: engine stderr");
        }),
      },
    });
    const response = await createEvaluatePostHandlerV1(service)(
      jsonRequest({ facelets: SOLVED_FACELETS_V1 })
    );
    const error = await errorBody(response);

    expect(response.status).toBe(500);
    expect(error).toEqual({
      code: "INTERNAL_FAILURE",
      message: "The evaluation request could not be completed.",
      retryable: true,
    });
    expect(JSON.stringify(error)).not.toContain("/private/worker.ts");
    expect(JSON.stringify(error)).not.toContain("stderr");
  });

  it("propagates cancellation and never reuses a stale success", async () => {
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
    const handler = createEvaluatePostHandlerV1(
      new AtomicDemandStopServiceV1({ solver })
    );
    const firstResponse = await handler(
      jsonRequest({ facelets: SOLVED_FACELETS_V1 })
    );
    const first = await successBody(firstResponse);

    expect(first.semanticStop).toBe("DEMAND");

    const controller = new AbortController();
    controller.abort();
    const cancelledRequest = new NextRequest(
      "http://localhost/api/evaluate",
      {
        method: "POST",
        body: JSON.stringify({ facelets: SOLVED_FACELETS_V1 }),
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      }
    );
    const failedResponse = await handler(cancelledRequest);
    const failed = await errorBody(failedResponse);

    expect(failedResponse.status).toBe(503);
    expect(failed.code).toBe("SOLVER_UNAVAILABLE");
    expect(calls).toBe(2);
  });

  it.each([
    [
      "TRANSITION_FAILED",
      {
        transitionGenerator: () => {
          throw new Error("transition failure");
        },
      },
    ],
    [
      "DEMAND_CONTRACT_FAILED",
      {
        demandProducer: () => ({ artifactId: "malformed" }),
      },
    ],
  ] as const)("C3-07/08 returns no partial payload for %s", async (code, fault) => {
    const facelets = applyMoves(SOLVED_FACELETS_V1, ["R"]);
    const service = new AtomicDemandStopServiceV1({
      solver: solverReturning(["R'"]),
      ...fault,
    });
    const response = await createEvaluatePostHandlerV1(service)(
      jsonRequest({ facelets })
    );
    const error = await errorBody(response);

    expect(response.status).toBe(500);
    expect(error.code).toBe(code);
  });
});
