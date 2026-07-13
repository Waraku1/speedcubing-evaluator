/**
 * oll-pll.ts — direct last-layer tables with weighted finite fallbacks
 *
 * OLL:
 *   - direct one-look algorithms for the outer-turn cases available in the
 *     registered full-OLL set
 *   - a weighted 216-state finite fallback for every remaining orientation
 *
 * PLL:
 *   - direct algorithms for 19 named PLL cases
 *   - a weighted 288-state finite fallback for H/Z and any unrecognised case
 *
 * Runtime solving is a single key lookup followed by one validated sequence.
 * No raw-move search, cubejs, or complete-solver.ts is used.
 */

import {
  applyMoves,
  cancelMoves,
  countQTM,
  invertMoves,
  SOLVED_STATE,
  type CubeState,
  type Move,
} from "../cube/moves";

import {
  getOLLKey,
  getPLLKey,
  isF2LSolved,
  isOLLSolved,
  isPLLSolved,
} from "./detection";

export type OLLResult = {
  moves: Move[];
  depth: number;
  stateAfter: CubeState;
  caseId: string;
  algorithmIds: string[];
};

export type PLLResult = {
  moves: Move[];
  depth: number;
  stateAfter: CubeState;
  caseId: string;
  algorithmIds: string[];
};

type HumanMacro = {
  id: string;
  moves: Move[];
  description: string;
};

type SolutionEntry = {
  moves: Move[];
  algorithmIds: string[];
  caseId: string;
  source: "direct" | "weighted-fallback" | "skip";
};

type Face = "U" | "R" | "F" | "D" | "L" | "B";
type RotationAxis = "x" | "y" | "z";
type Frame = Record<Face, Face>;

const FACES: readonly Face[] = ["U", "R", "F", "D", "L", "B"];

const IDENTITY_FRAME: Frame = {
  U: "U",
  R: "R",
  F: "F",
  D: "D",
  L: "L",
  B: "B",
};

/**
 * After a positive cube rotation, this maps a face name in the new frame to
 * the corresponding face in the previous frame.
 */
const POSITIVE_ROTATION_FRAME: Readonly<Record<RotationAxis, Frame>> = {
  x: {
    U: "F",
    R: "R",
    F: "D",
    D: "B",
    L: "L",
    B: "U",
  },
  y: {
    U: "U",
    R: "B",
    F: "R",
    D: "D",
    L: "F",
    B: "L",
  },
  z: {
    U: "L",
    R: "U",
    F: "F",
    D: "R",
    L: "D",
    B: "B",
  },
};

const U_SETUPS: readonly Move[][] = [
  [],
  ["U"],
  ["U2"],
  ["U'"],
];

function normalizeToken(token: string): string {
  const withoutOddDoublePrime = token.replace(/2'$/, "2");
  if (withoutOddDoublePrime.endsWith("3")) {
    return `${withoutOddDoublePrime.slice(0, -1)}'`;
  }
  return withoutOddDoublePrime;
}

function rotationCount(token: string): number {
  if (token.endsWith("2")) return 2;
  if (token.endsWith("'")) return 3;
  return 1;
}

function rotateFrameOnce(frame: Frame, axis: RotationAxis): Frame {
  const rotation = POSITIVE_ROTATION_FRAME[axis];
  const next = {} as Frame;

  for (const face of FACES) {
    next[face] = frame[rotation[face]];
  }

  return next;
}

/**
 * Compiles algorithms containing outer turns and x/y/z setup rotations into
 * the fixed-centre Move type used by moves.ts. Parentheses are annotations.
 * Wide and slice moves are deliberately rejected.
 */
function compileAlgorithm(value: string): Move[] {
  const cleaned = value.replace(/[()]/g, " ").trim();
  if (cleaned === "") return [];

  let frame: Frame = { ...IDENTITY_FRAME };
  const result: Move[] = [];

  for (const rawToken of cleaned.split(/\s+/)) {
    const token = normalizeToken(rawToken);
    const first = token[0];

    if (first === "x" || first === "y" || first === "z") {
      const count = rotationCount(token);
      for (let i = 0; i < count; i++) {
        frame = rotateFrameOnce(frame, first);
      }
      continue;
    }

    if (!FACES.includes(first as Face)) {
      throw new Error(
        `[oll-pll] unsupported notation token ${JSON.stringify(token)}`,
      );
    }

    const suffix = token.slice(1);
    if (suffix !== "" && suffix !== "'" && suffix !== "2") {
      throw new Error(
        `[oll-pll] invalid outer-turn token ${JSON.stringify(token)}`,
      );
    }

    result.push(`${frame[first as Face]}${suffix}` as Move);
  }

  return cancelMoves(result);
}

function inverseMacro(macro: HumanMacro, id: string): HumanMacro {
  return {
    id,
    moves: invertMoves(macro.moves),
    description: `Inverse of ${macro.id}.`,
  };
}

function setupId(prefix: "oll" | "pll", moves: readonly Move[]): string | null {
  if (moves.length === 0) return null;
  return `${prefix}-auf-${moves.join("-")}`;
}

function isBetterEntry(candidate: SolutionEntry, current: SolutionEntry | undefined): boolean {
  if (current === undefined) return true;
  if (candidate.moves.length !== current.moves.length) {
    return candidate.moves.length < current.moves.length;
  }

  const candidateQTM = countQTM(candidate.moves);
  const currentQTM = countQTM(current.moves);
  if (candidateQTM !== currentQTM) return candidateQTM < currentQTM;

  if (candidate.source !== current.source) {
    return candidate.source === "direct";
  }

  return candidate.moves.join(" ") < current.moves.join(" ");
}

const OLL_EDGE = {
  id: "oll-edge-orientation",
  moves: compileAlgorithm("F R U R' U' F'"),
  description: "2-look OLL edge-orientation algorithm.",
} satisfies HumanMacro;

const OLL_SUNE = {
  id: "oll-sune",
  moves: compileAlgorithm("R U R' U R U2 R'"),
  description: "Sune corner-orientation algorithm.",
} satisfies HumanMacro;

const OLL_ANTI_SUNE = {
  id: "oll-anti-sune",
  moves: compileAlgorithm("R U2 R' U' R U' R'"),
  description: "Anti-Sune corner-orientation algorithm.",
} satisfies HumanMacro;

const OLL_FALLBACK_MACROS: readonly HumanMacro[] = [
  { id: "oll-setup-U", moves: ["U"], description: "OLL U setup." },
  { id: "oll-setup-U-prime", moves: ["U'"], description: "OLL U' setup." },
  { id: "oll-setup-U2", moves: ["U2"], description: "OLL U2 setup." },
  OLL_EDGE,
  inverseMacro(OLL_EDGE, "oll-edge-orientation-inverse"),
  OLL_SUNE,
  OLL_ANTI_SUNE,
];

const PLL_T = {
  id: "pll-T",
  moves: compileAlgorithm("R U R' U' R' F R2 U' R' U' R U R' F'"),
  description: "T permutation.",
} satisfies HumanMacro;

const PLL_UA = {
  id: "pll-Ua",
  moves: compileAlgorithm("R U' R U R U R U' R' U' R2"),
  description: "Ua edge permutation.",
} satisfies HumanMacro;

const PLL_UB = {
  id: "pll-Ub",
  moves: compileAlgorithm("R2 U R U R' U' R' U' R' U R'"),
  description: "Ub edge permutation.",
} satisfies HumanMacro;

const PLL_FALLBACK_MACROS: readonly HumanMacro[] = [
  { id: "pll-setup-U", moves: ["U"], description: "PLL AUF U." },
  { id: "pll-setup-U-prime", moves: ["U'"], description: "PLL AUF U'." },
  { id: "pll-setup-U2", moves: ["U2"], description: "PLL AUF U2." },
  PLL_T,
  inverseMacro(PLL_T, "pll-T-inverse"),
  PLL_UA,
  PLL_UB,
];

/**
 * Direct outer-turn OLL algorithms. Cases that conventionally use M/r/l/f
 * remain covered by the weighted finite fallback.
 */
const OLL_DIRECT_SOURCE: readonly [number, string][] = [
  [1, "R U2 R' R' F R F' U2 R' F R F'"],
  [3, "y F U R U' R' F' U F R U R' U' F'"],
  [4, "y F U R U' R' F' U' F R U R' U' F'"],
  [8, "R U2 R' U2 R' F R F'"],
  [9, "R U R' U' R' F R2 U R' U' F'"],
  [10, "R U R' U R' F R F' R U2 R'"],
  [13, "F U R U' R2 F' R U R U' R'"],
  [14, "R' F R U R' F' R F U' F'"],
  [17, "y2 R U R' U R' F R F' U2 R' F R F'"],
  [21, "R U2 R' U' R U R' U' R U' R'"],
  [22, "R U2 R2 U' R2 U' R2 U2 R"],
  [23, "R2 D' R U2 R' D R U2 R"],
  [24, "y R U R D R' U' R D' R2"],
  [25, "y' R' F R B' R' F' R B"],
  [26, "R U2 R' U' R U' R'"],
  [27, "R U R' U R U2 R'"],
  [29, "R U R' U' R U' R' F' U' F R U R'"],
  [30, "F R' F R2 U' R' U' R U R' F2"],
  [31, "R' U' F U R U' R' F' R"],
  [32, "L U F' U' L' U L F L'"],
  [33, "R U R' U' R' F R F'"],
  [34, "R U R2 U' R' F R U R U' F'"],
  [35, "R U2 R' R' F R F' R U2 R'"],
  [36, "L' U' L U' L' U L U L F' L' F"],
  [37, "F R' F' R U R U' R'"],
  [38, "R U R' U R U' R' U' R' F R F'"],
  [39, "L F' L' U' L U F U' L'"],
  [40, "R' F R U R' U' F' U R"],
  [41, "R U R' U R U2 R' F R U R' U' F'"],
  [42, "R' U' R U' R' U2 R F R U R' U' F'"],
  [43, "F' U' L' U L F"],
  [44, "F U R U' R' F'"],
  [45, "F R U R' U' F'"],
  [46, "R' U' R' F R F' U R"],
  [47, "R' U' R' F R F' R' F R F' U R"],
  [48, "F R U R' U' R U R' U' F'"],
  [51, "F U R U' R' U R U' R' F'"],
  [52, "R U R' U R U' B U' B' R'"],
  [55, "R' F R U R U' R2 F' R2 U' R' U R U R'"],
];

const OLL_DIRECT_MACROS: readonly HumanMacro[] = OLL_DIRECT_SOURCE.map(
  ([number, algorithm]) => ({
    id: `OLL-${number}`,
    moves: compileAlgorithm(algorithm),
    description: `Direct OLL case ${number}.`,
  }),
);

/**
 * Direct outer-turn PLL algorithms. H and Z conventionally rely on M turns;
 * they are handled by the weighted finite fallback.
 */
const PLL_DIRECT_SOURCE: readonly [string, string][] = [
  ["Ua", "R U' R U R U R U' R' U' R2"],
  ["Ub", "R2 U R U R' U' R' U' R' U R'"],
  ["Aa", "y x R' U R' D2 R U' R' D2 R2"],
  ["Ab", "y2 x R2 D2 R U R' D2 R U' R"],
  ["E", "x' R U' R' D R U R' D' R U R' D R U' R' D'"],
  ["F", "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R"],
  ["Ja", "y2 L' U' L F L' U' L U L F' L2 U L"],
  ["Jb", "R U R' F' R U R' U' R' F R2 U' R'"],
  ["Ra", "R U' R' U' R U R D R' U' R D' R' U2 R'"],
  ["Rb", "R2 F R U R U' R' F' R U2 R' U2 R"],
  ["T", "R U R' U' R' F R2 U' R' U' R U R' F'"],
  ["Y", "F R U' R' U' R U R' F' R U R' U' R' F R F'"],
  ["V", "R' U R' U' R D' R' D R' U D' R2 U' R2 D R2"],
  ["Na", "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'"],
  ["Nb", "R' U R U' R' F' U' F R U R' F R' F' R U' R"],
  ["Ga", "R2 U R' U R' U' R U' R2 U' D R' U R D'"],
  ["Gb", "R' U' R U D' R2 U R' U R U' R U' R2 D"],
  ["Gc", "R2 U' R U' R U R' U R2 U D' R U' R' D"],
  ["Gd", "R U R' U' D R2 U' R U' R' U R' U R2 D'"],
];

const PLL_DIRECT_MACROS: readonly HumanMacro[] = PLL_DIRECT_SOURCE.map(
  ([name, algorithm]) => ({
    id: `PLL-${name}`,
    moves: compileAlgorithm(algorithm),
    description: `Direct ${name} permutation.`,
  }),
);

function enumerateRepresentatives(
  macros: readonly HumanMacro[],
  getKey: (state: CubeState) => string,
  expectedSize: number,
  phase: "OLL" | "PLL",
): Map<string, CubeState> {
  const representatives = new Map<string, CubeState>();
  const queue: CubeState[] = [SOLVED_STATE];
  representatives.set(getKey(SOLVED_STATE), SOLVED_STATE);

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const state = queue[cursor];

    for (const macro of macros) {
      const next = applyMoves(state, macro.moves);

      if (phase === "PLL" && (!isF2LSolved(next).solved || !isOLLSolved(next))) {
        throw new Error(`[solvePLL] ${macro.id} does not preserve F2L/OLL`);
      }

      const key = getKey(next);
      if (representatives.has(key)) continue;

      representatives.set(key, next);
      queue.push(next);
    }
  }

  if (representatives.size !== expectedSize) {
    throw new Error(
      `[solve${phase}] finite state table incomplete: expected ${expectedSize}, ` +
        `got ${representatives.size}`,
    );
  }

  return representatives;
}

function buildWeightedFallback(
  macros: readonly HumanMacro[],
  getKey: (state: CubeState) => string,
  expectedSize: number,
  phase: "OLL" | "PLL",
): Map<string, SolutionEntry> {
  const representatives = enumerateRepresentatives(
    macros,
    getKey,
    expectedSize,
    phase,
  );

  const goalKey = getKey(SOLVED_STATE);
  const entries = new Map<string, SolutionEntry>();
  entries.set(goalKey, {
    moves: [],
    algorithmIds: [],
    caseId: `${phase.toLowerCase()}-skip`,
    source: "skip",
  });

  let changed = true;
  let pass = 0;
  const passLimit = expectedSize * 2;

  while (changed && pass < passLimit) {
    changed = false;
    pass++;

    for (const [parentKey, parentState] of representatives) {
      const parentEntry = entries.get(parentKey);
      if (parentEntry === undefined) continue;

      for (const macro of macros) {
        const childState = applyMoves(parentState, macro.moves);
        const childKey = getKey(childState);
        const moves = cancelMoves([
          ...invertMoves(macro.moves),
          ...parentEntry.moves,
        ]);

        const candidate: SolutionEntry = {
          moves,
          algorithmIds: [
            `${macro.id}-inverse-step`,
            ...parentEntry.algorithmIds,
          ],
          caseId: `${phase.toLowerCase()}-weighted-fallback`,
          source: "weighted-fallback",
        };

        const current = entries.get(childKey);
        if (!isBetterEntry(candidate, current)) continue;

        entries.set(childKey, candidate);
        changed = true;
      }
    }
  }

  if (entries.size !== expectedSize) {
    throw new Error(
      `[solve${phase}] weighted fallback incomplete: expected ${expectedSize}, ` +
        `got ${entries.size}`,
    );
  }

  return entries;
}

let ollFallbackTable: Map<string, SolutionEntry> | null = null;
let pllFallbackTable: Map<string, SolutionEntry> | null = null;
let ollSolutionTable: Map<string, SolutionEntry> | null = null;
let pllSolutionTable: Map<string, SolutionEntry> | null = null;

function getOLLFallbackTable(): Map<string, SolutionEntry> {
  if (ollFallbackTable === null) {
    ollFallbackTable = buildWeightedFallback(
      OLL_FALLBACK_MACROS,
      getOLLKey,
      216,
      "OLL",
    );
  }
  return ollFallbackTable;
}

function getPLLFallbackTable(): Map<string, SolutionEntry> {
  if (pllFallbackTable === null) {
    pllFallbackTable = buildWeightedFallback(
      PLL_FALLBACK_MACROS,
      getPLLKey,
      288,
      "PLL",
    );
  }
  return pllFallbackTable;
}

function validateDirectMacros(): void {
  for (const macro of OLL_DIRECT_MACROS) {
    const state = applyMoves(SOLVED_STATE, macro.moves);
    if (!isF2LSolved(state).solved) {
      throw new Error(`[solveOLL] direct algorithm ${macro.id} broke F2L`);
    }
  }

  for (const macro of PLL_DIRECT_MACROS) {
    const state = applyMoves(SOLVED_STATE, macro.moves);
    if (!isF2LSolved(state).solved || !isOLLSolved(state)) {
      throw new Error(`[solvePLL] direct algorithm ${macro.id} broke F2L/OLL`);
    }
  }
}

function buildOLLSolutionTable(): Map<string, SolutionEntry> {
  if (ollSolutionTable !== null) return ollSolutionTable;

  validateDirectMacros();
  const table = new Map<string, SolutionEntry>(getOLLFallbackTable());

  for (const macro of OLL_DIRECT_MACROS) {
    for (const setup of U_SETUPS) {
      const moves = cancelMoves([...setup, ...macro.moves]);
      const caseState = applyMoves(SOLVED_STATE, invertMoves(moves));
      const key = getOLLKey(caseState);
      const setupAlgorithmId = setupId("oll", setup);

      const candidate: SolutionEntry = {
        moves,
        algorithmIds: [
          ...(setupAlgorithmId === null ? [] : [setupAlgorithmId]),
          macro.id,
        ],
        caseId: macro.id,
        source: "direct",
      };

      if (isBetterEntry(candidate, table.get(key))) {
        table.set(key, candidate);
      }
    }
  }

  if (table.size !== 216) {
    throw new Error(
      `[solveOLL] solution table incomplete: expected 216, got ${table.size}`,
    );
  }

  ollSolutionTable = table;
  return table;
}

function buildPLLSolutionTable(): Map<string, SolutionEntry> {
  if (pllSolutionTable !== null) return pllSolutionTable;

  validateDirectMacros();
  const table = new Map<string, SolutionEntry>(getPLLFallbackTable());

  for (const macro of PLL_DIRECT_MACROS) {
    for (const before of U_SETUPS) {
      for (const after of U_SETUPS) {
        const moves = cancelMoves([...before, ...macro.moves, ...after]);
        const caseState = applyMoves(SOLVED_STATE, invertMoves(moves));
        const key = getPLLKey(caseState);
        const beforeId = setupId("pll", before);
        const afterId = setupId("pll", after);

        const candidate: SolutionEntry = {
          moves,
          algorithmIds: [
            ...(beforeId === null ? [] : [`${beforeId}-before`]),
            macro.id,
            ...(afterId === null ? [] : [`${afterId}-after`]),
          ],
          caseId: macro.id,
          source: "direct",
        };

        if (isBetterEntry(candidate, table.get(key))) {
          table.set(key, candidate);
        }
      }
    }
  }

  if (table.size !== 288) {
    throw new Error(
      `[solvePLL] solution table incomplete: expected 288, got ${table.size}`,
    );
  }

  pllSolutionTable = table;
  return table;
}

function applyValidatedOLL(state: CubeState, entry: SolutionEntry): CubeState | null {
  const after = applyMoves(state, entry.moves);
  if (!isF2LSolved(after).solved || !isOLLSolved(after)) return null;
  return after;
}

function applyValidatedPLL(state: CubeState, entry: SolutionEntry): CubeState | null {
  const after = applyMoves(state, entry.moves);
  if (after !== SOLVED_STATE || !isPLLSolved(after)) return null;
  return after;
}

export function solveOLL(state: CubeState): OLLResult {
  if (!isF2LSolved(state).solved) {
    throw new Error(`[solveOLL] F2L must be solved before OLL`);
  }

  if (isOLLSolved(state)) {
    return {
      moves: [],
      depth: 0,
      stateAfter: state,
      caseId: "oll-skip",
      algorithmIds: [],
    };
  }

  const key = getOLLKey(state);
  const preferred = buildOLLSolutionTable().get(key);
  if (preferred === undefined) {
    throw new Error(`[solveOLL] missing orientation key ${key}`);
  }

  let selected = preferred;
  let stateAfter = applyValidatedOLL(state, selected);

  // A direct OLL algorithm is keyed by orientation only. The fallback is kept
  // as a safety net if a supplied direct algorithm is not permutation-neutral.
  if (stateAfter === null && selected.source === "direct") {
    const fallback = getOLLFallbackTable().get(key);
    if (fallback === undefined) {
      throw new Error(`[solveOLL] missing fallback orientation key ${key}`);
    }
    selected = fallback;
    stateAfter = applyValidatedOLL(state, selected);
  }

  if (stateAfter === null) {
    throw new Error(`[solveOLL] selected algorithm failed for key ${key}`);
  }

  return {
    moves: [...selected.moves],
    depth: selected.moves.length,
    stateAfter,
    caseId: selected.caseId,
    algorithmIds: [...selected.algorithmIds],
  };
}

export function solvePLL(state: CubeState): PLLResult {
  if (!isF2LSolved(state).solved) {
    throw new Error(`[solvePLL] F2L must be solved before PLL`);
  }

  if (!isOLLSolved(state)) {
    throw new Error(`[solvePLL] OLL must be solved before PLL`);
  }

  if (isPLLSolved(state)) {
    return {
      moves: [],
      depth: 0,
      stateAfter: state,
      caseId: "pll-skip",
      algorithmIds: [],
    };
  }

  const key = getPLLKey(state);
  const preferred = buildPLLSolutionTable().get(key);
  if (preferred === undefined) {
    throw new Error(`[solvePLL] missing permutation key ${key}`);
  }

  let selected = preferred;
  let stateAfter = applyValidatedPLL(state, selected);

  if (stateAfter === null && selected.source === "direct") {
    const fallback = getPLLFallbackTable().get(key);
    if (fallback === undefined) {
      throw new Error(`[solvePLL] missing fallback permutation key ${key}`);
    }
    selected = fallback;
    stateAfter = applyValidatedPLL(state, selected);
  }

  if (stateAfter === null) {
    throw new Error(`[solvePLL] selected algorithm failed for key ${key}`);
  }

  return {
    moves: [...selected.moves],
    depth: selected.moves.length,
    stateAfter,
    caseId: selected.caseId,
    algorithmIds: [...selected.algorithmIds],
  };
}

export function getOLLLookupSize(): number {
  return buildOLLSolutionTable().size;
}

export function getPLLLookupSize(): number {
  return buildPLLSolutionTable().size;
}

export function getDirectOLLStateCount(): number {
  let count = 0;
  for (const entry of buildOLLSolutionTable().values()) {
    if (entry.source === "direct") count++;
  }
  return count;
}

export function getDirectPLLStateCount(): number {
  let count = 0;
  for (const entry of buildPLLSolutionTable().values()) {
    if (entry.source === "direct") count++;
  }
  return count;
}

export function getMaximumOLLHTM(): number {
  return Math.max(
    ...[...buildOLLSolutionTable().values()].map((entry) => entry.moves.length),
  );
}

export function getMaximumPLLHTM(): number {
  return Math.max(
    ...[...buildPLLSolutionTable().values()].map((entry) => entry.moves.length),
  );
}

export const registeredOLLMacros: readonly HumanMacro[] = [
  ...OLL_FALLBACK_MACROS,
  ...OLL_DIRECT_MACROS,
];

export const registeredPLLMacros: readonly HumanMacro[] = [
  ...PLL_FALLBACK_MACROS,
  ...PLL_DIRECT_MACROS,
];
