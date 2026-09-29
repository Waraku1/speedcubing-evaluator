import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  CFOP_INPUT_MODE_V1,
  CFOP_SCHEMA_VERSION_V1,
  type CFOPApiErrorV1,
  type CFOPApiSuccessV1,
  type CFOPRequestV1,
} from "../../types/cfop-v1";
import { cfopServiceV1, type CFOPServiceV1 } from "./CFOPServiceV1";
import {
  CFOP_HTTP_STATUS_V1,
  CFOPV1Error,
  isCFOPV1Error,
  normalizeCFOPErrorV1,
  toCFOPErrorValueV1,
} from "./cfopErrorsV1";

export const MAX_CFOP_BODY_BYTES_V1 = 2 * 1024;

type CFOPServicePortV1 = Pick<CFOPServiceV1, "execute">;
export type CFOPRequestIdFactoryV1 = () => string;

export function createCFOPRequestIdV1(): string {
  return `cfop-request:${randomUUID()}`;
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
): NextResponse<CFOPApiErrorV1> {
  const normalized = normalizeCFOPErrorV1(error);

  return NextResponse.json(
    {
      schemaVersion: CFOP_SCHEMA_VERSION_V1,
      requestId,
      error: toCFOPErrorValueV1(normalized),
    },
    {
      status: CFOP_HTTP_STATUS_V1[normalized.code],
      headers: responseHeaders(additionalHeaders),
    }
  );
}

function assertJsonMediaType(request: NextRequest): void {
  const contentType = request.headers.get("content-type");
  const mediaType = contentType?.split(";", 1)[0].trim().toLowerCase();

  if (mediaType !== "application/json") {
    throw new CFOPV1Error("UNSUPPORTED_MEDIA_TYPE");
  }
}

function assertDeclaredBodySize(request: NextRequest): void {
  const contentLength = request.headers.get("content-length");
  if (contentLength === null) return;

  if (!/^\d+$/.test(contentLength)) {
    throw new CFOPV1Error("INVALID_JSON");
  }

  if (Number(contentLength) > MAX_CFOP_BODY_BYTES_V1) {
    throw new CFOPV1Error("REQUEST_TOO_LARGE");
  }
}

async function readBoundedBody(request: NextRequest): Promise<string> {
  assertDeclaredBodySize(request);
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteLength = 0;
  let body = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      byteLength += value.byteLength;
      if (byteLength > MAX_CFOP_BODY_BYTES_V1) {
        await reader.cancel().catch(() => undefined);
        throw new CFOPV1Error("REQUEST_TOO_LARGE");
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
  value: Record<string, unknown>,
  keys: readonly string[]
): boolean {
  return Object.keys(value).sort().join("|") === [...keys].sort().join("|");
}

async function parseRequest(request: NextRequest): Promise<CFOPRequestV1> {
  assertJsonMediaType(request);

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readBoundedBody(request)) as unknown;
  } catch (error) {
    if (isCFOPV1Error(error)) throw error;
    throw new CFOPV1Error("INVALID_JSON");
  }

  if (
    !isRecord(parsed) ||
    !hasExactKeys(parsed, ["cubeState", "inputMode", "schemaVersion"]) ||
    parsed.schemaVersion !== CFOP_SCHEMA_VERSION_V1 ||
    typeof parsed.inputMode !== "string" ||
    !isRecord(parsed.cubeState) ||
    !hasExactKeys(parsed.cubeState, ["facelets", "format"]) ||
    typeof parsed.cubeState.facelets !== "string" ||
    typeof parsed.cubeState.format !== "string"
  ) {
    throw new CFOPV1Error("INVALID_JSON");
  }

  if (parsed.inputMode !== CFOP_INPUT_MODE_V1) {
    throw new CFOPV1Error("UNSUPPORTED_INPUT_MODE");
  }

  if (parsed.cubeState.format !== "URFDLB_FACELETS_V1") {
    throw new CFOPV1Error("INVALID_CUBE_STATE");
  }

  return Object.freeze({
    schemaVersion: CFOP_SCHEMA_VERSION_V1,
    inputMode: CFOP_INPUT_MODE_V1,
    cubeState: Object.freeze({
      format: "URFDLB_FACELETS_V1" as const,
      facelets: parsed.cubeState.facelets,
    }),
  });
}

export function createCFOPPostHandlerV1(
  service: CFOPServicePortV1 = cfopServiceV1,
  requestIdFactory: CFOPRequestIdFactoryV1 = createCFOPRequestIdV1
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest): Promise<NextResponse> => {
    const requestId = requestIdFactory();

    try {
      const parsed = await parseRequest(request);
      const result = service.execute(parsed, { signal: request.signal });
      const response: CFOPApiSuccessV1 = {
        schemaVersion: CFOP_SCHEMA_VERSION_V1,
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

export function createCFOPMethodNotAllowedHandlerV1(
  requestIdFactory: CFOPRequestIdFactoryV1 = createCFOPRequestIdV1
): () => NextResponse<CFOPApiErrorV1> {
  return () =>
    errorResponse(
      requestIdFactory(),
      new CFOPV1Error("METHOD_NOT_ALLOWED"),
      { Allow: "POST" }
    );
}
