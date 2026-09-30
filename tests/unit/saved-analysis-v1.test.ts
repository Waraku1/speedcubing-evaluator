import { describe, expect, it, vi } from "vitest";

import { PostgresSavedAnalysisRepositoryV1, createPostgresSavedAnalysisRepositoryV1 } from "../../src/lib/saved-analysis/PostgresSavedAnalysisRepositoryV1";
import type { SavedAnalysisRecordV1 } from "../../src/lib/saved-analysis/SavedAnalysisRepositoryV1";
import {
  decodeSavedAnalysisCursorV1,
  encodeSavedAnalysisCursorV1,
  parseSaveAnalysisRequestV1,
  parseSavedAnalysisListQueryV1,
  serializeSavedAnalysisListItemV1,
  serializeSavedAnalysisV1,
} from "../../src/lib/saved-analysis/savedAnalysisContractV1";
import { SavedAnalysisV1Error } from "../../src/lib/saved-analysis/savedAnalysisErrorsV1";
import type { EvaluateResultV1 } from "../../src/types/evaluate-v1";
import { SOLVED_FACELETS_V1 } from "../../src/types/solver-v1";

const ID = "11111111-1111-4111-8111-111111111111";
const OWNER = "github:101";
const STATE_ID = "a".repeat(64);
const CREATED_AT = "2026-09-30T00:00:00.000Z";

function analysisSnapshot(): EvaluateResultV1 {
  return {
    cubeState: { stateId: STATE_ID, format: "URFDLB_FACELETS_V1" },
  } as unknown as EvaluateResultV1;
}

function record(overrides: Partial<SavedAnalysisRecordV1> = {}): SavedAnalysisRecordV1 {
  return {
    id: ID,
    ownerId: OWNER,
    schemaVersion: "1.0",
    label: "Solved case",
    cubeFormat: "URFDLB_FACELETS_V1",
    cubeFacelets: SOLVED_FACELETS_V1,
    cubeStateId: STATE_ID,
    evaluateApiSchemaVersion: "1.0",
    analysisSnapshot: analysisSnapshot(),
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
    label: "Solved case",
    cube_format: "URFDLB_FACELETS_V1",
    cube_facelets: SOLVED_FACELETS_V1,
    cube_state_id: STATE_ID,
    evaluate_api_schema_version: "1.0",
    analysis_json: analysisSnapshot(),
    cfop_schema_version: null,
    cfop_json: null,
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
    label: "Solved case",
    cube_format: "URFDLB_FACELETS_V1",
    cube_state_id: STATE_ID,
    cfop_schema_version: null,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    ...overrides,
  };
}

describe("Saved Analysis V1 contract", () => {
  it("accepts only bounded user intent and trims an optional label", () => {
    expect(
      parseSaveAnalysisRequestV1({
        schemaVersion: "1.0",
        cubeState: { format: "URFDLB_FACELETS_V1", facelets: SOLVED_FACELETS_V1 },
        includeCfop: true,
        label: "  My solve  ",
      })
    ).toEqual({
      schemaVersion: "1.0",
      cubeState: { format: "URFDLB_FACELETS_V1", facelets: SOLVED_FACELETS_V1 },
      includeCfop: true,
      label: "My solve",
    });
    expect(
      parseSaveAnalysisRequestV1({
        schemaVersion: "1.0",
        cubeState: { format: "URFDLB_FACELETS_V1", facelets: SOLVED_FACELETS_V1 },
        includeCfop: false,
        label: "   ",
      })
    ).not.toHaveProperty("label");
  });

  it("rejects extra trust-bearing fields and labels over 120 Unicode code points", () => {
    const base = {
      schemaVersion: "1.0",
      cubeState: { format: "URFDLB_FACELETS_V1", facelets: SOLVED_FACELETS_V1 },
      includeCfop: false,
    };
    expect(() => parseSaveAnalysisRequestV1({ ...base, analysis: {} })).toThrow(SavedAnalysisV1Error);
    expect(() => parseSaveAnalysisRequestV1({ ...base, ownerId: OWNER })).toThrow(SavedAnalysisV1Error);
    expect(() => parseSaveAnalysisRequestV1({ ...base, label: "🧊".repeat(121) })).toThrow(SavedAnalysisV1Error);
    expect(() => parseSaveAnalysisRequestV1({ ...base, label: "🧊".repeat(120) })).not.toThrow();
  });

  it("round-trips a closed cursor and rejects malformed pagination", () => {
    const cursor = { createdAt: CREATED_AT, id: ID };
    expect(decodeSavedAnalysisCursorV1(encodeSavedAnalysisCursorV1(cursor))).toEqual(cursor);
    expect(parseSavedAnalysisListQueryV1(new URL("https://aes.test/api/saved-analyses"))).toEqual({ limit: 20 });
    expect(parseSavedAnalysisListQueryV1(new URL("https://aes.test/api/saved-analyses?limit=50"))).toEqual({ limit: 50 });
    for (const url of [
      "https://aes.test/api/saved-analyses?limit=51",
      "https://aes.test/api/saved-analyses?limit=20&limit=21",
      "https://aes.test/api/saved-analyses?sort=label",
      "https://aes.test/api/saved-analyses?cursor=not-a-cursor",
    ]) {
      expect(() => parseSavedAnalysisListQueryV1(new URL(url))).toThrow(SavedAnalysisV1Error);
    }
  });

  it("serializes the public schema without ownership or database metadata", () => {
    const full = serializeSavedAnalysisV1(record());
    const item = serializeSavedAnalysisListItemV1(record());
    expect(full).not.toHaveProperty("ownerId");
    expect(full).not.toHaveProperty("analysis_json");
    expect(full).not.toHaveProperty("evaluation");
    expect(full.analysis.result.cubeState.stateId).toBe(STATE_ID);
    expect(item).not.toHaveProperty("ownerId");
    expect(item).not.toHaveProperty("analysis");
    expect(item.hasCfop).toBe(false);
  });

  it("fails closed for incompatible historical schema identities", () => {
    expect(() => serializeSavedAnalysisV1(record({ schemaVersion: "2.0" as "1.0" }))).toThrow(SavedAnalysisV1Error);
    expect(() => serializeSavedAnalysisV1(record({ evaluateApiSchemaVersion: "2.0" as "1.0" }))).toThrow(SavedAnalysisV1Error);
    expect(() => serializeSavedAnalysisV1(record({ cubeStateId: "legacy-state" }))).toThrow(SavedAnalysisV1Error);
  });
});

describe("Postgres Saved Analysis V1 ownership and pagination", () => {
  it("binds owner identity into list, find, and delete SQL", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([databaseListRow()])
      .mockResolvedValueOnce([databaseRow()])
      .mockResolvedValueOnce([{ id: ID }]);
    const repository = new PostgresSavedAnalysisRepositoryV1({ query } as never);

    await repository.listByOwner(OWNER, { limit: 20 });
    await repository.findByOwnerAndId(OWNER, ID);
    await repository.deleteByOwnerAndId(OWNER, ID);

    expect(query.mock.calls[0][0]).not.toMatch(
      /analysis_json|cfop_json|cube_facelets|evaluate_api_schema_version/
    );
    expect(query.mock.calls[0][0]).toMatch(/cfop_schema_version/);
    for (const call of query.mock.calls) {
      expect(call[0]).toMatch(/owner_id = \$1/);
      expect(call[1][0]).toBe(OWNER);
    }
    expect(query.mock.calls[2][0]).toMatch(/DELETE FROM saved_analyses/);
  });

  it("uses a stable descending cursor and returns continuation only for extra rows", async () => {
    const secondId = "22222222-2222-4222-8222-222222222222";
    const query = vi.fn().mockResolvedValue([
      databaseListRow(),
      databaseListRow({ id: secondId, created_at: "2026-09-29T00:00:00.000Z" }),
    ]);
    const repository = new PostgresSavedAnalysisRepositoryV1({ query } as never);
    const page = await repository.listByOwner(OWNER, {
      limit: 1,
      cursor: { createdAt: "2026-10-01T00:00:00.000Z", id: "33333333-3333-4333-8333-333333333333" },
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

  it("maps database failures and missing configuration to STORAGE_UNAVAILABLE", async () => {
    const repository = new PostgresSavedAnalysisRepositoryV1({
      query: vi.fn().mockRejectedValue(new Error("private database host")),
    } as never);
    await expect(repository.listByOwner(OWNER, { limit: 20 })).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
    expect(() => createPostgresSavedAnalysisRepositoryV1({})).toThrowError(expect.objectContaining({ code: "STORAGE_UNAVAILABLE" }));
  });
});
