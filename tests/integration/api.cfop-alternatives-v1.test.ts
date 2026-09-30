import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import * as routeModule from "../../src/app/api/cfop/alternatives/route";
import { GET, POST } from "../../src/app/api/cfop/alternatives/route";
import {
  solveCFOPAlternativesFromState,
  verifyStateSolveResult,
} from "../../src/lib/cfop-solver/cfop-solver";
import { applyMoves, SOLVED_STATE } from "../../src/lib/cube/moves";
import {
  CFOPAlternativesServiceV1,
  type CFOPAlternativesBackendV1Port,
} from "../../src/lib/integration/CFOPAlternativesServiceV1";
import {
  MAX_CFOP_ALTERNATIVES_BODY_BYTES_V1,
  createCFOPAlternativesPostHandlerV1,
} from "../../src/lib/integration/cfopAlternativesRouteV1";
import type {
  CFOPAlternativesApiErrorV1,
  CFOPAlternativesApiResponseV1,
  CFOPAlternativesResultV1,
} from "../../src/types/cfop-alternatives-v1";
import { SOLVED_FACELETS_V1 } from "../../src/types/solver-v1";

const REQUEST_ID = "cfop-alternatives-request:integration";

function requestFromText(
  body: string,
  contentType = "application/json",
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest("http://localhost/api/cfop/alternatives", {
    method: "POST",
    body,
    headers: { "Content-Type": contentType, ...headers },
  });
}

function apiRequest(
  facelets = SOLVED_FACELETS_V1,
  maxAlternatives = 3,
): Record<string, unknown> {
  return {
    schemaVersion: "1.0",
    inputMode: "FACELET_STATE",
    cubeState: { format: "URFDLB_FACELETS_V1", facelets },
    maxAlternatives,
  };
}

function jsonRequest(body: unknown): NextRequest {
  return requestFromText(JSON.stringify(body));
}

async function responseBody(
  response: Response,
): Promise<CFOPAlternativesApiResponseV1> {
  return (await response.json()) as CFOPAlternativesApiResponseV1;
}

async function successBody(response: Response): Promise<CFOPAlternativesResultV1> {
  const body = await responseBody(response);
  if (!("alternatives" in body)) throw new Error(`Expected success: ${body.error.code}`);
  return body;
}

async function errorBody(response: Response): Promise<CFOPAlternativesApiErrorV1> {
  const body = await responseBody(response);
  if (!("error" in body)) throw new Error("Expected error response");
  return body;
}

function handlerFor(service: CFOPAlternativesServiceV1) {
  return createCFOPAlternativesPostHandlerV1(service, () => REQUEST_ID);
}

describe("POST /api/cfop/alternatives", () => {
  it("exports only supported App Router symbols", () => {
    expect(Object.keys(routeModule).sort()).toEqual([
      "DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT", "runtime",
    ]);
  });

  it.each([2, 3, 4])("accepts the bounded limit %i", async (limit) => {
    const response = await POST(jsonRequest(apiRequest(SOLVED_FACELETS_V1, limit)));
    const body = await successBody(response);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.requestedLimit).toBe(limit);
    expect(body.generatedCount).toBe(1);
    expect(body.alternatives[0].strategy).toBe("DEFAULT");
    expect(body.alternatives[0].solution.moves).toEqual([]);
  });

  it("returns distinct solutions that independently solve the supplied state", async () => {
    const facelets = applyMoves(SOLVED_STATE, ["R", "U"]);
    const response = await POST(jsonRequest(apiRequest(facelets, 4)));
    const body = await successBody(response);

    expect(body.schemaId).toBe("CFOPAlternativesV1");
    expect(body.generatedCount).toBeGreaterThanOrEqual(2);
    expect(body.generatedCount).toBeLessThanOrEqual(4);
    const keys = body.alternatives.map((alternative) =>
      alternative.solution.moves.join(" "),
    );
    expect(new Set(keys).size).toBe(keys.length);
    for (const alternative of body.alternatives) {
      expect(alternative.solution.verified).toBe(true);
      expect(applyMoves(facelets, alternative.solution.moves)).toBe(SOLVED_STATE);
    }
  });

  it("rejects invalid limits, missing fields, and extra fields", async () => {
    for (const value of [
      {},
      { ...apiRequest(), extra: true },
      { ...apiRequest(), maxAlternatives: 1 },
      { ...apiRequest(), maxAlternatives: 5 },
      { ...apiRequest(), maxAlternatives: 2.5 },
      { ...apiRequest(), maxAlternatives: "3" },
      { ...apiRequest(), cubeState: {
        ...(apiRequest().cubeState as object),
        extra: true,
      } },
    ]) {
      const response = await POST(jsonRequest(value));
      expect(response.status).toBe(400);
      expect((await errorBody(response)).error.code).toBe("INVALID_JSON");
    }
  });

  it("uses the existing safe validation and backend error semantics", async () => {
    const unsupported = await POST(jsonRequest({
      ...apiRequest(),
      inputMode: "SCRAMBLE_HISTORY",
    }));
    expect(unsupported.status).toBe(422);
    expect((await errorBody(unsupported)).error.code).toBe("UNSUPPORTED_INPUT_MODE");

    const backend: CFOPAlternativesBackendV1Port = {
      solve: vi.fn(() => {
        throw new Error("sensitive alternatives backend detail");
      }),
      verify: vi.fn(() => true),
    };
    const failed = await handlerFor(new CFOPAlternativesServiceV1({ backend }))(
      jsonRequest(apiRequest()),
    );
    const failedBody = await errorBody(failed);
    expect(failed.status).toBe(503);
    expect(failedBody.error.code).toBe("CFOP_UNAVAILABLE");
    expect(JSON.stringify(failedBody)).not.toContain("sensitive alternatives backend detail");
  });

  it("fails the request when the canonical verifier rejects the result", async () => {
    const backend: CFOPAlternativesBackendV1Port = {
      solve: solveCFOPAlternativesFromState,
      verify: vi.fn(() => false),
    };
    const response = await handlerFor(new CFOPAlternativesServiceV1({ backend }))(
      jsonRequest(apiRequest()),
    );
    expect(response.status).toBe(502);
    expect((await errorBody(response)).error.code).toBe("CFOP_VERIFICATION_FAILED");
  });

  it("bounds media type, body size, and methods", async () => {
    expect((await POST(requestFromText("{}", "text/plain"))).status).toBe(415);
    expect((await POST(requestFromText("{}", "application/json", {
      "Content-Length": String(MAX_CFOP_ALTERNATIVES_BODY_BYTES_V1 + 1),
    }))).status).toBe(413);
    expect((await POST(requestFromText(
      JSON.stringify({ padding: "x".repeat(MAX_CFOP_ALTERNATIVES_BODY_BYTES_V1) }),
    ))).status).toBe(413);

    const methodResponse = GET();
    expect(methodResponse.status).toBe(405);
    expect(methodResponse.headers.get("allow")).toBe("POST");
  });

  it("honors cancellation before solver work", () => {
    const backend: CFOPAlternativesBackendV1Port = {
      solve: vi.fn(solveCFOPAlternativesFromState),
      verify: verifyStateSolveResult,
    };
    const controller = new AbortController();
    controller.abort();
    expect(() => new CFOPAlternativesServiceV1({ backend }).execute(
      apiRequest() as never,
      { signal: controller.signal },
    )).toThrowError(expect.objectContaining({ code: "CFOP_UNAVAILABLE" }));
    expect(backend.solve).not.toHaveBeenCalled();
  });
});
