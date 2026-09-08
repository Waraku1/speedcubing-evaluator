import {
  CUBE_DRAFT_FACES_V1,
  type CubeDraftFaceV1,
  type CubeDraftTokenV1,
  type CubeDraftV1,
} from "../ui/cubeDraftV1";

export const SCAN_MAPPING_VERSION_V1 = "SCAN_POSE_V1" as const;
export type ScanPoseNumberV1 = 1 | 2;
export type RawScanFaceV1 = "top" | "left" | "right";

export type RawPoseCaptureV1<T> = Readonly<
  Record<RawScanFaceV1, readonly T[]>
>;

type FaceMappingV1 = Readonly<{
  rawFace: RawScanFaceV1;
  targetFace: CubeDraftFaceV1;
  sourceIndexes: readonly number[];
}>;

const IDENTITY = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8]);
const ROTATE_180 = Object.freeze([8, 7, 6, 5, 4, 3, 2, 1, 0]);
const ROTATE_CW = Object.freeze([6, 3, 0, 7, 4, 1, 8, 5, 2]);

/**
 * The only raw-camera-to-canonical mapping authority.
 * Canonical faces are always stored as viewed from outside the cube.
 */
export const SCAN_POSE_V1: Readonly<
  Record<ScanPoseNumberV1, readonly FaceMappingV1[]>
> = Object.freeze({
  1: Object.freeze([
    Object.freeze({ rawFace: "top", targetFace: "U", sourceIndexes: ROTATE_180 }),
    Object.freeze({ rawFace: "left", targetFace: "R", sourceIndexes: IDENTITY }),
    Object.freeze({ rawFace: "right", targetFace: "B", sourceIndexes: IDENTITY }),
  ]),
  2: Object.freeze([
    Object.freeze({ rawFace: "top", targetFace: "D", sourceIndexes: ROTATE_CW }),
    Object.freeze({ rawFace: "left", targetFace: "F", sourceIndexes: ROTATE_180 }),
    Object.freeze({ rawFace: "right", targetFace: "L", sourceIndexes: ROTATE_180 }),
  ]),
});

export const SCAN_REVIEW_NET_V1: Readonly<
  Record<CubeDraftFaceV1, Readonly<{ column: number; row: number }>>
> = Object.freeze({
  U: Object.freeze({ column: 2, row: 1 }),
  L: Object.freeze({ column: 1, row: 2 }),
  F: Object.freeze({ column: 2, row: 2 }),
  R: Object.freeze({ column: 3, row: 2 }),
  B: Object.freeze({ column: 4, row: 2 }),
  D: Object.freeze({ column: 2, row: 3 }),
});

export type CanonicalPoseCaptureV1<T> = Readonly<
  Partial<Record<CubeDraftFaceV1, readonly T[]>>
>;

export type ValidatedPoseCaptureV1 =
  | Readonly<{ ok: true; faces: CanonicalPoseCaptureV1<CubeDraftTokenV1> }>
  | Readonly<{ ok: false; reason: string }>;

const TOKEN_SET = new Set<string>(["U", "R", "F", "D", "L", "B", "N"]);

export function applyScanPoseMappingV1<T>(
  pose: ScanPoseNumberV1,
  raw: RawPoseCaptureV1<T>
): CanonicalPoseCaptureV1<T> {
  const faces: Partial<Record<CubeDraftFaceV1, readonly T[]>> = {};

  for (const mapping of SCAN_POSE_V1[pose]) {
    const source = raw[mapping.rawFace];
    if (source.length !== 9) {
      throw new RangeError(`${mapping.rawFace} must contain exactly 9 observations.`);
    }
    faces[mapping.targetFace] = Object.freeze(
      mapping.sourceIndexes.map((index) => source[index])
    );
  }

  return Object.freeze(faces);
}

export function validateAndMapPoseCaptureV1(
  pose: ScanPoseNumberV1,
  raw: RawPoseCaptureV1<unknown>
): ValidatedPoseCaptureV1 {
  for (const mapping of SCAN_POSE_V1[pose]) {
    const observations = raw[mapping.rawFace];
    if (observations.length !== 9) {
      return Object.freeze({
        ok: false,
        reason: `${mapping.rawFace} face did not contain 9 observations.`,
      });
    }

    if (
      observations.some(
        (token) => typeof token !== "string" || !TOKEN_SET.has(token)
      )
    ) {
      return Object.freeze({
        ok: false,
        reason: `${mapping.rawFace} face contained an unsupported observation.`,
      });
    }

    if (observations[4] !== mapping.targetFace) {
      return Object.freeze({
        ok: false,
        reason: `Expected the ${mapping.targetFace} center in the ${mapping.rawFace} guide.`,
      });
    }
  }

  return Object.freeze({
    ok: true,
    faces: applyScanPoseMappingV1(
      pose,
      raw as RawPoseCaptureV1<CubeDraftTokenV1>
    ),
  });
}

export function combineCanonicalPoseCapturesV1(
  first: CanonicalPoseCaptureV1<CubeDraftTokenV1>,
  second: CanonicalPoseCaptureV1<CubeDraftTokenV1>
): CubeDraftV1 {
  const merged = { ...first, ...second };
  const draft: CubeDraftTokenV1[] = [];

  for (const face of CUBE_DRAFT_FACES_V1) {
    const stickers = merged[face];
    if (stickers === undefined || stickers.length !== 9) {
      throw new Error(`Missing canonical ${face} face.`);
    }
    draft.push(...stickers);
  }

  return Object.freeze(draft);
}
