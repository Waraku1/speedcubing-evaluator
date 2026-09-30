import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import type { AuthUserV1 } from "../auth/authV1";
import { getAuthUserV1 } from "../auth/getAuthUserV1";
import { createPostgresProcedureLogRepositoryV1 } from "./PostgresProcedureLogRepositoryV1";
import type { ProcedureLogRepositoryV1 } from "./ProcedureLogRepositoryV1";
import { ProcedureLogServiceV1 } from "./ProcedureLogServiceV1";
import {
  isProcedureLogIdV1,
  parseCreateProcedureLogRequestV1,
  parseProcedureLogListQueryV1,
  serializeProcedureLogListV1,
  serializeProcedureLogV1,
} from "./procedureLogContractV1";
import {
  ProcedureLogV1Error,
  normalizeProcedureLogErrorV1,
  procedureLogErrorValueV1,
  procedureLogHttpStatusV1,
} from "./procedureLogErrorsV1";
import {
  PROCEDURE_LOG_SCHEMA_VERSION_V1,
  type ProcedureLogApiErrorV1,
  type ProcedureLogCreateResponseV1,
  type ProcedureLogDeleteResponseV1,
  type ProcedureLogDetailResponseV1,
  type ProcedureLogListResponseV1,
} from "../../types/procedure-log-v1";

export const MAX_PROCEDURE_LOG_BODY_BYTES_V1 = 16 * 1024;

export type ProcedureLogRouteDependenciesV1 = Readonly<{
  authenticate?: () => Promise<AuthUserV1 | null>;
  repositoryFactory?: () => ProcedureLogRepositoryV1;
  serviceFactory?: (
    repository: ProcedureLogRepositoryV1,
  ) => ProcedureLogServiceV1;
  requestIdFactory?: () => string;
}>;

type DetailContextV1 = Readonly<{
  params: Promise<Readonly<{ id: string }>>;
}>;

function requestIdV1(): string {
  return `procedure-log-request:${randomUUID()}`;
}

function responseHeaders(additional: HeadersInit = {}): Headers {
  const headers = new Headers(additional);
  headers.set("Cache-Control", "no-store");
  return headers;
}

function errorResponse(
  requestId: string,
  error: unknown,
  additionalHeaders: HeadersInit = {},
): NextResponse<ProcedureLogApiErrorV1> {
  const normalized = normalizeProcedureLogErrorV1(error);
  return NextResponse.json(
    {
      schemaVersion: PROCEDURE_LOG_SCHEMA_VERSION_V1,
      requestId,
      error: procedureLogErrorValueV1(normalized),
    },
    {
      status: procedureLogHttpStatusV1(normalized.code),
      headers: responseHeaders(additionalHeaders),
    },
  );
}

async function authenticatedUser(
  dependencies: ProcedureLogRouteDependenciesV1,
): Promise<AuthUserV1> {
  const authenticate = dependencies.authenticate ?? getAuthUserV1;
  const user = await authenticate();
  if (user === null) throw new ProcedureLogV1Error("UNAUTHORIZED");
  return user;
}

function serviceFor(
  dependencies: ProcedureLogRouteDependenciesV1,
): ProcedureLogServiceV1 {
  const repository = (
    dependencies.repositoryFactory ?? createPostgresProcedureLogRepositoryV1
  )();
  return dependencies.serviceFactory
    ? dependencies.serviceFactory(repository)
    : new ProcedureLogServiceV1({ repository });
}

function assertJsonMediaType(request: NextRequest): void {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    throw new ProcedureLogV1Error("INVALID_REQUEST");
  }
}

async function readBoundedJson(request: NextRequest): Promise<unknown> {
  assertJsonMediaType(request);
  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^\d+$/.test(contentLength) ||
      Number(contentLength) > MAX_PROCEDURE_LOG_BODY_BYTES_V1)
  ) {
    throw new ProcedureLogV1Error("INVALID_REQUEST");
  }
  if (request.body === null) throw new ProcedureLogV1Error("INVALID_REQUEST");

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_PROCEDURE_LOG_BODY_BYTES_V1) {
        await reader.cancel().catch(() => undefined);
        throw new ProcedureLogV1Error("INVALID_REQUEST");
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body) as unknown;
  } catch (error) {
    if (error instanceof ProcedureLogV1Error) throw error;
    throw new ProcedureLogV1Error("INVALID_REQUEST");
  } finally {
    reader.releaseLock();
  }
}

async function detailId(context: DetailContextV1): Promise<string> {
  const id = (await context.params).id;
  if (!isProcedureLogIdV1(id)) {
    throw new ProcedureLogV1Error("NOT_FOUND");
  }
  return id;
}

export function createProcedureLogPostHandlerV1(
  dependencies: ProcedureLogRouteDependenciesV1 = {},
): (request: NextRequest) => Promise<NextResponse> {
  return async (request) => {
    const requestId = (dependencies.requestIdFactory ?? requestIdV1)();
    try {
      const user = await authenticatedUser(dependencies);
      const intent = parseCreateProcedureLogRequestV1(
        await readBoundedJson(request),
      );
      const service = serviceFor(dependencies);
      const procedureLog = serializeProcedureLogV1(
        await service.create(user.ownerId, intent),
      );
      const response: ProcedureLogCreateResponseV1 = {
        schemaVersion: PROCEDURE_LOG_SCHEMA_VERSION_V1,
        requestId,
        procedureLog,
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

export function createProcedureLogListHandlerV1(
  dependencies: ProcedureLogRouteDependenciesV1 = {},
): (request: NextRequest) => Promise<NextResponse> {
  return async (request) => {
    const requestId = (dependencies.requestIdFactory ?? requestIdV1)();
    try {
      const user = await authenticatedUser(dependencies);
      const query = parseProcedureLogListQueryV1(request.nextUrl);
      const service = serviceFor(dependencies);
      const list = serializeProcedureLogListV1(
        await service.list(user.ownerId, query),
      );
      const response: ProcedureLogListResponseV1 = {
        schemaVersion: PROCEDURE_LOG_SCHEMA_VERSION_V1,
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

export function createProcedureLogDetailHandlerV1(
  dependencies: ProcedureLogRouteDependenciesV1 = {},
): (request: NextRequest, context: DetailContextV1) => Promise<NextResponse> {
  return async (_request, context) => {
    const requestId = (dependencies.requestIdFactory ?? requestIdV1)();
    try {
      const user = await authenticatedUser(dependencies);
      const id = await detailId(context);
      const service = serviceFor(dependencies);
      const procedureLog = serializeProcedureLogV1(
        await service.find(user.ownerId, id),
      );
      const response: ProcedureLogDetailResponseV1 = {
        schemaVersion: PROCEDURE_LOG_SCHEMA_VERSION_V1,
        requestId,
        procedureLog,
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

export function createProcedureLogDeleteHandlerV1(
  dependencies: ProcedureLogRouteDependenciesV1 = {},
): (request: NextRequest, context: DetailContextV1) => Promise<NextResponse> {
  return async (_request, context) => {
    const requestId = (dependencies.requestIdFactory ?? requestIdV1)();
    try {
      const user = await authenticatedUser(dependencies);
      const id = await detailId(context);
      const service = serviceFor(dependencies);
      await service.delete(user.ownerId, id);
      const response: ProcedureLogDeleteResponseV1 = {
        schemaVersion: PROCEDURE_LOG_SCHEMA_VERSION_V1,
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

export function createProcedureLogMethodNotAllowedHandlerV1(
  allow: string,
  dependencies: ProcedureLogRouteDependenciesV1 = {},
): () => NextResponse {
  return () => errorResponse(
    (dependencies.requestIdFactory ?? requestIdV1)(),
    new ProcedureLogV1Error("INVALID_REQUEST"),
    { Allow: allow },
  );
}
