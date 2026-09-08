import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "./route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/cfop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/cfop", () => {
  it("returns the existing CFOP result contract", async () => {
    const response = await POST(makeRequest({ scramble: "" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.solution).toEqual([]);
    expect(payload.data.totalHTM).toBe(0);
    expect(payload.data.totalQTM).toBe(0);
    expect(payload.data.progress.pll.solved).toBe(true);
    expect(payload.data.phases).toHaveProperty("cross");
    expect(payload.data.phases).toHaveProperty("f2l");
    expect(payload.data.phases).toHaveProperty("oll");
    expect(payload.data.phases).toHaveProperty("pll");
  });

  it("solves a real scramble through all CFOP phases", async () => {
    const scramble = "U' L' U2 L U' L' U' L F U' F' F2 B";
    const response = await POST(makeRequest({ scramble }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.phases.cross.moves.length).toBeGreaterThan(0);
    expect(payload.data.phases.f2l.solvedOrder).toHaveLength(4);
    expect(payload.data.phases.oll.moves.length).toBeGreaterThan(0);
    expect(payload.data.phases.pll.moves.length).toBeGreaterThan(0);
    expect(payload.data.progress.pll.solved).toBe(true);
  });

  it("rejects an invalid move with an in-band API error", async () => {
    const response = await POST(makeRequest({ scramble: "R X U" }));
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toMatchObject({
      success: false,
      error: { code: "INVALID_MOVE" },
    });
  });

  it("rejects a non-string scramble", async () => {
    const response = await POST(makeRequest({ scramble: ["R", "U"] }));
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error.code).toBe("INVALID_SCRAMBLE");
  });
});
