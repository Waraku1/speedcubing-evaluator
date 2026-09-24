import { createHash } from "node:crypto";

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

const CENTERS = [
  [4, "U"], [13, "R"], [22, "F"],
  [31, "D"], [40, "L"], [49, "B"],
] as const;

export type RandomStateCoordinates = Readonly<{
  cp: number[];
  co: number[];
  ep: number[];
  eo: number[];
}>;

export type GeneratedRandomState = Readonly<{
  studySeed: string;
  sampleIndex: number;
  coordinates: RandomStateCoordinates;
  stateSignature: string;
}>;

class SeededRandomStream {
  private counter = 0;

  constructor(private readonly seed: string) {
    if (seed.length === 0) throw new Error("seed must be non-empty");
  }

  private nextUint32(): number {
    const digest = createHash("sha256")
      .update(this.seed)
      .update("\0")
      .update(String(this.counter++))
      .digest();

    return digest.readUInt32BE(0);
  }

  int(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 0x1_0000_0000) {
      throw new Error(`invalid maxExclusive: ${maxExclusive}`);
    }

    const range = 0x1_0000_0000;
    const limit = range - (range % maxExclusive);

    while (true) {
      const value = this.nextUint32();
      if (value < limit) return value % maxExclusive;
    }
  }
}

function randomPermutation(size: number, random: SeededRandomStream): number[] {
  const values = Array.from({ length: size }, (_, index) => index);

  for (let i = size - 1; i > 0; i--) {
    const j = random.int(i + 1);
    [values[i], values[j]] = [values[j], values[i]];
  }

  return values;
}

export function permutationParity(permutation: readonly number[]): 0 | 1 {
  let inversions = 0;

  for (let i = 0; i < permutation.length; i++) {
    for (let j = i + 1; j < permutation.length; j++) {
      if (permutation[i] > permutation[j]) inversions++;
    }
  }

  return (inversions % 2) as 0 | 1;
}

export function generateRandomStateCoordinates(
  studySeed: string,
  sampleIndex: number,
): RandomStateCoordinates {
  if (!Number.isInteger(sampleIndex) || sampleIndex < 0) {
    throw new Error("sampleIndex must be a non-negative integer");
  }

  const random = new SeededRandomStream(`${studySeed}\0sample:${sampleIndex}`);

  const cp = randomPermutation(8, random);

  const co = new Array<number>(8).fill(0);
  let cornerOrientationSum = 0;
  for (let i = 0; i < 7; i++) {
    co[i] = random.int(3);
    cornerOrientationSum += co[i];
  }
  co[7] = (3 - (cornerOrientationSum % 3)) % 3;

  const ep = randomPermutation(12, random);
  if (permutationParity(ep) !== permutationParity(cp)) {
    [ep[0], ep[1]] = [ep[1], ep[0]];
  }

  const eo = new Array<number>(12).fill(0);
  let edgeOrientationSum = 0;
  for (let i = 0; i < 11; i++) {
    eo[i] = random.int(2);
    edgeOrientationSum += eo[i];
  }
  eo[11] = edgeOrientationSum % 2;

  return { cp, co, ep, eo };
}

export function assertRandomStateCoordinates(
  coordinates: RandomStateCoordinates,
): void {
  const { cp, co, ep, eo } = coordinates;

  if (
    cp.length !== 8 ||
    co.length !== 8 ||
    ep.length !== 12 ||
    eo.length !== 12
  ) {
    throw new Error("invalid random-state coordinate lengths");
  }

  if (new Set(cp).size !== 8 || cp.some((value) => !Number.isInteger(value) || value < 0 || value > 7)) {
    throw new Error("invalid corner permutation");
  }

  if (new Set(ep).size !== 12 || ep.some((value) => !Number.isInteger(value) || value < 0 || value > 11)) {
    throw new Error("invalid edge permutation");
  }

  if (co.some((value) => !Number.isInteger(value) || value < 0 || value > 2)) {
    throw new Error("invalid corner orientation");
  }

  if (eo.some((value) => value !== 0 && value !== 1)) {
    throw new Error("invalid edge orientation");
  }

  if (co.reduce((sum, value) => sum + value, 0) % 3 !== 0) {
    throw new Error("corner orientation constraint failed");
  }

  if (eo.reduce((sum, value) => sum + value, 0) % 2 !== 0) {
    throw new Error("edge orientation constraint failed");
  }

  if (permutationParity(cp) !== permutationParity(ep)) {
    throw new Error("permutation parity constraint failed");
  }
}

export function encodeRandomStateFacelets(
  coordinates: RandomStateCoordinates,
): string {
  assertRandomStateCoordinates(coordinates);

  const facelets = new Array<string>(54).fill("?");

  for (const [index, color] of CENTERS) {
    facelets[index] = color;
  }

  for (let position = 0; position < CORNER_FACELETS.length; position++) {
    const cubie = coordinates.cp[position];
    const orientation = coordinates.co[position];
    const colors = CORNER_COLORS[cubie];
    const indices = CORNER_FACELETS[position];

    facelets[indices[orientation]] = colors[0];
    facelets[indices[(orientation + 1) % 3]] = colors[1];
    facelets[indices[(orientation + 2) % 3]] = colors[2];
  }

  for (let position = 0; position < EDGE_FACELETS.length; position++) {
    const cubie = coordinates.ep[position];
    const orientation = coordinates.eo[position];
    const colors = EDGE_COLORS[cubie];
    const indices = EDGE_FACELETS[position];

    if (orientation === 0) {
      facelets[indices[0]] = colors[0];
      facelets[indices[1]] = colors[1];
    } else {
      facelets[indices[0]] = colors[1];
      facelets[indices[1]] = colors[0];
    }
  }

  if (facelets.some((value) => value === "?")) {
    throw new Error("failed to encode every facelet");
  }

  return facelets.join("");
}

export function generateRandomState(
  studySeed: string,
  sampleIndex: number,
): GeneratedRandomState {
  const coordinates = generateRandomStateCoordinates(studySeed, sampleIndex);
  const stateSignature = encodeRandomStateFacelets(coordinates);

  return {
    studySeed,
    sampleIndex,
    coordinates,
    stateSignature,
  };
}
