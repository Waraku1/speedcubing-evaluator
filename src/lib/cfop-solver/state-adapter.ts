import type { CubeState } from "../cube/moves";

export const CFOP_FACELET_FORMAT = "URFDLB_FACELETS_V1" as const;

export type URFDLBFaceletInput = Readonly<{
  format: typeof CFOP_FACELET_FORMAT;
  facelets: string;
}>;

export class InvalidCubeStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCubeStateError";
  }
}

const FACE_SYMBOLS = ["U", "R", "F", "D", "L", "B"] as const;
const CENTER_REQUIREMENTS = [
  [4, "U"], [13, "R"], [22, "F"],
  [31, "D"], [40, "L"], [49, "B"],
] as const;

const CORNER_FACELETS = [
  [8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11],
  [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51],
] as const;

const CORNER_COLORS = [
  ["U", "R", "F"], ["U", "F", "L"], ["U", "L", "B"], ["U", "B", "R"],
  ["D", "F", "R"], ["D", "L", "F"], ["D", "B", "L"], ["D", "R", "B"],
] as const;

const EDGE_FACELETS = [
  [5, 10], [7, 19], [3, 37], [1, 46],
  [32, 16], [28, 25], [30, 43], [34, 52],
  [23, 12], [21, 41], [50, 39], [48, 14],
] as const;

const EDGE_COLORS = [
  ["U", "R"], ["U", "F"], ["U", "L"], ["U", "B"],
  ["D", "R"], ["D", "F"], ["D", "L"], ["D", "B"],
  ["F", "R"], ["F", "L"], ["B", "L"], ["B", "R"],
] as const;

function assertRepresentation(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length !== 54) {
    throw new InvalidCubeStateError("CubeState must be a 54-character URFDLB facelet string.");
  }
  if (!/^[URFDLB]{54}$/.test(value)) {
    throw new InvalidCubeStateError("CubeState contains a facelet outside U, R, F, D, L, B.");
  }

  for (const face of FACE_SYMBOLS) {
    if ([...value].filter((token) => token === face).length !== 9) {
      throw new InvalidCubeStateError(`CubeState must contain exactly nine ${face} facelets.`);
    }
  }

  for (const [index, expected] of CENTER_REQUIREMENTS) {
    if (value[index] !== expected) {
      throw new InvalidCubeStateError(`CubeState center ${index} must be ${expected}.`);
    }
  }
}

function permutationParity(permutation: readonly number[]): number {
  let inversions = 0;
  for (let left = 0; left < permutation.length; left++) {
    for (let right = left + 1; right < permutation.length; right++) {
      if (permutation[left] > permutation[right]) inversions++;
    }
  }
  return inversions % 2;
}

function decodeCorners(facelets: string): { permutation: number[]; orientation: number[] } {
  const permutation: number[] = [];
  const orientation: number[] = [];

  for (const positions of CORNER_FACELETS) {
    const colors = positions.map((position) => facelets[position]);
    const twist = colors.findIndex((color) => color === "U" || color === "D");
    if (twist < 0) throw new InvalidCubeStateError("CubeState contains an invalid corner cubie.");

    const second = colors[(twist + 1) % 3];
    const third = colors[(twist + 2) % 3];
    const cubie = CORNER_COLORS.findIndex(
      (candidate) => candidate[1] === second && candidate[2] === third,
    );
    if (cubie < 0) throw new InvalidCubeStateError("CubeState contains an invalid corner cubie.");

    permutation.push(cubie);
    orientation.push(twist % 3);
  }

  if (new Set(permutation).size !== 8) {
    throw new InvalidCubeStateError("CubeState contains a duplicate or missing corner cubie.");
  }
  return { permutation, orientation };
}

function decodeEdges(facelets: string): { permutation: number[]; orientation: number[] } {
  const permutation: number[] = [];
  const orientation: number[] = [];

  for (const [firstPosition, secondPosition] of EDGE_FACELETS) {
    const first = facelets[firstPosition];
    const second = facelets[secondPosition];
    let cubie = EDGE_COLORS.findIndex(
      (candidate) => candidate[0] === first && candidate[1] === second,
    );
    let flip = 0;
    if (cubie < 0) {
      cubie = EDGE_COLORS.findIndex(
        (candidate) => candidate[0] === second && candidate[1] === first,
      );
      flip = 1;
    }
    if (cubie < 0) throw new InvalidCubeStateError("CubeState contains an invalid edge cubie.");

    permutation.push(cubie);
    orientation.push(flip);
  }

  if (new Set(permutation).size !== 12) {
    throw new InvalidCubeStateError("CubeState contains a duplicate or missing edge cubie.");
  }
  return { permutation, orientation };
}

export function assertValidCubeState(value: unknown): asserts value is CubeState {
  assertRepresentation(value);
  const corners = decodeCorners(value);
  const edges = decodeEdges(value);

  if (corners.orientation.reduce((sum, orientation) => sum + orientation, 0) % 3 !== 0) {
    throw new InvalidCubeStateError("CubeState has an impossible corner orientation.");
  }
  if (edges.orientation.reduce((sum, orientation) => sum + orientation, 0) % 2 !== 0) {
    throw new InvalidCubeStateError("CubeState has an impossible edge orientation.");
  }
  if (permutationParity(corners.permutation) !== permutationParity(edges.permutation)) {
    throw new InvalidCubeStateError("CubeState has an impossible cubie permutation parity.");
  }
}

export function cubeStateFromFacelets(input: URFDLBFaceletInput): CubeState {
  if (input?.format !== CFOP_FACELET_FORMAT) {
    throw new InvalidCubeStateError(`Facelet input format must be ${CFOP_FACELET_FORMAT}.`);
  }
  assertValidCubeState(input.facelets);
  return input.facelets;
}
