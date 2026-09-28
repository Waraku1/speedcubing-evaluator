import { assertValidCubeState, CFOP_FACELET_FORMAT, type URFDLBFaceletInput } from "../cfop-solver/state-adapter";

/** Detect stores three outside-view faces per attempt. */
export type DetectedScan = Readonly<{ step1: readonly string[]; step2: readonly string[] }>;

const SCAN_FACES = [
  ["U", 0, 0], ["R", 0, 9], ["B", 0, 18],
  ["D", 1, 0], ["F", 1, 9], ["L", 1, 18],
] as const;
const FACE_ORDER = ["U", "R", "F", "D", "L", "B"] as const;

/**
 * Convert detect's [U,R,B] + [D,F,L] arrays to URFDLB_FACELETS_V1.
 * visionOnnx.generateGridPoints normalizes each face to an outside-view 3x3
 * before the values reach these arrays. Do not rotate again here.
 */
export function detectedScanToFacelets(scan: DetectedScan): URFDLBFaceletInput {
  if (scan.step1.length !== 27 || scan.step2.length !== 27) {
    throw new Error("6面のデータが揃っていません。もう一度スキャンしてください。");
  }
  const faces: Record<string, string[]> = {};
  for (const [face, step, offset] of SCAN_FACES) {
    const values = (step === 0 ? scan.step1 : scan.step2).slice(offset, offset + 9);
    // The detect editor shows fixed center stickers even before a camera pass.
    if (values[4] === "N") values[4] = face;
    if (values.some((value) => !/^[URFDLB]$/.test(value))) {
      throw new Error(`${face} 面に未判定のマスがあります。展開図で色を修正してください。`);
    }
    if (values[4] !== face) {
      throw new Error(`${face} 面の中央色が一致しません。キューブの向きを確認してください。`);
    }
    faces[face] = [...values];
  }
  const facelets = FACE_ORDER.flatMap((face) => faces[face]).join("");
  try {
    assertValidCubeState(facelets);
  } catch {
    throw new Error("キューブ状態が成立しません。面の向きと各マスの色を確認してください。");
  }
  return { format: CFOP_FACELET_FORMAT, facelets };
}

export const DETECTED_SCAN_STORAGE_KEY = "detectedCubeFaceletsV1";
