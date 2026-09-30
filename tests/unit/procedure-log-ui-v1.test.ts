import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ProcedureLogDetailContent } from "../../src/components/procedures/ProcedureLogDetailView";
import { ProcedureLogListContent } from "../../src/components/procedures/ProcedureLogsManager";
import { SaveProcedureControls } from "../../src/components/procedures/SaveProcedureControls";
import { SavedAnalysisAuthProvider } from "../../src/components/saved/SavedAnalysisAuthContext";
import {
  createProcedureLogV1,
  deleteProcedureLogV1,
  getProcedureLogV1,
  listProcedureLogsV1,
  parseProcedureLogDetailResponseV1,
  ProcedureLogClientErrorV1,
} from "../../src/lib/ui/procedureLogClientV1";
import type {
  ProcedureLogListItemV1,
  ProcedureLogV1,
} from "../../src/types/procedure-log-v1";

const ID = "11111111-1111-4111-8111-111111111111";
const FACELETS = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
const STATE_ID = "a".repeat(64);
const CREATED_AT = "2026-09-30T00:00:00.000Z";

function procedure(overrides: Partial<ProcedureLogV1> = {}): ProcedureLogV1 {
  return {
    id: ID,
    schemaVersion: "1.0",
    label: "Server record",
    cubeState: {
      format: "URFDLB_FACELETS_V1",
      facelets: FACELETS,
      stateId: STATE_ID,
    },
    moves: ["R2"],
    moveCount: 1,
    htm: 1,
    qtm: 2,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function envelope(record: ProcedureLogV1 = procedure()) {
  return {
    schemaVersion: "1.0",
    requestId: "procedure-log-request:test",
    procedureLog: record,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Procedure Logger V1 UI client", () => {
  it("creates with intent only and consumes server-derived metrics", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(envelope(), 201));
    const saved = await createProcedureLogV1({
      facelets: FACELETS,
      moves: ["R2"],
      label: "  Server record  ",
    }, fetcher);

    expect(fetcher).toHaveBeenCalledOnce();
    const [, init] = fetcher.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      schemaVersion: "1.0",
      cubeState: { format: "URFDLB_FACELETS_V1", facelets: FACELETS },
      moves: ["R2"],
      label: "Server record",
    });
    expect(init.body).not.toMatch(/ownerId|cubeStateId|verified|htm|qtm|createdAt|updatedAt/);
    expect(saved).toMatchObject({ moveCount: 1, htm: 1, qtm: 2 });
  });

  it("surfaces safe storage errors", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      schemaVersion: "1.0",
      requestId: "procedure-log-request:test",
      error: {
        code: "STORAGE_UNAVAILABLE",
        message: "Procedure-log storage is temporarily unavailable.",
        retryable: true,
      },
    }, 503));
    await expect(createProcedureLogV1({ facelets: FACELETS, moves: [] }, fetcher))
      .rejects.toEqual(expect.objectContaining({
        code: "STORAGE_UNAVAILABLE",
        message: "Procedure-log storage is temporarily unavailable.",
      }));
  });

  it("lists, opens, and deletes through the owner-scoped API surface", async () => {
    const item: ProcedureLogListItemV1 = {
      id: ID,
      schemaVersion: "1.0",
      label: "Server record",
      cubeState: { format: "URFDLB_FACELETS_V1", stateId: STATE_ID },
      moveCount: 1,
      htm: 1,
      qtm: 2,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        schemaVersion: "1.0",
        requestId: "procedure-log-request:list",
        list: { items: [item], nextCursor: "opaque-cursor" },
      }))
      .mockResolvedValueOnce(jsonResponse(envelope()))
      .mockResolvedValueOnce(jsonResponse({
        schemaVersion: "1.0",
        requestId: "procedure-log-request:delete",
        deleted: true,
      }));

    await expect(listProcedureLogsV1(undefined, fetcher)).resolves.toEqual({
      items: [item],
      nextCursor: "opaque-cursor",
    });
    await expect(getProcedureLogV1(ID, fetcher)).resolves.toEqual(procedure());
    await expect(deleteProcedureLogV1(ID, fetcher)).resolves.toBe(true);
    expect(fetcher.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      ["/api/procedure-logs?limit=20", undefined],
      [`/api/procedure-logs/${ID}`, undefined],
      [`/api/procedure-logs/${ID}`, "DELETE"],
    ]);
  });

  it("rejects owner identity in public records and never renders it", () => {
    expect(() => parseProcedureLogDetailResponseV1({
      ...envelope(),
      procedureLog: { ...procedure(), ownerId: "github:999" },
    }, true)).toThrowError(ProcedureLogClientErrorV1);

    const item = {
      id: ID,
      schemaVersion: "1.0" as const,
      cubeState: { format: "URFDLB_FACELETS_V1" as const, stateId: STATE_ID },
      moveCount: 1,
      htm: 1,
      qtm: 2,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    };
    const markup = [
      renderToStaticMarkup(createElement(ProcedureLogListContent, {
        items: [item], deletingId: null, onDelete: () => undefined,
      })),
      renderToStaticMarkup(createElement(ProcedureLogDetailContent, {
        procedure: procedure(),
      })),
    ].join("");
    expect(markup).not.toContain("ownerId");
    expect(markup).not.toContain("github:");
    expect(markup).toContain("1 HTM");
    expect(markup).toContain("2 QTM");
  });

  it("renders empty/list/detail states and an anonymous non-writing save state", () => {
    const empty = renderToStaticMarkup(createElement(ProcedureLogListContent, {
      items: [], deletingId: null, onDelete: () => undefined,
    }));
    expect(empty).toContain("No saved procedures yet");

    const anonymousSave = renderToStaticMarkup(
      createElement(
        SavedAnalysisAuthProvider as FunctionComponent<{ authenticated: boolean }>,
        { authenticated: false },
        createElement(SaveProcedureControls, {
          facelets: FACELETS,
          moves: ["R2"],
        }),
      ),
    );
    expect(anonymousSave).toContain("Sign in to save procedure");
    expect(anonymousSave).not.toContain("Saving procedure");

    const detail = renderToStaticMarkup(createElement(ProcedureLogDetailContent, {
      procedure: procedure(),
    }));
    expect(detail).toContain("stored verified procedure");
    expect(detail).toContain("does not re-run the solver or evaluator");
    expect(detail).toContain("R2");
  });
});
