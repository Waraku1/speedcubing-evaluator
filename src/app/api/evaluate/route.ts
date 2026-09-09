import {
  createEvaluatePostHandlerV1,
  createMethodNotAllowedHandlerV1,
} from "../../../lib/integration/evaluateRouteV1";

export const runtime = "nodejs";

export const POST = createEvaluatePostHandlerV1();

const methodNotAllowed = createMethodNotAllowedHandlerV1();

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
export const HEAD = methodNotAllowed;
