import type { Move } from "../cube/moves";

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

type DecodedCubies = {
  cornerPermutation: number[];
  cornerOrientation: number[];
  edgePermutation: number[];
  edgeOrientation: number[];
};

function axis(face: string): number {
  if (face === "U" || face === "D") return 0;
  if (face === "R" || face === "L") return 1;
  if (face === "F" || face === "B") return 2;
  throw new Error(`Unknown face: ${face}`);
}

function normalizedEntropy(counts: readonly number[], normalizationCategories: number): number {
  const total = counts.reduce((sum, value) => sum + value, 0);
  if (total === 0) return 0;
  let entropy = 0;
  for (const count of counts) {
    if (count === 0) continue;
    const p = count / total;
    entropy -= p * Math.log(p);
  }
  return entropy / Math.log(normalizationCategories);
}

function cycleCount(permutation: readonly number[]): number {
  const seen = new Array<boolean>(permutation.length).fill(false);
  let cycles = 0;
  for (let i = 0; i < permutation.length; i++) {
    if (seen[i]) continue;
    cycles++;
    let current = i;
    while (!seen[current]) {
      seen[current] = true;
      current = permutation[current];
    }
  }
  return cycles;
}

export function decodeCubies(facelets: string): DecodedCubies {
  if (!/^[URFDLB]{54}$/.test(facelets)) {
    throw new Error("State must be a 54-character URFDLB facelet string");
  }

  const cornerPermutation: number[] = [];
  const cornerOrientation: number[] = [];
  for (const positions of CORNER_FACELETS) {
    const colors = positions.map((position) => facelets[position]);
    const twist = colors.findIndex((color) => color === "U" || color === "D");
    if (twist < 0) throw new Error("Invalid corner cubie");

    const second = colors[(twist + 1) % 3];
    const third = colors[(twist + 2) % 3];
    const cubie = CORNER_COLORS.findIndex(
      (candidate) => candidate[1] === second && candidate[2] === third,
    );
    if (cubie < 0) throw new Error("Invalid corner cubie");
    cornerPermutation.push(cubie);
    cornerOrientation.push(twist % 3);
  }

  const edgePermutation: number[] = [];
  const edgeOrientation: number[] = [];
  for (const [a, b] of EDGE_FACELETS) {
    const first = facelets[a];
    const second = facelets[b];
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
    if (cubie < 0) throw new Error("Invalid edge cubie");
    edgePermutation.push(cubie);
    edgeOrientation.push(flip);
  }

  if (new Set(cornerPermutation).size !== 8 || new Set(edgePermutation).size !== 12) {
    throw new Error("Duplicate or missing cubie");
  }

  return { cornerPermutation, cornerOrientation, edgePermutation, edgeOrientation };
}

export function axisTransitionEntropy(moves: readonly Move[]): number {
  if (moves.length < 2) return 0;
  const counts = new Array<number>(9).fill(0);
  for (let i = 0; i < moves.length - 1; i++) {
    const from = axis(moves[i][0]);
    const to = axis(moves[i + 1][0]);
    counts[from * 3 + to]++;
  }
  return normalizedEntropy(counts, 9);
}

export function moveTransitionEntropy(moves: readonly Move[]): number {
  if (moves.length < 2) return 0;
  const faces = ["U", "R", "F", "D", "L", "B"];
  const index = new Map(faces.map((face, i) => [face, i]));
  const counts = new Array<number>(36).fill(0);
  for (let i = 0; i < moves.length - 1; i++) {
    const from = index.get(moves[i][0])!;
    const to = index.get(moves[i + 1][0])!;
    counts[from * 6 + to]++;
  }
  return normalizedEntropy(counts, 36);
}

export function axisChangeRate(moves: readonly Move[]): number {
  if (moves.length < 2) return 0;
  let changes = 0;
  for (let i = 0; i < moves.length - 1; i++) {
    if (axis(moves[i][0]) !== axis(moves[i + 1][0])) changes++;
  }
  return changes / (moves.length - 1);
}

export function extractStateFeatures(facelets: string) {
  const decoded = decodeCubies(facelets);
  const twistedCornerCount = decoded.cornerOrientation.filter((value) => value !== 0).length;
  const flippedEdgeCount = decoded.edgeOrientation.filter((value) => value !== 0).length;
  const cornerCycleDeficit = 8 - cycleCount(decoded.cornerPermutation);
  const edgeCycleDeficit = 12 - cycleCount(decoded.edgePermutation);

  return {
    twistedCornerCount,
    flippedEdgeCount,
    cornerCycleDeficit,
    edgeCycleDeficit,
    permutationCycleDeficit: cornerCycleDeficit + edgeCycleDeficit,
  };
}
