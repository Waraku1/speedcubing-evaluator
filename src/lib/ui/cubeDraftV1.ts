export const CUBE_DRAFT_FACES_V1 = ["U", "R", "F", "D", "L", "B"] as const;

export type CubeDraftFaceV1 = (typeof CUBE_DRAFT_FACES_V1)[number];
export type CubeDraftTokenV1 = CubeDraftFaceV1 | "N";

export const CUBE_DRAFT_TOKENS_V1 = [
  ...CUBE_DRAFT_FACES_V1,
  "N",
] as const satisfies readonly CubeDraftTokenV1[];

export const CUBE_DRAFT_FACE_NAMES_V1: Readonly<
  Record<CubeDraftFaceV1, string>
> = Object.freeze({
  U: "White",
  R: "Red",
  F: "Green",
  D: "Yellow",
  L: "Orange",
  B: "Blue",
});

export const CUBE_DRAFT_CENTER_INDEXES_V1: Readonly<
  Record<CubeDraftFaceV1, number>
> = Object.freeze({
  U: 4,
  R: 13,
  F: 22,
  D: 31,
  L: 40,
  B: 49,
});

export const SOLVED_CUBE_DRAFT_FACELETS_V1 =
  "UUUUUUUUU" +
  "RRRRRRRRR" +
  "FFFFFFFFF" +
  "DDDDDDDDD" +
  "LLLLLLLLL" +
  "BBBBBBBBB";

export type CubeDraftV1 = readonly CubeDraftTokenV1[];
export type CubeDraftCountsV1 = Readonly<Record<CubeDraftFaceV1, number>>;

export type LocalCubeValidationV1 = Readonly<{
  state: "EMPTY" | "INCOMPLETE" | "INVALID" | "READY";
  counts: CubeDraftCountsV1;
  unknownCount: number;
  message: string;
  firstProblemIndex: number | null;
}>;

const FACE_SET = new Set<string>(CUBE_DRAFT_FACES_V1);
const TOKEN_SET = new Set<string>(CUBE_DRAFT_TOKENS_V1);
const CENTER_INDEX_SET = new Set<number>(
  Object.values(CUBE_DRAFT_CENTER_INDEXES_V1)
);

function emptyCounts(): Record<CubeDraftFaceV1, number> {
  return { U: 0, R: 0, F: 0, D: 0, L: 0, B: 0 };
}

export function createEmptyCubeDraftV1(): CubeDraftV1 {
  const draft = Array<CubeDraftTokenV1>(54).fill("N");

  for (const face of CUBE_DRAFT_FACES_V1) {
    draft[CUBE_DRAFT_CENTER_INDEXES_V1[face]] = face;
  }

  return Object.freeze(draft);
}

export function createSolvedCubeDraftV1(): CubeDraftV1 {
  return Object.freeze(
    SOLVED_CUBE_DRAFT_FACELETS_V1.split("") as CubeDraftTokenV1[]
  );
}

export function serializeCubeDraftV1(draft: readonly unknown[]): string {
  return draft.join("");
}

export function isEditableStickerIndexV1(index: number): boolean {
  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < 54 &&
    !CENTER_INDEX_SET.has(index)
  );
}

export function faceForStickerIndexV1(index: number): CubeDraftFaceV1 {
  if (!Number.isInteger(index) || index < 0 || index >= 54) {
    throw new RangeError("Sticker index must be between 0 and 53.");
  }

  return CUBE_DRAFT_FACES_V1[Math.floor(index / 9)];
}

export function updateCubeDraftTokenV1(
  draft: CubeDraftV1,
  index: number,
  token: CubeDraftTokenV1
): CubeDraftV1 {
  if (!isEditableStickerIndexV1(index) || !TOKEN_SET.has(token)) {
    return draft;
  }

  if (draft[index] === token) {
    return draft;
  }

  const next = [...draft];
  next[index] = token;
  return Object.freeze(next);
}

export function validateCubeDraftV1(
  draft: readonly unknown[]
): LocalCubeValidationV1 {
  const counts = emptyCounts();

  if (draft.length !== 54) {
    return Object.freeze({
      state: "INVALID",
      counts: Object.freeze(counts),
      unknownCount: 0,
      message: "The cube draft must contain exactly 54 stickers.",
      firstProblemIndex: null,
    });
  }

  let unknownCount = 0;

  for (let index = 0; index < draft.length; index += 1) {
    const token = draft[index];

    if (typeof token !== "string" || !TOKEN_SET.has(token)) {
      return Object.freeze({
        state: "INVALID",
        counts: Object.freeze(counts),
        unknownCount,
        message: "The cube draft contains an unsupported sticker token.",
        firstProblemIndex: index,
      });
    }

    if (token === "N") {
      unknownCount += 1;
    } else if (FACE_SET.has(token)) {
      counts[token as CubeDraftFaceV1] += 1;
    }
  }

  for (const face of CUBE_DRAFT_FACES_V1) {
    const centerIndex = CUBE_DRAFT_CENTER_INDEXES_V1[face];
    if (draft[centerIndex] !== face) {
      return Object.freeze({
        state: "INVALID",
        counts: Object.freeze(counts),
        unknownCount,
        message: `${face} face center must remain ${face}.`,
        firstProblemIndex: centerIndex,
      });
    }
  }

  for (const face of CUBE_DRAFT_FACES_V1) {
    if (counts[face] > 9) {
      return Object.freeze({
        state: "INVALID",
        counts: Object.freeze(counts),
        unknownCount,
        message: `${face} has ${counts[face]} stickers; no token may appear more than 9 times.`,
        firstProblemIndex: draft.findIndex((token) => token === face),
      });
    }
  }

  if (unknownCount === 48) {
    return Object.freeze({
      state: "EMPTY",
      counts: Object.freeze(counts),
      unknownCount,
      message: "Begin by assigning the 48 unknown stickers.",
      firstProblemIndex: draft.findIndex((token) => token === "N"),
    });
  }

  if (unknownCount > 0) {
    return Object.freeze({
      state: "INCOMPLETE",
      counts: Object.freeze(counts),
      unknownCount,
      message: `${unknownCount} unknown sticker${unknownCount === 1 ? "" : "s"} remaining.`,
      firstProblemIndex: draft.findIndex((token) => token === "N"),
    });
  }

  const incorrectFace = CUBE_DRAFT_FACES_V1.find(
    (face) => counts[face] !== 9
  );

  if (incorrectFace !== undefined) {
    return Object.freeze({
      state: "INVALID",
      counts: Object.freeze(counts),
      unknownCount,
      message: "A complete draft must contain exactly 9 stickers of each token.",
      firstProblemIndex: draft.findIndex((token) => token === incorrectFace),
    });
  }

  return Object.freeze({
    state: "READY",
    counts: Object.freeze(counts),
    unknownCount: 0,
    message: "Ready for server validation",
    firstProblemIndex: null,
  });
}
