import { createHash } from "node:crypto";

import Cube from "cubejs";

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

  if (new Set(cp).size !== 8 || cp.some((value) => value < 0 || value > 7)) {
    throw new Error("invalid corner permutation");
  }

  if (new Set(ep).size !== 12 || ep.some((value) => value < 0 || value > 11)) {
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

export function generateRandomState(
  studySeed: string,
  sampleIndex: number,
): GeneratedRandomState {
  const coordinates = generateRandomStateCoordinates(studySeed, sampleIndex);
  assertRandomStateCoordinates(coordinates);

  const cube = new Cube({
    cp: [...coordinates.cp],
    co: [...coordinates.co],
    ep: [...coordinates.ep],
    eo: [...coordinates.eo],
  });

  const stateSignature = cube.asString();

  return {
    studySeed,
    sampleIndex,
    coordinates,
    stateSignature,
  };
}
