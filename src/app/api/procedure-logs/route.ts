import {
  createProcedureLogListHandlerV1,
  createProcedureLogMethodNotAllowedHandlerV1,
  createProcedureLogPostHandlerV1,
} from "../../../lib/procedure-log/procedureLogRouteV1";

export const runtime = "nodejs";

export const GET = createProcedureLogListHandlerV1();
export const POST = createProcedureLogPostHandlerV1();

const methodNotAllowed = createProcedureLogMethodNotAllowedHandlerV1(
  "GET, POST",
);
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
export const HEAD = methodNotAllowed;
