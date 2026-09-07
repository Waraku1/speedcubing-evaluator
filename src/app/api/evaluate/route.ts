import { NextRequest, NextResponse } from "next/server";

import {
  atomicDemandStopServiceV1,
  type AtomicDemandStopServiceV1,
} from "../../../lib/integration/AtomicDemandStopServiceV1";
import {
  EVALUATE_HTTP_STATUS_V1,
  EvaluateV1Error,
  isEvaluateV1Error,
  normalizeEvaluateErrorV1,
  toEvaluateErrorValueV1,
} from "../../../lib/integration/evaluateErrorsV1";
import type {
  EvaluateApiErrorV1,
  EvaluateApiSuccessV1,
  EvaluateRequestV1,
} from "../../../types/evaluate-v1";

export const runtime = "nodejs";
export const MAX_EVALUATE_BODY_BYTES_V1 = 2 * 1024;

type EvaluateServicePortV1 = Pick<AtomicDemandStopServiceV1, "execute">;

function responseHeaders(additional: HeadersInit = {}): Headers {
  const headers = new Headers(additional);
  headers.set("Cache-Control", "no-store");
  return headers;
}

function errorResponse(
  error: unknown,
  additionalHeaders: HeadersInit = {}
): NextResponse<EvaluateApiErrorV1> {
  const normalized = normalizeEvaluateErrorV1(error);

  return NextResponse.json(
    {
      success: false,
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
    throw new EvaluateV1Error("INVALID_REQUEST");
  }

  if (Number(contentLength) > MAX_EVALUATE_BODY_BYTES_V1) {
    throw new EvaluateV1Error("PAYLOAD_TOO_LARGE");
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
        throw new EvaluateV1Error("PAYLOAD_TOO_LARGE");
      }

      body += decoder.decode(value, { stream: true });
    }

    body += decoder.decode();
    return body;
  } finally {
    reader.releaseLock();
  }
}

async function parseRequest(request: NextRequest): Promise<EvaluateRequestV1> {
  assertJsonMediaType(request);

  let body: string;
  let parsed: unknown;

  try {
    body = await readBoundedBody(request);
    parsed = JSON.parse(body) as unknown;
  } catch (error) {
    if (isEvaluateV1Error(error)) {
      throw error;
    }
    throw new EvaluateV1Error("INVALID_REQUEST");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new EvaluateV1Error("INVALID_REQUEST");
  }

  const record = parsed as Record<string, unknown>;

  if (
    Object.keys(record).length !== 1 ||
    !("facelets" in record) ||
    typeof record.facelets !== "string"
  ) {
    throw new EvaluateV1Error("INVALID_REQUEST");
  }

  return Object.freeze({ facelets: record.facelets });
}

export function createEvaluatePostHandlerV1(
  service: EvaluateServicePortV1 = atomicDemandStopServiceV1
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      const parsed = await parseRequest(request);
      const data = await service.execute(parsed, { signal: request.signal });
      const response: EvaluateApiSuccessV1 = { success: true, data };

      return NextResponse.json(response, {
        status: 200,
        headers: responseHeaders(),
      });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export const POST = createEvaluatePostHandlerV1();

function methodNotAllowed(): NextResponse<EvaluateApiErrorV1> {
  return errorResponse(new EvaluateV1Error("METHOD_NOT_ALLOWED"), {
    Allow: "POST",
  });
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
export const HEAD = methodNotAllowed;
