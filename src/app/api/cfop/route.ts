import {
  createCFOPMethodNotAllowedHandlerV1,
  createCFOPPostHandlerV1,
} from "../../../lib/integration/cfopRouteV1";

export const runtime = "nodejs";

export const POST = createCFOPPostHandlerV1();

const methodNotAllowed = createCFOPMethodNotAllowedHandlerV1();

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
export const HEAD = methodNotAllowed;
