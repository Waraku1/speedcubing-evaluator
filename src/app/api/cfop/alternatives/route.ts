import {
  createCFOPAlternativesMethodNotAllowedHandlerV1,
  createCFOPAlternativesPostHandlerV1,
} from "../../../../lib/integration/cfopAlternativesRouteV1";

export const runtime = "nodejs";

export const POST = createCFOPAlternativesPostHandlerV1();

const methodNotAllowed = createCFOPAlternativesMethodNotAllowedHandlerV1();

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
export const HEAD = methodNotAllowed;
