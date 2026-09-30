import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import type { AuthUserV1 } from "../auth/authV1";
import { getAuthUserV1 } from "../auth/getAuthUserV1";
import { createPostgresSavedAnalysisRepositoryV1 } from "./PostgresSavedAnalysisRepositoryV1";
import type { SavedAnalysisRepositoryV1 } from "./SavedAnalysisRepositoryV1";
import { SavedAnalysisServiceV1 } from "./SavedAnalysisServiceV1";
import {
  isSavedAnalysisIdV1,
  parseSaveAnalysisRequestV1,
  parseSavedAnalysisListQueryV1,
  serializeSavedAnalysisListV1,
  serializeSavedAnalysisV1,
} from "./savedAnalysisContractV1";
import {
  SavedAnalysisV1Error,
  normalizeSavedAnalysisErrorV1,
  savedAnalysisErrorValueV1,
  savedAnalysisHttpStatusV1,
} from "./savedAnalysisErrorsV1";
import {
  SAVED_ANALYSIS_SCHEMA_VERSION_V1,
  type SavedAnalysisApiErrorV1,
  type SavedAnalysisCreateResponseV1,
  type SavedAnalysisDeleteResponseV1,
  type SavedAnalysisDetailResponseV1,
  type SavedAnalysisListResponseV1,
} from "../../types/saved-analysis-v1";

export const MAX_SAVED_ANALYSIS_BODY_BYTES_V1 = 2 * 1024;

export type SavedAnalysisRouteDependenciesV1 = Readonly<{
  authenticate?: () => Promise<AuthUserV1 | null>;
  repositoryFactory?: () => SavedAnalysisRepositoryV1;
  serviceFactory?: (
    repository: SavedAnalysisRepositoryV1
  ) => SavedAnalysisServiceV1;
  requestIdFactory?: () => string;
}>;

type DetailContextV1 = Readonly<{
  params: Promise<Readonly<{ id: string }>>;
}>;

function requestIdV1(): string {
  return `saved-analysis-request:${randomUUID()}`;
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
): NextResponse<SavedAnalysisApiErrorV1> {
  const normalized = normalizeSavedAnalysisErrorV1(error);
  return NextResponse.json(
    {
      schemaVersion: SAVED_ANALYSIS_SCHEMA_VERSION_V1,
      requestId,
      error: savedAnalysisErrorValueV1(normalized),
    },
    {
      status: savedAnalysisHttpStatusV1(normalized.code),
      headers: responseHeaders(additionalHeaders),
    }
  );
}

async function authenticatedService(
  dependencies: SavedAnalysisRouteDependenciesV1
): Promise<Readonly<{ user: AuthUserV1; service: SavedAnalysisServiceV1 }>> {
  const authenticate = dependencies.authenticate ?? getAuthUserV1;
  const user = await authenticate();
  if (user === null) throw new SavedAnalysisV1Error("UNAUTHORIZED");
  const repository = (
    dependencies.repositoryFactory ?? createPostgresSavedAnalysisRepositoryV1
  )();
  const service = dependencies.serviceFactory
    ? dependencies.serviceFactory(repository)
    : new SavedAnalysisServiceV1({ repository });
  return Object.freeze({ user, service });
}

function assertJsonMediaType(request: NextRequest): void {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    throw new SavedAnalysisV1Error("INVALID_REQUEST");
  }
}

async function readBoundedJson(request: NextRequest): Promise<unknown> {
  assertJsonMediaType(request);
  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^\d+$/.test(contentLength) ||
      Number(contentLength) > MAX_SAVED_ANALYSIS_BODY_BYTES_V1)
  ) {
    throw new SavedAnalysisV1Error("INVALID_REQUEST");
  }
  if (request.body === null) throw new SavedAnalysisV1Error("INVALID_REQUEST");

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_SAVED_ANALYSIS_BODY_BYTES_V1) {
        await reader.cancel().catch(() => undefined);
        throw new SavedAnalysisV1Error("INVALID_REQUEST");
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body) as unknown;
  } catch (error) {
    if (error instanceof SavedAnalysisV1Error) throw error;
    throw new SavedAnalysisV1Error("INVALID_REQUEST");
  } finally {
    reader.releaseLock();
  }
}

async function detailId(context: DetailContextV1): Promise<string> {
  const id = (await context.params).id;
  if (!isSavedAnalysisIdV1(id)) {
    throw new SavedAnalysisV1Error("NOT_FOUND");
  }
  return id;
}

export function createSavedAnalysisPostHandlerV1(
  dependencies: SavedAnalysisRouteDependenciesV1 = {}
): (request: NextRequest) => Promise<NextResponse> {
  return async (request) => {
    const requestId = (dependencies.requestIdFactory ?? requestIdV1)();
    try {
      const { user, service } = await authenticatedService(dependencies);
      const intent = parseSaveAnalysisRequestV1(await readBoundedJson(request));
      const savedAnalysis = serializeSavedAnalysisV1(
        await service.create(user.ownerId, intent, request.signal)
      );
      const response: SavedAnalysisCreateResponseV1 = {
        schemaVersion: SAVED_ANALYSIS_SCHEMA_VERSION_V1,
        requestId,
        savedAnalysis,
      };
      return NextResponse.json(response, {
        status: 201,
        headers: responseHeaders(),
      });
    } catch (error) {
      return errorResponse(requestId, error);
    }
  };
}

export function createSavedAnalysisListHandlerV1(
  dependencies: SavedAnalysisRouteDependenciesV1 = {}
): (request: NextRequest) => Promise<NextResponse> {
  return async (request) => {
    const requestId = (dependencies.requestIdFactory ?? requestIdV1)();
    try {
      const { user, service } = await authenticatedService(dependencies);
      const list = serializeSavedAnalysisListV1(
        await service.list(
          user.ownerId,
          parseSavedAnalysisListQueryV1(request.nextUrl)
        )
      );
      const response: SavedAnalysisListResponseV1 = {
        schemaVersion: SAVED_ANALYSIS_SCHEMA_VERSION_V1,
        requestId,
        list,
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

export function createSavedAnalysisDetailHandlerV1(
  dependencies: SavedAnalysisRouteDependenciesV1 = {}
): (request: NextRequest, context: DetailContextV1) => Promise<NextResponse> {
  return async (_request, context) => {
    const requestId = (dependencies.requestIdFactory ?? requestIdV1)();
    try {
      const { user, service } = await authenticatedService(dependencies);
      const savedAnalysis = serializeSavedAnalysisV1(
        await service.find(user.ownerId, await detailId(context))
      );
      const response: SavedAnalysisDetailResponseV1 = {
        schemaVersion: SAVED_ANALYSIS_SCHEMA_VERSION_V1,
        requestId,
        savedAnalysis,
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

export function createSavedAnalysisDeleteHandlerV1(
  dependencies: SavedAnalysisRouteDependenciesV1 = {}
): (request: NextRequest, context: DetailContextV1) => Promise<NextResponse> {
  return async (_request, context) => {
    const requestId = (dependencies.requestIdFactory ?? requestIdV1)();
    try {
      const { user, service } = await authenticatedService(dependencies);
      await service.delete(user.ownerId, await detailId(context));
      const response: SavedAnalysisDeleteResponseV1 = {
        schemaVersion: SAVED_ANALYSIS_SCHEMA_VERSION_V1,
        requestId,
        deleted: true,
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

export function createSavedAnalysisMethodNotAllowedHandlerV1(
  allow: string,
  dependencies: SavedAnalysisRouteDependenciesV1 = {}
): () => NextResponse {
  return () =>
    errorResponse(
      (dependencies.requestIdFactory ?? requestIdV1)(),
      new SavedAnalysisV1Error("INVALID_REQUEST"),
      { Allow: allow }
    );
}
