import { NextRequest, NextResponse } from "next/server";

import { solveCFOPFromString } from "../../../lib/cfop-solver/cfop-solver";
import { InvalidMoveError } from "../../../lib/cube/moves";

const MAX_SCRAMBLE_LENGTH = 512;

type SolveRequest = {
  scramble?: unknown;
};

export async function POST(request: NextRequest) {
  let body: SolveRequest;

  try {
    body = (await request.json()) as SolveRequest;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_JSON",
          message: "The request body must be valid JSON.",
        },
      },
      { status: 400 },
    );
  }

  if (typeof body.scramble !== "string") {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_SCRAMBLE",
          message: "Scramble must be a string.",
        },
      },
      { status: 422 },
    );
  }

  if (body.scramble.length > MAX_SCRAMBLE_LENGTH) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SCRAMBLE_TOO_LONG",
          message: `Scramble must be ${MAX_SCRAMBLE_LENGTH} characters or fewer.`,
        },
      },
      { status: 422 },
    );
  }

  try {
    const startedAt = performance.now();
    const result = solveCFOPFromString(body.scramble);

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        timeMs: Math.round((performance.now() - startedAt) * 10) / 10,
      },
    });
  } catch (error) {
    const isInputError = error instanceof InvalidMoveError;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isInputError ? "INVALID_MOVE" : "SOLVER_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "The solver could not complete this scramble.",
        },
      },
      { status: isInputError ? 422 : 500 },
    );
  }
}
