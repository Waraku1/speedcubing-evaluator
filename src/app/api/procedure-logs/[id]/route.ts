import {
  createProcedureLogDeleteHandlerV1,
  createProcedureLogDetailHandlerV1,
  createProcedureLogMethodNotAllowedHandlerV1,
} from "../../../../lib/procedure-log/procedureLogRouteV1";

export const runtime = "nodejs";

export const GET = createProcedureLogDetailHandlerV1();
export const DELETE = createProcedureLogDeleteHandlerV1();

const methodNotAllowed = createProcedureLogMethodNotAllowedHandlerV1(
  "GET, DELETE",
);
export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
export const HEAD = methodNotAllowed;
