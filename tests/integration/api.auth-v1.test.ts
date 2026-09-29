import { describe, expect, it } from "vitest";

import * as authRouteModule from "../../src/app/api/auth/[...nextauth]/route";
import { createUnavailableAuthHandlerV1 } from "../../src/lib/auth/authRouteV1";

describe("Auth V1 App Router boundary", () => {
  it("exports only the canonical NextAuth route handlers", () => {
    expect(Object.keys(authRouteModule).sort()).toEqual(["GET", "POST", "runtime"]);
  });

  it("fails closed without exposing configuration details", async () => {
    const handler = createUnavailableAuthHandlerV1();
    const response = await handler(
      new Request("https://speedcubing-evaluator.vercel.app/api/auth/session")
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toEqual({
      error: {
        code: "AUTH_UNAVAILABLE",
        message: "Authentication is not configured.",
      },
    });
    expect(JSON.stringify(payload)).not.toMatch(/GITHUB|SECRET|token|process\.env/i);
  });
});
