import type { CubeDraftTokenV1 } from "../ui/cubeDraftV1";

export type ScannerPointV1 = Readonly<{ x: number; y: number }>;

export type ScannerWorkerInboundV1 =
  | Readonly<{
      type: "LOAD_MODEL";
      generation: number;
      modelUrl: string;
    }>
  | Readonly<{
      type: "INFER";
      generation: number;
      requestId: number;
      bitmap: ImageBitmap;
    }>
  | Readonly<{ type: "DISPOSE"; generation: number }>;

export type ScannerWorkerOutboundV1 =
  | Readonly<{ type: "MODEL_READY"; generation: number }>
  | Readonly<{
      type: "INFERENCE_RESULT";
      generation: number;
      requestId: number;
      colors: readonly CubeDraftTokenV1[];
      points: readonly ScannerPointV1[];
      durationMs: number;
    }>
  | Readonly<{
      type: "NO_DETECTION";
      generation: number;
      requestId: number;
      durationMs: number;
    }>
  | Readonly<{
      type: "WORKER_ERROR";
      generation: number;
      code: "MODEL_LOAD_FAILED" | "INFERENCE_FAILED";
    }>
  | Readonly<{ type: "DISPOSED"; generation: number }>;

const TOKEN_SET = new Set<string>(["U", "R", "F", "D", "L", "B", "N"]);

function hasExactKeys(
  message: Record<string, unknown>,
  expected: readonly string[]
): boolean {
  const actual = Object.keys(message).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

export function isScannerWorkerInboundV1(
  value: unknown
): value is ScannerWorkerInboundV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const message = value as Record<string, unknown>;
  if (
    !Number.isInteger(message.generation) ||
    (message.generation as number) < 0 ||
    typeof message.type !== "string"
  ) {
    return false;
  }
  if (message.type === "LOAD_MODEL") {
    return (
      hasExactKeys(message, ["type", "generation", "modelUrl"]) &&
      typeof message.modelUrl === "string" &&
      /^\/models\/cube_pose\.[a-f0-9]{16}\.onnx$/.test(message.modelUrl)
    );
  }
  if (message.type === "DISPOSE") {
    return hasExactKeys(message, ["type", "generation"]);
  }
  return (
    message.type === "INFER" &&
    hasExactKeys(message, ["type", "generation", "requestId", "bitmap"]) &&
    Number.isInteger(message.requestId) &&
    typeof message.bitmap === "object" &&
    message.bitmap !== null &&
    typeof (message.bitmap as ImageBitmap).close === "function"
  );
}

export function isScannerWorkerOutboundV1(
  value: unknown
): value is ScannerWorkerOutboundV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const message = value as Record<string, unknown>;
  if (
    !Number.isInteger(message.generation) ||
    (message.generation as number) < 0 ||
    typeof message.type !== "string"
  ) {
    return false;
  }
  if (message.type === "MODEL_READY" || message.type === "DISPOSED") {
    return hasExactKeys(message, ["type", "generation"]);
  }
  if (message.type === "WORKER_ERROR") {
    return (
      hasExactKeys(message, ["type", "generation", "code"]) &&
      (message.code === "MODEL_LOAD_FAILED" || message.code === "INFERENCE_FAILED")
    );
  }
  if (message.type === "NO_DETECTION") {
    return (
      hasExactKeys(message, ["type", "generation", "requestId", "durationMs"]) &&
      Number.isInteger(message.requestId) &&
      typeof message.durationMs === "number" &&
      Number.isFinite(message.durationMs) &&
      message.durationMs >= 0
    );
  }
  return (
    message.type === "INFERENCE_RESULT" &&
    hasExactKeys(message, [
      "type",
      "generation",
      "requestId",
      "colors",
      "points",
      "durationMs",
    ]) &&
    Number.isInteger(message.requestId) &&
    typeof message.durationMs === "number" &&
    Number.isFinite(message.durationMs) &&
    message.durationMs >= 0 &&
    Array.isArray(message.colors) &&
    message.colors.length === 27 &&
    message.colors.every(
      (token) => typeof token === "string" && TOKEN_SET.has(token)
    ) &&
    Array.isArray(message.points) &&
    message.points.length === 27 &&
    message.points.every(
      (point) =>
        typeof point === "object" &&
        point !== null &&
        typeof (point as ScannerPointV1).x === "number" &&
        Number.isFinite((point as ScannerPointV1).x) &&
        (point as ScannerPointV1).x >= 0 &&
        (point as ScannerPointV1).x <= 1 &&
        typeof (point as ScannerPointV1).y === "number" &&
        Number.isFinite((point as ScannerPointV1).y) &&
        (point as ScannerPointV1).y >= 0 &&
        (point as ScannerPointV1).y <= 1
    )
  );
}
