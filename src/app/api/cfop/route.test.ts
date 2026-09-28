import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { applyMoves, SOLVED_STATE } from "@/lib/cube/moves";
import { POST } from "./route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/cfop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("POST /api/cfop", () => {
  it("returns a verified partial result with evaluator input equal to display input", async () => {
    const state = applyMoves(SOLVED_STATE, ["R", "U", "F2", "L"]);
    const response = await POST(request({ facelets: state, mode: "partial", goal: "f2l" }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.goal).toBe("f2l");
    expect(payload.data.evaluator.evaluatedMoves).toEqual(payload.data.moves);
    expect(applyMoves(state, payload.data.moves)).toBe(payload.data.finalState);
  });

  it.each([
    [{ facelets: "short", mode: "complete" }, "INVALID_FACELETS"],
    [{ facelets: "U".repeat(54), mode: "complete" }, "INVALID_FACELETS"],
    [{ facelets: SOLVED_STATE, mode: "partial", goal: "pll" }, "INVALID_REQUEST"],
  ] as const)("rejects malformed request %#", async (body, code) => {
    const response = await POST(request(body));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await response.json()).error.code).toBe(code);
  });

  it("distinguishes physically unreachable states", async () => {
    const state = SOLVED_STATE.split("");
    [state[10], state[19]] = [state[19], state[10]];
    const response = await POST(request({ facelets: state.join(""), mode: "complete" }));
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("UNREACHABLE_STATE");
  });
});
