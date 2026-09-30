import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as collectionRoute from "../../src/app/api/procedure-logs/route";
import * as detailRoute from "../../src/app/api/procedure-logs/[id]/route";
import type { AuthUserV1 } from "../../src/lib/auth/authV1";
import { applyMoves, SOLVED_STATE } from "../../src/lib/cube/moves";
import type {
  ProcedureLogListRecordV1,
  ProcedureLogRecordPageV1,
  ProcedureLogRecordV1,
  ProcedureLogRepositoryV1,
} from "../../src/lib/procedure-log/ProcedureLogRepositoryV1";
import { ProcedureLogServiceV1 } from "../../src/lib/procedure-log/ProcedureLogServiceV1";
import {
  createProcedureLogDeleteHandlerV1,
  createProcedureLogDetailHandlerV1,
  createProcedureLogListHandlerV1,
  createProcedureLogPostHandlerV1,
} from "../../src/lib/procedure-log/procedureLogRouteV1";
import { ProcedureLogV1Error } from "../../src/lib/procedure-log/procedureLogErrorsV1";

const USER_A: AuthUserV1 = { ownerId: "github:1001", displayName: "User A" };
const USER_B: AuthUserV1 = { ownerId: "github:2002", displayName: "User B" };
const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const INPUT = applyMoves(SOLVED_STATE, ["R2"]);

function metadata(record: ProcedureLogRecordV1): ProcedureLogListRecordV1 {
  return {
    id: record.id,
    ownerId: record.ownerId,
    schemaVersion: record.schemaVersion,
    ...(record.label === undefined ? {} : { label: record.label }),
    cubeFormat: record.cubeFormat,
    cubeStateId: record.cubeStateId,
    htm: record.htm,
    qtm: record.qtm,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

class FakeRepository implements ProcedureLogRepositoryV1 {
  readonly records = new Map<string, ProcedureLogRecordV1>();

  async create(record: ProcedureLogRecordV1): Promise<ProcedureLogRecordV1> {
    this.records.set(record.id, record);
    return record;
  }

  async listByOwner(
    ownerId: string,
    query: { limit: number; cursor?: { createdAt: string; id: string } },
  ): Promise<ProcedureLogRecordPageV1> {
    const records = [...this.records.values()]
      .filter((record) => record.ownerId === ownerId)
      .sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt) ||
        right.id.localeCompare(left.id));
    const filtered = query.cursor === undefined
      ? records
      : records.filter((record) =>
          record.createdAt < query.cursor!.createdAt ||
          (record.createdAt === query.cursor!.createdAt &&
            record.id < query.cursor!.id));
    return { records: filtered.slice(0, query.limit).map(metadata) };
  }

  async findByOwnerAndId(
    ownerId: string,
    id: string,
  ): Promise<ProcedureLogRecordV1 | null> {
    const record = this.records.get(id);
    return record?.ownerId === ownerId ? record : null;
  }

  async deleteByOwnerAndId(ownerId: string, id: string): Promise<boolean> {
    const record = this.records.get(id);
    return record?.ownerId === ownerId ? this.records.delete(id) : false;
  }
}

function requestBody(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1.0",
    cubeState: { format: "URFDLB_FACELETS_V1", facelets: INPUT },
    moves: ["R2"],
    label: "  Acceptance procedure  ",
    ...overrides,
  };
}

function postRequest(body: unknown = requestBody()): NextRequest {
  return new NextRequest("http://localhost/api/procedure-logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest(path = "/api/procedure-logs"): NextRequest {
  return new NextRequest(`http://localhost${path}`);
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("Procedure Log V1 authenticated API", () => {
  let repository: FakeRepository;
  let currentUser: AuthUserV1 | null;
  let nextId: string;

  beforeEach(() => {
    repository = new FakeRepository();
    currentUser = USER_A;
    nextId = ID_A;
  });

  function dependencies() {
    return {
      authenticate: async () => currentUser,
      repositoryFactory: () => repository,
      serviceFactory: (storage: ProcedureLogRepositoryV1) =>
        new ProcedureLogServiceV1({
          repository: storage,
          idFactory: () => nextId,
          now: () => new Date(
            nextId === ID_A
              ? "2026-09-30T01:00:00.000Z"
              : "2026-09-30T02:00:00.000Z",
          ),
        }),
      requestIdFactory: () => "procedure-log-request:test",
    };
  }

  it("exports bounded collection and detail method surfaces", () => {
    expect(Object.keys(collectionRoute).sort()).toEqual([
      "DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT", "runtime",
    ]);
    expect(Object.keys(detailRoute).sort()).toEqual([
      "DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT", "runtime",
    ]);
  });

  it("supports authenticated CRUD with server-derived identity and metrics", async () => {
    const createResponse = await createProcedureLogPostHandlerV1(dependencies())(
      postRequest(),
    );
    const created = await createResponse.json();
    expect(createResponse.status).toBe(201);
    expect(createResponse.headers.get("cache-control")).toBe("no-store");
    expect(created.procedureLog).toMatchObject({
      id: ID_A,
      label: "Acceptance procedure",
      moves: ["R2"],
      moveCount: 1,
      htm: 1,
      qtm: 2,
    });
    expect(created.procedureLog.cubeState.stateId).toMatch(/^[a-f0-9]{64}$/);
    expect(created.procedureLog).not.toHaveProperty("ownerId");
    expect(repository.records.get(ID_A)?.ownerId).toBe(USER_A.ownerId);

    const listResponse = await createProcedureLogListHandlerV1(dependencies())(
      getRequest(),
    );
    const list = await listResponse.json();
    expect(list.list.items).toEqual([
      expect.objectContaining({ id: ID_A, moveCount: 1, htm: 1, qtm: 2 }),
    ]);
    expect(list.list.items[0]).not.toHaveProperty("moves");
    expect(list.list.items[0].cubeState).not.toHaveProperty("facelets");

    const detailResponse = await createProcedureLogDetailHandlerV1(dependencies())(
      getRequest(`/api/procedure-logs/${ID_A}`),
      context(ID_A),
    );
    expect(detailResponse.status).toBe(200);
    expect((await detailResponse.json()).procedureLog.moves).toEqual(["R2"]);

    const deleteResponse = await createProcedureLogDeleteHandlerV1(dependencies())(
      getRequest(`/api/procedure-logs/${ID_A}`),
      context(ID_A),
    );
    expect(deleteResponse.status).toBe(200);
    expect(await deleteResponse.json()).toMatchObject({ deleted: true });
    expect(repository.records.has(ID_A)).toBe(false);
  });

  it("keeps Account A isolated from Account B list, direct GET, and DELETE", async () => {
    await createProcedureLogPostHandlerV1(dependencies())(postRequest());
    currentUser = USER_B;
    nextId = ID_B;

    const listResponse = await createProcedureLogListHandlerV1(dependencies())(
      getRequest(),
    );
    expect((await listResponse.json()).list.items).toEqual([]);

    const detailResponse = await createProcedureLogDetailHandlerV1(dependencies())(
      getRequest(`/api/procedure-logs/${ID_A}`),
      context(ID_A),
    );
    expect(detailResponse.status).toBe(404);
    expect((await detailResponse.json()).error.code).toBe("NOT_FOUND");

    const deleteResponse = await createProcedureLogDeleteHandlerV1(dependencies())(
      getRequest(`/api/procedure-logs/${ID_A}`),
      context(ID_A),
    );
    expect(deleteResponse.status).toBe(404);
    expect((await deleteResponse.json()).error.code).toBe("NOT_FOUND");
    expect(repository.records.has(ID_A)).toBe(true);
  });

  it("authenticates before parsing the body or constructing storage", async () => {
    currentUser = null;
    const storage = vi.fn(() => repository);
    const malformed = new NextRequest("http://localhost/api/procedure-logs", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "not-json",
    });
    const response = await createProcedureLogPostHandlerV1({
      ...dependencies(),
      repositoryFactory: storage,
    })(malformed);
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
    expect(storage).not.toHaveBeenCalled();

    currentUser = USER_A;
    const invalidResponse = await createProcedureLogPostHandlerV1({
      ...dependencies(),
      repositoryFactory: storage,
    })(malformed);
    expect(invalidResponse.status).toBe(400);
    expect(storage).not.toHaveBeenCalled();
  });

  it("rejects client ownership, invalid moves, and non-solving procedures", async () => {
    const ownerResponse = await createProcedureLogPostHandlerV1(dependencies())(
      postRequest(requestBody({ ownerId: USER_B.ownerId })),
    );
    expect(ownerResponse.status).toBe(400);
    expect((await ownerResponse.json()).error.code).toBe("INVALID_REQUEST");

    const invalidMove = await createProcedureLogPostHandlerV1(dependencies())(
      postRequest(requestBody({ moves: ["Rw"] })),
    );
    expect(invalidMove.status).toBe(422);
    expect((await invalidMove.json()).error.code).toBe("INVALID_MOVE_SEQUENCE");

    const nonSolving = await createProcedureLogPostHandlerV1(dependencies())(
      postRequest(requestBody({ moves: [] })),
    );
    expect(nonSolving.status).toBe(422);
    expect((await nonSolving.json()).error.code).toBe("PROCEDURE_DOES_NOT_SOLVE");
    expect(repository.records.size).toBe(0);
  });

  it("maps invalid cube and unavailable storage without leaking private details", async () => {
    const invalid = await createProcedureLogPostHandlerV1(dependencies())(
      postRequest(requestBody({
        cubeState: { format: "URFDLB_FACELETS_V1", facelets: "X".repeat(54) },
        moves: [],
      })),
    );
    expect(invalid.status).toBe(422);
    expect((await invalid.json()).error.code).toBe("INVALID_CUBE_STATE");

    const unavailable = await createProcedureLogListHandlerV1({
      authenticate: async () => USER_A,
      repositoryFactory: () => {
        throw new ProcedureLogV1Error("STORAGE_UNAVAILABLE");
      },
      requestIdFactory: () => "procedure-log-request:test",
    })(getRequest());
    const payload = await unavailable.json();
    expect(unavailable.status).toBe(503);
    expect(payload.error.code).toBe("STORAGE_UNAVAILABLE");
    expect(JSON.stringify(payload)).not.toMatch(
      /postgres|DATABASE_URL|hostname|oauth|stack/i,
    );
  });
});
