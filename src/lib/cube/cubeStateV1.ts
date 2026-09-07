import {
  CUBE_FACELET_FORMAT_V1,
  type CubeFaceletStateV1,
} from "../../types/solver-v1";
import { sha256V1 } from "../solver/solverIdentityV1";
import { SolverV1Error } from "../solver/solverErrorsV1";

const FACE_SYMBOLS = ["U", "R", "F", "D", "L", "B"] as const;
const CENTER_REQUIREMENTS = [
  [4, "U"],
  [13, "R"],
  [22, "F"],
  [31, "D"],
  [40, "L"],
  [49, "B"],
] as const;

const CORNER_FACELETS = [
  [8, 9, 20],
  [6, 18, 38],
  [0, 36, 47],
  [2, 45, 11],
  [29, 26, 15],
  [27, 44, 24],
  [33, 53, 42],
  [35, 17, 51],
] as const;

const CORNER_COLORS = [
  ["U", "R", "F"],
  ["U", "F", "L"],
  ["U", "L", "B"],
  ["U", "B", "R"],
  ["D", "F", "R"],
  ["D", "L", "F"],
  ["D", "B", "L"],
  ["D", "R", "B"],
] as const;

const EDGE_FACELETS = [
  [5, 10],
  [7, 19],
  [3, 37],
  [1, 46],
  [32, 16],
  [28, 25],
  [30, 43],
  [34, 52],
  [23, 12],
  [21, 41],
  [50, 39],
  [48, 14],
] as const;

const EDGE_COLORS = [
  ["U", "R"],
  ["U", "F"],
  ["U", "L"],
  ["U", "B"],
  ["D", "R"],
  ["D", "F"],
  ["D", "L"],
  ["D", "B"],
  ["F", "R"],
  ["F", "L"],
  ["B", "L"],
  ["B", "R"],
] as const;

function stateIdFor(facelets: string): string {
  return sha256V1(CUBE_FACELET_FORMAT_V1 + facelets);
}

function assertRepresentation(facelets: unknown): asserts facelets is string {
  if (typeof facelets !== "string" || facelets.length !== 54) {
    throw new SolverV1Error("INVALID_CUBE_STATE");
  }

  if (!/^[URFDLB]{54}$/.test(facelets)) {
    throw new SolverV1Error("INVALID_CUBE_STATE");
  }

  const counts = new Map<string, number>(
    FACE_SYMBOLS.map((face) => [face, 0])
  );

  for (const facelet of facelets) {
    counts.set(facelet, (counts.get(facelet) ?? 0) + 1);
  }

  if (FACE_SYMBOLS.some((face) => counts.get(face) !== 9)) {
    throw new SolverV1Error("INVALID_CUBE_STATE");
  }

  if (
    CENTER_REQUIREMENTS.some(
      ([index, expected]) => facelets[index] !== expected
    )
  ) {
    throw new SolverV1Error("INVALID_CUBE_STATE");
  }
}

function permutationParity(permutation: readonly number[]): number {
  let inversions = 0;

  for (let left = 0; left < permutation.length; left += 1) {
    for (let right = left + 1; right < permutation.length; right += 1) {
      if (permutation[left] > permutation[right]) {
        inversions += 1;
      }
    }
  }

  return inversions % 2;
}

function decodeCorners(facelets: string): {
  permutation: number[];
  orientation: number[];
} {
  const permutation: number[] = [];
  const orientation: number[] = [];

  for (const positions of CORNER_FACELETS) {
    const colors = positions.map((position) => facelets[position]);
    const twist = colors.findIndex(
      (color) => color === "U" || color === "D"
    );

    if (twist < 0) {
      throw new SolverV1Error("UNSOLVABLE_CUBE");
    }

    const second = colors[(twist + 1) % 3];
    const third = colors[(twist + 2) % 3];
    const cubie = CORNER_COLORS.findIndex(
      (candidate) => candidate[1] === second && candidate[2] === third
    );

    if (cubie < 0) {
      throw new SolverV1Error("UNSOLVABLE_CUBE");
    }

    permutation.push(cubie);
    orientation.push(twist % 3);
  }

  if (new Set(permutation).size !== 8) {
    throw new SolverV1Error("UNSOLVABLE_CUBE");
  }

  return { permutation, orientation };
}

function decodeEdges(facelets: string): {
  permutation: number[];
  orientation: number[];
} {
  const permutation: number[] = [];
  const orientation: number[] = [];

  for (const [firstPosition, secondPosition] of EDGE_FACELETS) {
    const first = facelets[firstPosition];
    const second = facelets[secondPosition];
    let cubie = EDGE_COLORS.findIndex(
      (candidate) => candidate[0] === first && candidate[1] === second
    );
    let flip = 0;

    if (cubie < 0) {
      cubie = EDGE_COLORS.findIndex(
        (candidate) => candidate[0] === second && candidate[1] === first
      );
      flip = 1;
    }

    if (cubie < 0) {
      throw new SolverV1Error("UNSOLVABLE_CUBE");
    }

    permutation.push(cubie);
    orientation.push(flip);
  }

  if (new Set(permutation).size !== 12) {
    throw new SolverV1Error("UNSOLVABLE_CUBE");
  }

  return { permutation, orientation };
}

export function assertPhysicallySolvableCubeFaceletsV1(
  facelets: string
): void {
  assertRepresentation(facelets);

  const corners = decodeCorners(facelets);
  const edges = decodeEdges(facelets);

  if (
    corners.orientation.reduce((sum, value) => sum + value, 0) % 3 !==
    0
  ) {
    throw new SolverV1Error("UNSOLVABLE_CUBE");
  }

  if (edges.orientation.reduce((sum, value) => sum + value, 0) % 2 !== 0) {
    throw new SolverV1Error("UNSOLVABLE_CUBE");
  }

  if (
    permutationParity(corners.permutation) !==
    permutationParity(edges.permutation)
  ) {
    throw new SolverV1Error("UNSOLVABLE_CUBE");
  }
}

export function createCubeFaceletStateV1(facelets: unknown): CubeFaceletStateV1 {
  assertRepresentation(facelets);
  assertPhysicallySolvableCubeFaceletsV1(facelets);

  return Object.freeze({
    schemaId: "CubeFaceletStateV1",
    format: CUBE_FACELET_FORMAT_V1,
    facelets,
    stateId: stateIdFor(facelets),
  });
}

export function parseCubeFaceletStateV1(input: unknown): CubeFaceletStateV1 {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new SolverV1Error("INVALID_CUBE_STATE");
  }

  const record = input as Record<string, unknown>;
  const expectedKeys = ["facelets", "format", "schemaId", "stateId"];

  if (
    Object.keys(record).sort().join("|") !== expectedKeys.join("|") ||
    record.schemaId !== "CubeFaceletStateV1" ||
    record.format !== CUBE_FACELET_FORMAT_V1
  ) {
    throw new SolverV1Error("INVALID_CUBE_STATE");
  }

  assertRepresentation(record.facelets);

  if (record.stateId !== stateIdFor(record.facelets)) {
    throw new SolverV1Error("INVALID_CUBE_STATE");
  }

  assertPhysicallySolvableCubeFaceletsV1(record.facelets);

  return Object.freeze({
    schemaId: "CubeFaceletStateV1",
    format: CUBE_FACELET_FORMAT_V1,
    facelets: record.facelets,
    stateId: record.stateId,
  });
}
