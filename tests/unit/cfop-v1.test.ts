import { describe, expect, it } from "vitest";

import {
  solveCFOPFromState,
  verifyStateSolveResult,
} from "../../src/lib/cfop-solver/cfop-solver";
import { applyMoves } from "../../src/lib/cube/moves";
import { CFOPServiceV1 } from "../../src/lib/integration/CFOPServiceV1";
import {
  parseCFOPResponseV1,
  serializeCFOPRequestV1,
  UiCFOPErrorV1,
} from "../../src/lib/ui/cfopCube";
import type { CFOPApiSuccessV1, CFOPRequestV1 } from "../../src/types/cfop-v1";
import { SOLVED_FACELETS_V1 } from "../../src/types/solver-v1";

const SCRAMBLE = [
  "U'", "L'", "U2", "L", "U'", "L'", "U'", "L",
  "F", "U'", "F'", "F2", "B",
] as const;

function request(facelets: string): CFOPRequestV1 {
  return {
    schemaVersion: "1.0",
    inputMode: "FACELET_STATE",
    cubeState: { format: "URFDLB_FACELETS_V1", facelets },
  };
}

describe("CFOP facelet-state production seam", () => {
  it("solves a direct facelet state without inventing scramble history", () => {
    const facelets = applyMoves(SOLVED_FACELETS_V1, SCRAMBLE);
    const result = solveCFOPFromState(facelets);

    expect(result.inputState).toBe(facelets);
    expect(result).not.toHaveProperty("scramble");
    expect(result).not.toHaveProperty("scrambledState");
    expect(result.solution.length).toBeGreaterThan(0);
    expect(verifyStateSolveResult(result)).toBe(true);
    expect(applyMoves(facelets, result.solution)).toBe(SOLVED_FACELETS_V1);
  });

  it("returns a verified empty four-phase result for a solved cube", () => {
    const result = new CFOPServiceV1({ now: () => 10 }).execute(
      request(SOLVED_FACELETS_V1)
    );

    expect(result.solution).toEqual({
      moves: [],
      htm: 0,
      qtm: 0,
      verified: true,
    });
    expect(result.phases.cross.moves).toEqual([]);
    expect(result.phases.f2l.moves).toEqual([]);
    expect(result.phases.oll.moves).toEqual([]);
    expect(result.phases.pll.moves).toEqual([]);
    expect(result.method).toMatchObject({
      id: "CFOP",
      historyUsage: "NONE",
    });
  });

  it("serializes a closed facelet-only request", () => {
    expect(serializeCFOPRequestV1(SOLVED_FACELETS_V1)).toEqual(
      request(SOLVED_FACELETS_V1)
    );
  });

  it("accepts a closed verified response and rejects semantic drift", () => {
    const result = new CFOPServiceV1({ now: () => 20 }).execute(
      request(SOLVED_FACELETS_V1)
    );
    const payload: CFOPApiSuccessV1 = {
      schemaVersion: "1.0",
      requestId: "cfop-request:unit",
      result,
    };

    expect(parseCFOPResponseV1(payload, true)).toEqual({
      requestId: "cfop-request:unit",
      result,
    });

    expect(() =>
      parseCFOPResponseV1(
        {
          ...payload,
          result: {
            ...result,
            method: { ...result.method, historyUsage: "RECONSTRUCTED" },
          },
        },
        true
      )
    ).toThrowError(UiCFOPErrorV1);
  });

  it("rejects a response whose phase sequence does not equal the solution", () => {
    const result = new CFOPServiceV1().execute(
      request(applyMoves(SOLVED_FACELETS_V1, ["R"]))
    );

    expect(() =>
      parseCFOPResponseV1(
        {
          schemaVersion: "1.0",
          requestId: "cfop-request:unit",
          result: {
            ...result,
            solution: { ...result.solution, moves: [] },
          },
        },
        true
      )
    ).toThrowError(UiCFOPErrorV1);
  });

  it("maps only a closed server error contract", () => {
    expect(() =>
      parseCFOPResponseV1(
        {
          schemaVersion: "1.0",
          requestId: "cfop-request:unit",
          error: {
            code: "CFOP_UNAVAILABLE",
            message: "Safe public message",
            stage: "CFOP",
            retryable: true,
          },
        },
        false
      )
    ).toThrowError(
      expect.objectContaining({
        publicError: expect.objectContaining({ code: "CFOP_UNAVAILABLE" }),
      })
    );
  });
});
