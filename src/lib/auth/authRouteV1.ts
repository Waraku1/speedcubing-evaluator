import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";
import { NextResponse } from "next/server";

export type AuthRouteHandlerV1 = (
  request: Request,
  context?: unknown
) => Promise<Response>;

export function createUnavailableAuthHandlerV1(): AuthRouteHandlerV1 {
  return async () =>
    NextResponse.json(
      {
        error: {
          code: "AUTH_UNAVAILABLE",
          message: "Authentication is not configured.",
        },
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
}

export function createAuthRouteHandlerV1(
  options: NextAuthOptions | null
): AuthRouteHandlerV1 {
  return options === null
    ? createUnavailableAuthHandlerV1()
    : (NextAuth(options) as AuthRouteHandlerV1);
}
