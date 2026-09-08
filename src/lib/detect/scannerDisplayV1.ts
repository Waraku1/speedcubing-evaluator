import type { ScannerPointV1 } from "./scannerMessagesV1";

/** Preview and overlay share physical camera coordinates; no mirror compensation. */
export function scannerPointToDisplayPointV1(
  point: ScannerPointV1
): ScannerPointV1 {
  return Object.freeze({ x: point.x, y: point.y });
}
