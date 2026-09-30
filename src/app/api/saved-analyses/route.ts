import {
  createSavedAnalysisListHandlerV1,
  createSavedAnalysisMethodNotAllowedHandlerV1,
  createSavedAnalysisPostHandlerV1,
} from "../../../lib/saved-analysis/savedAnalysisRouteV1";

export const runtime = "nodejs";

export const GET = createSavedAnalysisListHandlerV1();
export const POST = createSavedAnalysisPostHandlerV1();

const methodNotAllowed = createSavedAnalysisMethodNotAllowedHandlerV1(
  "GET, POST"
);
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
export const HEAD = methodNotAllowed;
