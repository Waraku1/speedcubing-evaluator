import type { Move } from "../cube/moves";
import type { F2LSlot } from "./detection";

export type CanonicalF2LCategory =
  | "top-layer-pair"
  | "corner-in-slot"
  | "edge-in-slot"
  | "both-in-slot";

export type CanonicalF2LCaseDefinition = {
  number: number;
  id: string;
  category: CanonicalF2LCategory;
  cornerOrientation: 0 | 1 | 2;
  edgeOrientation: 0 | 1;
  relativePosition: 0 | 1 | 2 | 3 | null;
  algorithm: Move[];
};

type SideFace = "F" | "R" | "B" | "L";
type Face = "U" | "R" | "F" | "D" | "L" | "B";

const TOP_ALGORITHMS = [
  "R U R' F' U F R U R'",
  "R U' R' R U' R' U' R U R'",
  "U R U R' F' U' F R U R'",
  "R U' R' U2 R U R'",
  "R U' R' F' U' F U R U' R'",
  "F' U' F R U' R' F' U' F",
  "F' U F U2 F' U' F",
  "U' F' U' F R U R' F' U' F",
  "F' U' F U F' U F R U R'",
  "U' R U' R' U R U R'",
  "R U R'",
  "R U R' F' U F U R U' R'",
  "U' F' U F",
  "R U' R' U2 F' U' F",
  "U2 R U' R' F' U' F U' R U R'",
  "R U' R' F' U F U F' U' F",
  "F' U F U2 R U R'",
  "U R U' R'",
  "U' R U R' U2 R U' R'",
  "R U R' U R U' R' U R U' R'",
  "U F' U F U' F' U' F",
  "R U R' U' R U' R' F' U' F",
  "F' U' F R U R' U' F' U' F",
  "F' U' F",
] as const;

const SLOT_ROTATION: Readonly<Record<F2LSlot, 0 | 1 | 2 | 3>> = {
  FR: 0,
  BR: 1,
  BL: 2,
  FL: 3,
};

const FACE_ROTATIONS: readonly Readonly<Record<Face, Face>>[] = [
  { U: "U", D: "D", F: "F", R: "R", B: "B", L: "L" },
  { U: "U", D: "D", F: "R", R: "B", B: "L", L: "F" },
  { U: "U", D: "D", F: "B", R: "L", B: "F", L: "R" },
  { U: "U", D: "D", F: "L", R: "F", B: "R", L: "B" },
];

function parseAlgorithm(value: string): Move[] {
  return value.split(" ") as Move[];
}

export function topCaseNumber(
  cornerOrientation: 0 | 1 | 2,
  edgeOrientation: 0 | 1,
  relativePosition: 0 | 1 | 2 | 3,
): number {
  return cornerOrientation * 8 + edgeOrientation * 4 + relativePosition + 1;
}

export function cornerInSlotCaseNumber(
  cornerOrientation: 0 | 1 | 2,
  edgeOrientation: 0 | 1,
): number {
  return 25 + cornerOrientation * 2 + edgeOrientation;
}

export function edgeInSlotCaseNumber(
  cornerOrientation: 0 | 1 | 2,
  edgeOrientation: 0 | 1,
): number {
  return 31 + cornerOrientation * 2 + edgeOrientation;
}

export function bothInSlotCaseNumber(
  cornerOrientation: 0 | 1 | 2,
  edgeOrientation: 0 | 1,
): number {
  const combination = cornerOrientation * 2 + edgeOrientation;
  if (combination === 0) throw new Error("The solved pair is not an unsolved F2L case.");
  return 36 + combination;
}

function caseId(number: number): string {
  return `F2L-${String(number).padStart(2, "0")}`;
}

function buildCanonicalCases(): CanonicalF2LCaseDefinition[] {
  const cases: CanonicalF2LCaseDefinition[] = [];

  for (let corner = 0 as 0 | 1 | 2; corner < 3; corner = (corner + 1) as 0 | 1 | 2) {
    for (let edge = 0 as 0 | 1; edge < 2; edge = (edge + 1) as 0 | 1) {
      for (let relative = 0 as 0 | 1 | 2 | 3; relative < 4; relative = (relative + 1) as 0 | 1 | 2 | 3) {
        const number = topCaseNumber(corner, edge, relative);
        cases.push({
          number,
          id: caseId(number),
          category: "top-layer-pair",
          cornerOrientation: corner,
          edgeOrientation: edge,
          relativePosition: relative,
          algorithm: parseAlgorithm(TOP_ALGORITHMS[number - 1]),
        });
      }
    }
  }

  for (let corner = 0 as 0 | 1 | 2; corner < 3; corner = (corner + 1) as 0 | 1 | 2) {
    for (let edge = 0 as 0 | 1; edge < 2; edge = (edge + 1) as 0 | 1) {
      const cornerNumber = cornerInSlotCaseNumber(corner, edge);
      cases.push({
        number: cornerNumber,
        id: caseId(cornerNumber),
        category: "corner-in-slot",
        cornerOrientation: corner,
        edgeOrientation: edge,
        relativePosition: null,
        algorithm: [],
      });

      const edgeNumber = edgeInSlotCaseNumber(corner, edge);
      cases.push({
        number: edgeNumber,
        id: caseId(edgeNumber),
        category: "edge-in-slot",
        cornerOrientation: corner,
        edgeOrientation: edge,
        relativePosition: null,
        algorithm: [],
      });

      if (corner !== 0 || edge !== 0) {
        const bothNumber = bothInSlotCaseNumber(corner, edge);
        cases.push({
          number: bothNumber,
          id: caseId(bothNumber),
          category: "both-in-slot",
          cornerOrientation: corner,
          edgeOrientation: edge,
          relativePosition: null,
          algorithm: [],
        });
      }
    }
  }

  return cases.sort((left, right) => left.number - right.number);
}

export const CANONICAL_F2L_CASES: readonly CanonicalF2LCaseDefinition[] =
  Object.freeze(buildCanonicalCases());

export function getCanonicalF2LCase(number: number): CanonicalF2LCaseDefinition {
  const result = CANONICAL_F2L_CASES[number - 1];
  if (result === undefined || result.number !== number) {
    throw new Error(`[solveF2L] unknown canonical case ${number}`);
  }
  return result;
}

export function rotateFaceForSlot(face: SideFace, slot: F2LSlot): SideFace {
  return FACE_ROTATIONS[SLOT_ROTATION[slot]][face] as SideFace;
}

export function unrotateFaceFromSlot(face: SideFace, slot: F2LSlot): SideFace {
  const rotation = FACE_ROTATIONS[SLOT_ROTATION[slot]];
  const entry = (Object.entries(rotation) as [Face, Face][])
    .find(([, rotated]) => rotated === face);
  if (entry === undefined || entry[0] === "U" || entry[0] === "D") {
    throw new Error(`[solveF2L] cannot normalize face ${face} for ${slot}`);
  }
  return entry[0];
}

export function rotateAlgorithmForSlot(
  algorithm: readonly Move[],
  slot: F2LSlot,
): Move[] {
  const rotation = FACE_ROTATIONS[SLOT_ROTATION[slot]];
  return algorithm.map((move) =>
    `${rotation[move[0] as Face]}${move.slice(1)}` as Move,
  );
}
