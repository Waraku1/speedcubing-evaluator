import { describe, expect, it, vi } from "vitest";

import { applyMoves, SOLVED_STATE } from "../../src/lib/cube/moves";
import { createCubeFaceletStateV1 } from "../../src/lib/cube/cubeStateV1";
import {
  PostgresProcedureLogRepositoryV1,
  createPostgresProcedureLogRepositoryV1,
} from "../../src/lib/procedure-log/PostgresProcedureLogRepositoryV1";
import type {
  ProcedureLogRecordV1,
  ProcedureLogRepositoryV1,
} from "../../src/lib/procedure-log/ProcedureLogRepositoryV1";
import { ProcedureLogServiceV1 } from "../../src/lib/procedure-log/ProcedureLogServiceV1";
import {
  decodeProcedureLogCursorV1,
  encodeProcedureLogCursorV1,
  parseCreateProcedureLogRequestV1,
  parseProcedureLogListQueryV1,
  serializeProcedureLogListItemV1,
  serializeProcedureLogV1,
} from "../../src/lib/procedure-log/procedureLogContractV1";
import { ProcedureLogV1Error } from "../../src/lib/procedure-log/procedureLogErrorsV1";

const ID = "11111111-1111-4111-8111-111111111111";
const OWNER = "github:101";
const CREATED_AT = "2026-09-30T00:00:00.000Z";
const INPUT = applyMoves(SOLVED_STATE, ["R2"]);
const CUBE = createCubeFaceletStateV1(INPUT);

function record(
  overrides: Partial<ProcedureLogRecordV1> = {},
): ProcedureLogRecordV1 {
  return {
    id: ID,
    ownerId: OWNER,
    schemaVersion: "1.0",
    label: "Half turn",
    cubeFormat: "URFDLB_FACELETS_V1",
    cubeFacelets: INPUT,
    cubeStateId: CUBE.stateId,
    moves: ["R2"],
    htm: 1,
    qtm: 2,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function databaseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    owner_id: OWNER,
    schema_version: "1.0",
    label: "Half turn",
    cube_format: "URFDLB_FACELETS_V1",
    cube_facelets: INPUT,
    cube_state_id: CUBE.stateId,
    moves_json: ["R2"],
    htm: 1,
    qtm: 2,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    ...overrides,
  };
}

function databaseListRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    owner_id: OWNER,
    schema_version: "1.0",
    label: "Half turn",
    cube_format: "URFDLB_FACELETS_V1",
    cube_state_id: CUBE.stateId,
    htm: 1,
    qtm: 2,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    ...overrides,
  };
}

describe("Procedure Log V1 contract", () => {
  it("accepts only bounded move intent and trims a Unicode label", () => {
    expect(parseCreateProcedureLogRequestV1({
      schemaVersion: "1.0",
      cubeState: { format: "URFDLB_FACELETS_V1", facelets: INPUT },
      moves: ["R2"],
      label: "  🧊 Half turn  ",
    })).toEqual({
      schemaVersion: "1.0",
      cubeState: { format: "URFDLB_FACELETS_V1", facelets: INPUT },
      moves: ["R2"],
      label: "🧊 Half turn",
    });
    expect(parseCreateProcedureLogRequestV1({
      schemaVersion: "1.0",
      cubeState: { format: "URFDLB_FACELETS_V1", facelets: INPUT },
      moves: ["R2"],
      label: "   ",
    })).not.toHaveProperty("label");
  });

  it("rejects invalid moves, excessive moves, extra fields, and trust-bearing fields", () => {
    const base = {
      schemaVersion: "1.0",
      cubeState: { format: "URFDLB_FACELETS_V1", facelets: INPUT },
      moves: ["R2"],
    };
    expect(() => parseCreateProcedureLogRequestV1({ ...base, moves: ["Rw"] }))
      .toThrowError(expect.objectContaining({ code: "INVALID_MOVE_SEQUENCE" }));
    expect(() => parseCreateProcedureLogRequestV1({
      ...base,
      moves: Array.from({ length: 513 }, () => "U"),
    })).toThrowError(expect.objectContaining({ code: "INVALID_MOVE_SEQUENCE" }));
    for (const field of [
      "ownerId",
      "cubeStateId",
      "htm",
      "qtm",
      "verified",
      "createdAt",
      "updatedAt",
      "extra",
    ]) {
      expect(() => parseCreateProcedureLogRequestV1({ ...base, [field]: true }))
        .toThrowError(ProcedureLogV1Error);
    }
    expect(() => parseCreateProcedureLogRequestV1({
      ...base,
      label: "🧊".repeat(121),
    })).toThrowError(ProcedureLogV1Error);
    expect(() => parseCreateProcedureLogRequestV1({
      ...base,
      label: "🧊".repeat(120),
    })).not.toThrow();
  });

  it("round-trips an opaque cursor and enforces page bounds", () => {
    const cursor = { createdAt: CREATED_AT, id: ID };
    expect(decodeProcedureLogCursorV1(encodeProcedureLogCursorV1(cursor)))
      .toEqual(cursor);
    expect(parseProcedureLogListQueryV1(
      new URL("https://aes.test/api/procedure-logs"),
    )).toEqual({ limit: 20 });
    expect(parseProcedureLogListQueryV1(
      new URL("https://aes.test/api/procedure-logs?limit=50"),
    )).toEqual({ limit: 50 });
    for (const url of [
      "https://aes.test/api/procedure-logs?limit=51",
      "https://aes.test/api/procedure-logs?limit=20&limit=21",
      "https://aes.test/api/procedure-logs?sort=label",
      "https://aes.test/api/procedure-logs?cursor=not-a-cursor",
    ]) {
      expect(() => parseProcedureLogListQueryV1(new URL(url)))
        .toThrowError(ProcedureLogV1Error);
    }
  });

  it("serializes detail and metadata-only list records without owner identity", () => {
    const detail = serializeProcedureLogV1(record());
    const item = serializeProcedureLogListItemV1(record());
    expect(detail).toMatchObject({
      moveCount: 1,
      htm: 1,
      qtm: 2,
      moves: ["R2"],
    });
    expect(detail).not.toHaveProperty("ownerId");
    expect(item).not.toHaveProperty("ownerId");
    expect(item).not.toHaveProperty("moves");
    expect(item.cubeState).not.toHaveProperty("facelets");
  });
});

describe("Procedure Log V1 server verification", () => {
  it("derives identity and metrics and rejects a non-solving procedure", async () => {
    let stored: ProcedureLogRecordV1 | null = null;
    const repository: ProcedureLogRepositoryV1 = {
      create: async (value) => {
        stored = value;
        return value;
      },
      listByOwner: async () => ({ records: [] }),
      findByOwnerAndId: async () => null,
      deleteByOwnerAndId: async () => false,
    };
    const service = new ProcedureLogServiceV1({
      repository,
      idFactory: () => ID,
      now: () => new Date(CREATED_AT),
    });

    const created = await service.create(OWNER, {
      schemaVersion: "1.0",
      cubeState: { format: "URFDLB_FACELETS_V1", facelets: INPUT },
      moves: ["R2"],
    });
    expect(created).toBe(stored);
    expect(created).toMatchObject({
      id: ID,
      ownerId: OWNER,
      cubeStateId: CUBE.stateId,
      htm: 1,
      qtm: 2,
    });

    await expect(service.create(OWNER, {
      schemaVersion: "1.0",
      cubeState: { format: "URFDLB_FACELETS_V1", facelets: INPUT },
      moves: [],
    })).rejects.toMatchObject({ code: "PROCEDURE_DOES_NOT_SOLVE" });
    await expect(service.create(OWNER, {
      schemaVersion: "1.0",
      cubeState: { format: "URFDLB_FACELETS_V1", facelets: "X".repeat(54) },
      moves: [],
    })).rejects.toMatchObject({ code: "INVALID_CUBE_STATE" });
  });
});

describe("Postgres Procedure Log V1 ownership and pagination", () => {
  it("binds owner identity and keeps collection SQL metadata-only", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([databaseListRow()])
      .mockResolvedValueOnce([databaseRow()])
      .mockResolvedValueOnce([{ id: ID }]);
    const repository = new PostgresProcedureLogRepositoryV1({ query } as never);

    await repository.listByOwner(OWNER, { limit: 20 });
    await repository.findByOwnerAndId(OWNER, ID);
    await repository.deleteByOwnerAndId(OWNER, ID);

    expect(query.mock.calls[0][0]).not.toMatch(/cube_facelets|moves_json/);
    expect(query.mock.calls[0][0]).toMatch(/cube_state_id/);
    for (const call of query.mock.calls) {
      expect(call[0]).toMatch(/owner_id = \$1/);
      expect(call[1][0]).toBe(OWNER);
    }
    expect(query.mock.calls[2][0]).toMatch(/DELETE FROM procedure_logs/);
  });

  it("uses stable descending cursor ordering and one extra row", async () => {
    const secondId = "22222222-2222-4222-8222-222222222222";
    const query = vi.fn().mockResolvedValue([
      databaseListRow(),
      databaseListRow({
        id: secondId,
        created_at: "2026-09-29T00:00:00.000Z",
      }),
    ]);
    const repository = new PostgresProcedureLogRepositoryV1({ query } as never);
    const page = await repository.listByOwner(OWNER, {
      limit: 1,
      cursor: {
        createdAt: "2026-10-01T00:00:00.000Z",
        id: "33333333-3333-4333-8333-333333333333",
      },
    });
    expect(query.mock.calls[0][0]).toMatch(/ORDER BY created_at DESC, id DESC/);
    expect(query.mock.calls[0][0]).toMatch(/\(created_at, id\) < /);
    expect(query.mock.calls[0][1]).toEqual([
      OWNER,
      "2026-10-01T00:00:00.000Z",
      "33333333-3333-4333-8333-333333333333",
      2,
    ]);
    expect(page.records).toHaveLength(1);
    expect(page.nextCursor).toEqual({ createdAt: CREATED_AT, id: ID });
  });

  it("maps database failures and missing configuration safely", async () => {
    const repository = new PostgresProcedureLogRepositoryV1({
      query: vi.fn().mockRejectedValue(new Error("private database hostname")),
    } as never);
    await expect(repository.listByOwner(OWNER, { limit: 20 }))
      .rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
    expect(() => createPostgresProcedureLogRepositoryV1({}))
      .toThrowError(expect.objectContaining({ code: "STORAGE_UNAVAILABLE" }));
  });
});
