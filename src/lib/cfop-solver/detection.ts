/**
 * detection.ts — physical cubie-aware CFOP phase detection
 *
 * Sticker layout:
 *   U: 0-8, R: 9-17, F: 18-26,
 *   D: 27-35, L: 36-44, B: 45-53.
 */

import {
  SOLVED_STATE,
  type CubeState,
} from "../cube/moves";

export type F2LSlot = "FR" | "FL" | "BR" | "BL";

export type PhaseStatus = {
  solved: boolean;
  unsolved: string[];
};

export type F2LSlotStatus = {
  slot: F2LSlot;
  solved: boolean;
  wrongStickers: Array<{
    index: number;
    expected: string;
    actual: string;
  }>;
};

export type EdgeLocation = {
  position: number;
  orientation: 0 | 1;
  code: number;
};

export type CornerLocation = {
  position: number;
  orientation: 0 | 1 | 2;
  code: number;
};

export const ALL_F2L_SLOTS: readonly F2LSlot[] = ["FR", "FL", "BR", "BL"];

/**
 * Edge position order:
 *   UF, UR, UB, UL,
 *   FR, FL, BR, BL,
 *   DF, DR, DB, DL.
 */
export const EDGE_POSITIONS: readonly (readonly [number, number])[] = [
  [7, 19], [5, 10], [1, 46], [3, 37],
  [23, 12], [21, 41], [48, 14], [50, 39],
  [28, 25], [32, 16], [34, 52], [30, 43],
];

/**
 * Corner position order:
 *   UFR, UFL, UBR, UBL,
 *   DFR, DFL, DBR, DBL.
 */
export const CORNER_POSITIONS: readonly (readonly [number, number, number])[] = [
  [8, 9, 20], [6, 18, 38], [2, 11, 45], [0, 36, 47],
  [29, 15, 26], [27, 24, 44], [35, 17, 51], [33, 42, 53],
];

const TOP_EDGE_POSITIONS = EDGE_POSITIONS.slice(0, 4);
const TOP_CORNER_POSITIONS = CORNER_POSITIONS.slice(0, 4);

const CROSS_STICKERS: ReadonlyArray<{
  name: string;
  stickers: ReadonlyArray<readonly [number, string]>;
}> = [
  { name: "D-F", stickers: [[28, "D"], [25, "F"]] },
  { name: "D-R", stickers: [[32, "D"], [16, "R"]] },
  { name: "D-B", stickers: [[34, "D"], [52, "B"]] },
  { name: "D-L", stickers: [[30, "D"], [43, "L"]] },
];

const F2L_STICKERS: Readonly<Record<F2LSlot, ReadonlyArray<readonly [number, string]>>> = {
  FR: [
    [29, "D"], [26, "F"], [15, "R"],
    [23, "F"], [12, "R"],
  ],
  FL: [
    [27, "D"], [24, "F"], [44, "L"],
    [21, "F"], [41, "L"],
  ],
  BR: [
    [35, "D"], [51, "B"], [17, "R"],
    [48, "B"], [14, "R"],
  ],
  BL: [
    [33, "D"], [53, "B"], [42, "L"],
    [50, "B"], [39, "L"],
  ],
};

const F2L_PIECES: Readonly<Record<F2LSlot, {
  corner: readonly [string, string, string];
  edge: readonly [string, string];
}>> = {
  FR: { corner: ["D", "F", "R"], edge: ["F", "R"] },
  FL: { corner: ["D", "F", "L"], edge: ["F", "L"] },
  BR: { corner: ["D", "B", "R"], edge: ["B", "R"] },
  BL: { corner: ["D", "B", "L"], edge: ["B", "L"] },
};

function at(state: CubeState, index: number): string {
  return state[index] ?? "";
}

function makeStatus(unsolved: string[]): PhaseStatus {
  return {
    solved: unsolved.length === 0,
    unsolved,
  };
}

function hasSameColors(actual: readonly string[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length) return false;
  const left = [...actual].sort().join("");
  const right = [...expected].sort().join("");
  return left === right;
}

export function locateEdge(
  state: CubeState,
  firstColor: string,
  secondColor: string,
): EdgeLocation {
  for (let position = 0; position < EDGE_POSITIONS.length; position++) {
    const [a, b] = EDGE_POSITIONS[position];
    const first = at(state, a);
    const second = at(state, b);

    if (first === firstColor && second === secondColor) {
      return {
        position,
        orientation: 0,
        code: position * 2,
      };
    }

    if (first === secondColor && second === firstColor) {
      return {
        position,
        orientation: 1,
        code: position * 2 + 1,
      };
    }
  }

  throw new Error(
    `[detection] edge ${firstColor}${secondColor} was not found in a physical position`,
  );
}

/**
 * The first color is the orientation reference color.
 * For F2L corners this is D; for last-layer corners this is U.
 */
export function locateCorner(
  state: CubeState,
  colors: readonly [string, string, string],
): CornerLocation {
  for (let position = 0; position < CORNER_POSITIONS.length; position++) {
    const indices = CORNER_POSITIONS[position];
    const actual = indices.map((index) => at(state, index));

    if (!hasSameColors(actual, colors)) continue;

    const orientation = actual.indexOf(colors[0]);
    if (orientation < 0 || orientation > 2) {
      throw new Error(`[detection] invalid corner orientation for ${colors.join("")}`);
    }

    return {
      position,
      orientation: orientation as 0 | 1 | 2,
      code: position * 3 + orientation,
    };
  }

  throw new Error(
    `[detection] corner ${colors.join("")} was not found in a physical position`,
  );
}

export function isCrossSolved(state: CubeState): PhaseStatus {
  const unsolved: string[] = [];

  for (const index of [28, 30, 32, 34]) {
    if (at(state, index) !== "D") unsolved.push(`D-cross-${index}`);
  }

  return makeStatus(unsolved);
}

export function isAlignedCrossSolved(state: CubeState): PhaseStatus {
  const unsolved: string[] = [];

  for (const edge of CROSS_STICKERS) {
    const solved = edge.stickers.every(
      ([index, expected]) => at(state, index) === expected,
    );

    if (!solved) unsolved.push(edge.name);
  }

  return makeStatus(unsolved);
}

export function getF2LSlotStatus(
  state: CubeState,
  slot: F2LSlot,
): F2LSlotStatus {
  const wrongStickers: F2LSlotStatus["wrongStickers"] = [];

  for (const [index, expected] of F2L_STICKERS[slot]) {
    const actual = at(state, index);
    if (actual !== expected) {
      wrongStickers.push({ index, expected, actual });
    }
  }

  return {
    slot,
    solved: wrongStickers.length === 0,
    wrongStickers,
  };
}

export function isF2LSlotSolved(state: CubeState, slot: F2LSlot): boolean {
  return getF2LSlotStatus(state, slot).solved;
}

export function getUnsolvedF2LSlots(state: CubeState): F2LSlot[] {
  return ALL_F2L_SLOTS.filter((slot) => !isF2LSlotSolved(state, slot));
}

export function countSolvedF2LSlots(state: CubeState): number {
  return ALL_F2L_SLOTS.length - getUnsolvedF2LSlots(state).length;
}

export function getF2LSolvedMask(state: CubeState): number {
  return ALL_F2L_SLOTS.reduce(
    (mask, slot, index) => mask | (isF2LSlotSolved(state, slot) ? 1 << index : 0),
    0,
  );
}

export function getF2LPairKey(state: CubeState, slot: F2LSlot): number {
  const pieces = F2L_PIECES[slot];
  const corner = locateCorner(state, pieces.corner);
  const edge = locateEdge(state, pieces.edge[0], pieces.edge[1]);

  return corner.code * 24 + edge.code;
}

export function isF2LSolved(state: CubeState): PhaseStatus {
  return makeStatus(getUnsolvedF2LSlots(state));
}

export function isOLLSolved(state: CubeState): boolean {
  for (let index = 0; index < 9; index++) {
    if (at(state, index) !== "U") return false;
  }
  return true;
}

export function isPLLSolved(state: CubeState): boolean {
  return state === SOLVED_STATE;
}

/**
 * Full last-layer orientation key.
 *
 * Edge digits:
 *   0 = U sticker is on U face
 *   1 = U sticker is on the side face
 *   x = the top position does not currently contain a U-layer edge
 *
 * Corner digits:
 *   0/1/2 = index of the U sticker inside the corner-position tuple
 *   x = the top position does not currently contain a U-layer corner
 *
 * Once F2L is solved, this key has exactly 216 physically reachable values.
 */
export function getOLLKey(state: CubeState): string {
  const edges = TOP_EDGE_POSITIONS.map(([a, b]) => {
    if (at(state, a) === "U") return "0";
    if (at(state, b) === "U") return "1";
    return "x";
  }).join("");

  const corners = TOP_CORNER_POSITIONS.map((indices) => {
    const orientation = indices.findIndex((index) => at(state, index) === "U");
    return orientation < 0 ? "x" : String(orientation);
  }).join("");

  return `E${edges}-C${corners}`;
}

/**
 * With OLL solved, the U face is fixed and the four side top rows uniquely
 * determine one of the 288 PLL states.
 */
export function getPLLKey(state: CubeState): string {
  const indices = [
    9, 10, 11,
    18, 19, 20,
    36, 37, 38,
    45, 46, 47,
  ];

  return indices.map((index) => at(state, index)).join("");
}

export function getStateKey(state: CubeState): string {
  return state;
}

export function getCFOPProgress(state: CubeState): {
  cross: PhaseStatus;
  alignedCross: PhaseStatus;
  f2l: PhaseStatus;
  oll: { solved: boolean; key: string };
  pll: { solved: boolean; key: string };
} {
  return {
    cross: isCrossSolved(state),
    alignedCross: isAlignedCrossSolved(state),
    f2l: isF2LSolved(state),
    oll: {
      solved: isOLLSolved(state),
      key: getOLLKey(state),
    },
    pll: {
      solved: isPLLSolved(state),
      key: getPLLKey(state),
    },
  };
}
