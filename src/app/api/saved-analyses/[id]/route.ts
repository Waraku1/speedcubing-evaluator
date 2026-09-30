import {
  createSavedAnalysisDeleteHandlerV1,
  createSavedAnalysisDetailHandlerV1,
  createSavedAnalysisMethodNotAllowedHandlerV1,
} from "../../../../lib/saved-analysis/savedAnalysisRouteV1";

export const runtime = "nodejs";

export const GET = createSavedAnalysisDetailHandlerV1();
export const DELETE = createSavedAnalysisDeleteHandlerV1();

const methodNotAllowed = createSavedAnalysisMethodNotAllowedHandlerV1(
  "GET, DELETE"
);
export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
export const HEAD = methodNotAllowed;
