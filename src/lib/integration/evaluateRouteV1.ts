import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  atomicDemandStopServiceV1,
  type AtomicDemandStopServiceV1,
} from "./AtomicDemandStopServiceV1";
import {
  EVALUATE_HTTP_STATUS_V1,
  EvaluateV1Error,
  isEvaluateV1Error,
  normalizeEvaluateErrorV1,
  toEvaluateErrorValueV1,
} from "./evaluateErrorsV1";
import {
  EVALUATE_SCHEMA_VERSION_V1,
  type EvaluateApiErrorV1,
  type EvaluateApiSuccessV1,
  type EvaluateRequestV1,
} from "../../types/evaluate-v1";

export const MAX_EVALUATE_BODY_BYTES_V1 = 2 * 1024;

type EvaluateServicePortV1 = Pick<AtomicDemandStopServiceV1, "execute">;
export type RequestIdFactoryV1 = () => string;

export function createServerRequestIdV1(): string {
  return `request:${randomUUID()}`;
}

function responseHeaders(additional: HeadersInit = {}): Headers {
  const headers = new Headers(additional);
  headers.set("Cache-Control", "no-store");
  return headers;
}

function errorResponse(
  requestId: string,
  error: unknown,
  additionalHeaders: HeadersInit = {}
): NextResponse<EvaluateApiErrorV1> {
  const normalized = normalizeEvaluateErrorV1(error);

  return NextResponse.json(
    {
      schemaVersion: EVALUATE_SCHEMA_VERSION_V1,
      requestId,
      error: toEvaluateErrorValueV1(normalized),
    },
    {
      status: EVALUATE_HTTP_STATUS_V1[normalized.code],
      headers: responseHeaders(additionalHeaders),
    }
  );
}

function assertJsonMediaType(request: NextRequest): void {
  const contentType = request.headers.get("content-type");
  const mediaType = contentType?.split(";", 1)[0].trim().toLowerCase();

  if (mediaType !== "application/json") {
    throw new EvaluateV1Error("UNSUPPORTED_MEDIA_TYPE");
  }
}

function assertDeclaredBodySize(request: NextRequest): void {
  const contentLength = request.headers.get("content-length");

  if (contentLength === null) {
    return;
  }

  if (!/^\d+$/.test(contentLength)) {
    throw new EvaluateV1Error("INVALID_JSON");
  }

  if (Number(contentLength) > MAX_EVALUATE_BODY_BYTES_V1) {
    throw new EvaluateV1Error("REQUEST_TOO_LARGE");
  }
}

async function readBoundedBody(request: NextRequest): Promise<string> {
  assertDeclaredBodySize(request);

  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteLength = 0;
  let body = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      byteLength += value.byteLength;
      if (byteLength > MAX_EVALUATE_BODY_BYTES_V1) {
        await reader.cancel().catch(() => undefined);
        throw new EvaluateV1Error("REQUEST_TOO_LARGE");
      }

      body += decoder.decode(value, { stream: true });
    }

    body += decoder.decode();
    return body;
  } finally {
    reader.releaseLock();
  }
}

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

async function parseRequest(request: NextRequest): Promise<EvaluateRequestV1> {
  assertJsonMediaType(request);

  let parsed: unknown;

  try {
    parsed = JSON.parse(await readBoundedBody(request)) as unknown;
  } catch (error) {
    if (isEvaluateV1Error(error)) {
      throw error;
    }
    throw new EvaluateV1Error("INVALID_JSON");
  }

  if (!isRecord(parsed)) {
    throw new EvaluateV1Error("INVALID_JSON");
  }

  const clientRequestId = parsed.clientRequestId;
  const expectedRootKeys =
    parsed.clientRequestId === undefined
      ? ["cubeState", "schemaVersion"]
      : ["clientRequestId", "cubeState", "schemaVersion"];

  if (
    !hasExactKeys(parsed, expectedRootKeys) ||
    parsed.schemaVersion !== EVALUATE_SCHEMA_VERSION_V1 ||
    !isRecord(parsed.cubeState) ||
    !hasExactKeys(parsed.cubeState, ["facelets", "format"]) ||
    typeof parsed.cubeState.format !== "string" ||
    typeof parsed.cubeState.facelets !== "string" ||
    ("clientRequestId" in parsed &&
      (typeof clientRequestId !== "string" ||
        clientRequestId.length < 1 ||
        clientRequestId.length > 64))
  ) {
    throw new EvaluateV1Error("INVALID_JSON");
  }

  if (parsed.cubeState.format !== "URFDLB_FACELETS_V1") {
    throw new EvaluateV1Error("INVALID_CUBE_STATE");
  }

  const base = {
    schemaVersion: EVALUATE_SCHEMA_VERSION_V1,
    cubeState: Object.freeze({
      format: "URFDLB_FACELETS_V1" as const,
      facelets: parsed.cubeState.facelets,
    }),
  };

  return Object.freeze(
    clientRequestId === undefined
      ? base
      : { ...base, clientRequestId: clientRequestId as string }
  );
}

export function createEvaluatePostHandlerV1(
  service: EvaluateServicePortV1 = atomicDemandStopServiceV1,
  requestIdFactory: RequestIdFactoryV1 = createServerRequestIdV1
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest): Promise<NextResponse> => {
    const requestId = requestIdFactory();

    try {
      const parsed = await parseRequest(request);
      const result = await service.execute(parsed, {
        signal: request.signal,
      });
      const response: EvaluateApiSuccessV1 = {
        schemaVersion: EVALUATE_SCHEMA_VERSION_V1,
        requestId,
        result,
      };

      return NextResponse.json(response, {
        status: 200,
        headers: responseHeaders(),
      });
    } catch (error) {
      return errorResponse(requestId, error);
    }
  };
}

export function createMethodNotAllowedHandlerV1(
  requestIdFactory: RequestIdFactoryV1 = createServerRequestIdV1
): () => NextResponse<EvaluateApiErrorV1> {
  return () =>
    errorResponse(
      requestIdFactory(),
      new EvaluateV1Error("METHOD_NOT_ALLOWED"),
      { Allow: "POST" }
    );
}
