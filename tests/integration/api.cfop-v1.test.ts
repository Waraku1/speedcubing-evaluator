import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import * as cfopRouteModule from "../../src/app/api/cfop/route";
import { GET, POST } from "../../src/app/api/cfop/route";
import {
  MAX_CFOP_BODY_BYTES_V1,
  createCFOPPostHandlerV1,
} from "../../src/lib/integration/cfopRouteV1";
import {
  CFOPServiceV1,
  type CFOPBackendV1Port,
} from "../../src/lib/integration/CFOPServiceV1";
import {
  solveCFOPFromState,
  verifyStateSolveResult,
} from "../../src/lib/cfop-solver/cfop-solver";
import { applyMoves } from "../../src/lib/cube/moves";
import type {
  CFOPApiErrorV1,
  CFOPApiResponseV1,
  CFOPApiSuccessV1,
} from "../../src/types/cfop-v1";
import { SOLVED_FACELETS_V1 } from "../../src/types/solver-v1";

const REQUEST_ID = "cfop-request:integration";

function requestFromText(
  body: string,
  contentType = "application/json",
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest("http://localhost/api/cfop", {
    method: "POST",
    body,
    headers: { "Content-Type": contentType, ...headers },
  });
}

function apiRequest(facelets = SOLVED_FACELETS_V1): Record<string, unknown> {
  return {
    schemaVersion: "1.0",
    inputMode: "FACELET_STATE",
    cubeState: { format: "URFDLB_FACELETS_V1", facelets },
  };
}

function jsonRequest(body: unknown): NextRequest {
  return requestFromText(JSON.stringify(body));
}

async function responseBody(response: Response): Promise<CFOPApiResponseV1> {
  return (await response.json()) as CFOPApiResponseV1;
}

async function successBody(response: Response): Promise<CFOPApiSuccessV1> {
  const body = await responseBody(response);
  if (!("result" in body)) throw new Error(`Expected success: ${body.error.code}`);
  return body;
}

async function errorBody(response: Response): Promise<CFOPApiErrorV1> {
  const body = await responseBody(response);
  if (!("error" in body)) throw new Error("Expected error response");
  return body;
}

function handlerFor(service: CFOPServiceV1) {
  return createCFOPPostHandlerV1(service, () => REQUEST_ID);
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

describe("POST /api/cfop", () => {
  it("exports only supported App Router symbols", () => {
    expect(Object.keys(cfopRouteModule).sort()).toEqual([
      "DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT", "runtime",
    ]);
  });

  it.each([
    ["solved", SOLVED_FACELETS_V1, 0],
    ["representative non-solved", applyMoves(SOLVED_FACELETS_V1, ["R", "U"]), 1],
  ])("returns a verified facelet-native CFOP result for %s input", async (_name, facelets, minimumMoves) => {
    const response = await POST(jsonRequest(apiRequest(facelets)));
    const body = await successBody(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.requestId).toMatch(/^cfop-request:/);
    expect(body.result.method).toEqual({
      id: "CFOP",
      version: "1.0",
      orientation: "D_CROSS_U_LAST_LAYER",
      historyUsage: "NONE",
    });
    expect(body.result.solution.verified).toBe(true);
    expect(body.result.solution.moves.length).toBeGreaterThanOrEqual(minimumMoves);
    expect(applyMoves(facelets, body.result.solution.moves)).toBe(SOLVED_FACELETS_V1);
  });

  it("rejects malformed and extra-field request shapes", async () => {
    for (const value of [
      {},
      { ...apiRequest(), extra: true },
      { ...apiRequest(), schemaVersion: "2.0" },
      { ...apiRequest(), inputMode: false },
      {
        ...apiRequest(),
        cubeState: { ...apiRequest().cubeState as object, extra: true },
      },
    ]) {
      const response = await POST(jsonRequest(value));
      expect(response.status).toBe(400);
      expect((await errorBody(response)).error.code).toBe("INVALID_JSON");
    }
  });

  it("rejects unsupported history-oriented input without reconstructing it", async () => {
    const response = await POST(
      jsonRequest({ ...apiRequest(), inputMode: "SCRAMBLE_HISTORY" })
    );
    const body = await errorBody(response);

    expect(response.status).toBe(422);
    expect(body.error).toMatchObject({
      code: "UNSUPPORTED_INPUT_MODE",
      stage: "VALIDATION",
      retryable: false,
    });
  });

  it.each([
    ["invalid representation", "U".repeat(54), "INVALID_CUBE_STATE"],
    ["physically impossible state", twistedCorner(), "UNSOLVABLE_CUBE"],
  ])("maps %s", async (_name, facelets, code) => {
    const response = await POST(jsonRequest(apiRequest(facelets)));
    const body = await errorBody(response);

    expect(response.status).toBe(422);
    expect(body.error.code).toBe(code);
  });

  it("maps a backend failure without leaking its exception", async () => {
    const backend: CFOPBackendV1Port = {
      solve: vi.fn(() => {
        throw new Error("sensitive backend detail");
      }),
      verify: vi.fn(() => true),
    };
    const response = await handlerFor(new CFOPServiceV1({ backend }))(
      jsonRequest(apiRequest())
    );
    const body = await errorBody(response);

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("CFOP_UNAVAILABLE");
    expect(JSON.stringify(body)).not.toContain("sensitive backend detail");
  });

  it("maps a failed independent verification", async () => {
    const backend: CFOPBackendV1Port = {
      solve: solveCFOPFromState,
      verify: vi.fn(() => false),
    };
    const response = await handlerFor(new CFOPServiceV1({ backend }))(
      jsonRequest(apiRequest())
    );
    const body = await errorBody(response);

    expect(response.status).toBe(502);
    expect(body.error.code).toBe("CFOP_VERIFICATION_FAILED");
  });

  it("maps a verifier exception as a contained verification failure", async () => {
    const backend: CFOPBackendV1Port = {
      solve: solveCFOPFromState,
      verify: vi.fn(() => {
        throw new Error("private verifier detail");
      }),
    };
    const response = await handlerFor(new CFOPServiceV1({ backend }))(
      jsonRequest(apiRequest())
    );
    const body = await errorBody(response);

    expect(response.status).toBe(502);
    expect(body.error.code).toBe("CFOP_VERIFICATION_FAILED");
    expect(JSON.stringify(body)).not.toContain("private verifier detail");
  });

  it("honors cancellation before backend work", () => {
    const backend: CFOPBackendV1Port = {
      solve: vi.fn(solveCFOPFromState),
      verify: verifyStateSolveResult,
    };
    const controller = new AbortController();
    controller.abort();

    expect(() =>
      new CFOPServiceV1({ backend }).execute(
        apiRequest() as never,
        { signal: controller.signal }
      )
    ).toThrowError(expect.objectContaining({ code: "CFOP_UNAVAILABLE" }));
    expect(backend.solve).not.toHaveBeenCalled();
  });

  it("bounds media type, body size, and methods", async () => {
    const mediaResponse = await POST(requestFromText("{}", "text/plain"));
    expect(mediaResponse.status).toBe(415);

    const sizeResponse = await POST(
      requestFromText("{}", "application/json", {
        "Content-Length": String(MAX_CFOP_BODY_BYTES_V1 + 1),
      })
    );
    expect(sizeResponse.status).toBe(413);

    const methodResponse = GET();
    expect(methodResponse.status).toBe(405);
    expect(methodResponse.headers.get("allow")).toBe("POST");
  });
});
