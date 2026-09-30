import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthUserV1 } from "../../src/lib/auth/authV1";
import { createCubeFaceletStateV1 } from "../../src/lib/cube/cubeStateV1";
import { EvaluateV1Error } from "../../src/lib/integration/evaluateErrorsV1";
import type {
  SavedAnalysisRecordPageV1,
  SavedAnalysisListRecordV1,
  SavedAnalysisRecordV1,
  SavedAnalysisRepositoryV1,
} from "../../src/lib/saved-analysis/SavedAnalysisRepositoryV1";
import { SavedAnalysisServiceV1 } from "../../src/lib/saved-analysis/SavedAnalysisServiceV1";
import {
  createSavedAnalysisDeleteHandlerV1,
  createSavedAnalysisDetailHandlerV1,
  createSavedAnalysisListHandlerV1,
  createSavedAnalysisPostHandlerV1,
} from "../../src/lib/saved-analysis/savedAnalysisRouteV1";
import { SavedAnalysisV1Error } from "../../src/lib/saved-analysis/savedAnalysisErrorsV1";
import type { CFOPRequestV1, CFOPResultV1 } from "../../src/types/cfop-v1";
import type { EvaluateResultV1 } from "../../src/types/evaluate-v1";
import { SOLVED_FACELETS_V1 } from "../../src/types/solver-v1";
import * as collectionRoute from "../../src/app/api/saved-analyses/route";
import * as detailRoute from "../../src/app/api/saved-analyses/[id]/route";

const USER_A: AuthUserV1 = { ownerId: "github:1001", displayName: "User A" };
const USER_B: AuthUserV1 = { ownerId: "github:2002", displayName: "User B" };
const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const cfopCalls = vi.fn((request: CFOPRequestV1) =>
  cfopResult(request.cubeState.facelets)
);

class FakeRepository implements SavedAnalysisRepositoryV1 {
  readonly records = new Map<string, SavedAnalysisRecordV1>();

  async create(record: SavedAnalysisRecordV1): Promise<SavedAnalysisRecordV1> {
    this.records.set(record.id, record);
    return record;
  }

  async listByOwner(ownerId: string, query: { limit: number; cursor?: { createdAt: string; id: string } }): Promise<SavedAnalysisRecordPageV1> {
    const records = [...this.records.values()]
      .filter((record) => record.ownerId === ownerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
    const start = query.cursor === undefined
      ? 0
      : records.findIndex((record) => record.createdAt < query.cursor!.createdAt || (record.createdAt === query.cursor!.createdAt && record.id < query.cursor!.id));
    const page: SavedAnalysisListRecordV1[] = records
      .slice(Math.max(0, start), Math.max(0, start) + query.limit)
      .map((record) => ({
        id: record.id,
        ownerId: record.ownerId,
        schemaVersion: record.schemaVersion,
        ...(record.label === undefined ? {} : { label: record.label }),
        cubeFormat: record.cubeFormat,
        cubeStateId: record.cubeStateId,
        ...(record.cfopSchemaVersion === undefined
          ? {}
          : { cfopSchemaVersion: record.cfopSchemaVersion }),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }));
    return { records: page };
  }

  async findByOwnerAndId(ownerId: string, id: string): Promise<SavedAnalysisRecordV1 | null> {
    const record = this.records.get(id);
    return record?.ownerId === ownerId ? record : null;
  }

  async deleteByOwnerAndId(ownerId: string, id: string): Promise<boolean> {
    const record = this.records.get(id);
    return record?.ownerId === ownerId ? this.records.delete(id) : false;
  }
}

function analysisSnapshot(facelets: string): EvaluateResultV1 {
  const cube = createCubeFaceletStateV1(facelets);
  return {
    cubeState: { stateId: cube.stateId, format: cube.format },
  } as unknown as EvaluateResultV1;
}

function cfopResult(facelets: string): CFOPResultV1 {
  const cube = createCubeFaceletStateV1(facelets);
  return {
    input: { stateId: cube.stateId, format: cube.format, inputMode: "FACELET_STATE" },
  } as unknown as CFOPResultV1;
}

function postRequest(facelets = SOLVED_FACELETS_V1, includeCfop = false): NextRequest {
  return new NextRequest("http://localhost/api/saved-analyses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      schemaVersion: "1.0",
      cubeState: { format: "URFDLB_FACELETS_V1", facelets },
      includeCfop,
      label: "  Acceptance record  ",
    }),
  });
}

function getRequest(path = "/api/saved-analyses"): NextRequest {
  return new NextRequest(`http://localhost${path}`);
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("Saved Analysis V1 authenticated API", () => {
  let repository: FakeRepository;
  let currentUser: AuthUserV1 | null;
  let nextId: string;

  beforeEach(() => {
    repository = new FakeRepository();
    currentUser = USER_A;
    nextId = ID_A;
    cfopCalls.mockClear();
  });

  function dependencies() {
    return {
      authenticate: async () => currentUser,
      repositoryFactory: () => repository,
      serviceFactory: (storage: SavedAnalysisRepositoryV1) =>
        new SavedAnalysisServiceV1({
          repository: storage,
          evaluateApi: {
            execute: async (request) => {
              try {
                return analysisSnapshot(request.cubeState.facelets);
              } catch {
                throw new EvaluateV1Error("INVALID_CUBE_STATE");
              }
            },
          },
          cfop: { execute: cfopCalls },
          idFactory: () => nextId,
          now: () => new Date(nextId === ID_A ? "2026-09-30T01:00:00.000Z" : "2026-09-30T02:00:00.000Z"),
        }),
      requestIdFactory: () => "saved-analysis-request:test",
    };
  }

  it("exports bounded collection and detail method surfaces", () => {
    expect(Object.keys(collectionRoute).sort()).toEqual(["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT", "runtime"]);
    expect(Object.keys(detailRoute).sort()).toEqual(["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT", "runtime"]);
  });

  it("supports authenticated save, list, detail, and delete without accepting owner identity", async () => {
    const createResponse = await createSavedAnalysisPostHandlerV1(dependencies())(postRequest());
    const created = await createResponse.json();
    expect(createResponse.status).toBe(201);
    expect(created.savedAnalysis).toMatchObject({ id: ID_A, label: "Acceptance record" });
    expect(created.savedAnalysis).toHaveProperty("analysis");
    expect(created.savedAnalysis).not.toHaveProperty("evaluation");
    expect(created.savedAnalysis).not.toHaveProperty("ownerId");
    expect(repository.records.get(ID_A)?.ownerId).toBe(USER_A.ownerId);

    const listResponse = await createSavedAnalysisListHandlerV1(dependencies())(getRequest());
    const list = await listResponse.json();
    expect(list.list.items).toEqual([
      expect.objectContaining({ id: ID_A, hasCfop: false }),
    ]);
    expect(list.list.items[0]).not.toHaveProperty("analysis");

    const detailResponse = await createSavedAnalysisDetailHandlerV1(dependencies())(getRequest(`/api/saved-analyses/${ID_A}`), context(ID_A));
    expect(detailResponse.status).toBe(200);
    expect((await detailResponse.json()).savedAnalysis.id).toBe(ID_A);

    const deleteResponse = await createSavedAnalysisDeleteHandlerV1(dependencies())(getRequest(`/api/saved-analyses/${ID_A}`), context(ID_A));
    expect(deleteResponse.status).toBe(200);
    expect(await deleteResponse.json()).toMatchObject({ deleted: true });
    expect(repository.records.has(ID_A)).toBe(false);
  });

  it("keeps two owners isolated for list, detail, and delete", async () => {
    await createSavedAnalysisPostHandlerV1(dependencies())(postRequest());
    currentUser = USER_B;
    nextId = ID_B;

    const listResponse = await createSavedAnalysisListHandlerV1(dependencies())(getRequest());
    expect((await listResponse.json()).list.items).toEqual([]);

    const detailResponse = await createSavedAnalysisDetailHandlerV1(dependencies())(getRequest(`/api/saved-analyses/${ID_A}`), context(ID_A));
    expect(detailResponse.status).toBe(404);
    expect((await detailResponse.json()).error.code).toBe("NOT_FOUND");

    const deleteResponse = await createSavedAnalysisDeleteHandlerV1(dependencies())(getRequest(`/api/saved-analyses/${ID_A}`), context(ID_A));
    expect(deleteResponse.status).toBe(404);
    expect((await deleteResponse.json()).error.code).toBe("NOT_FOUND");
    expect(repository.records.has(ID_A)).toBe(true);
  });

  it("requires authentication before body parsing or storage access", async () => {
    currentUser = null;
    const storage = vi.fn(() => repository);
    const response = await createSavedAnalysisPostHandlerV1({
      ...dependencies(),
      repositoryFactory: storage,
    })(postRequest());
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
    expect(storage).not.toHaveBeenCalled();
  });

  it("maps invalid cube state and absent storage to exact safe errors", async () => {
    const invalid = await createSavedAnalysisPostHandlerV1(dependencies())(postRequest("X".repeat(54)));
    expect(invalid.status).toBe(422);
    expect((await invalid.json()).error.code).toBe("INVALID_CUBE_STATE");

    const unavailable = await createSavedAnalysisListHandlerV1({
      authenticate: async () => USER_A,
      repositoryFactory: () => {
        throw new SavedAnalysisV1Error("STORAGE_UNAVAILABLE");
      },
      requestIdFactory: () => "saved-analysis-request:test",
    })(getRequest());
    const payload = await unavailable.json();
    expect(unavailable.status).toBe(503);
    expect(payload.error.code).toBe("STORAGE_UNAVAILABLE");
    expect(JSON.stringify(payload)).not.toMatch(/postgres|DATABASE_URL|hostname|stack/i);
  });

  it("runs CFOP only when requested and stores only the server-produced result", async () => {
    await createSavedAnalysisPostHandlerV1(dependencies())(postRequest(SOLVED_FACELETS_V1, false));
    expect(cfopCalls).not.toHaveBeenCalled();
    expect(repository.records.get(ID_A)?.cfopResult).toBeUndefined();

    nextId = ID_B;
    await createSavedAnalysisPostHandlerV1(dependencies())(postRequest(SOLVED_FACELETS_V1, true));
    expect(cfopCalls).toHaveBeenCalledOnce();
    expect(repository.records.get(ID_B)?.cfopResult?.input.stateId).toMatch(/^[a-f0-9]{64}$/);
  });
});
