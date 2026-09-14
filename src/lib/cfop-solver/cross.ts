/**
 * Human-style aligned D-cross recognition.
 *
 * The rules use a temporary U-layer daisy: lift each D edge according to its
 * visible layer/orientation, then align its side color and insert with a half
 * turn. This is deliberately easy to explain and contains no state-indexed
 * solution table. U setups protect finished daisy petals; edge order prefers
 * keeping any F2L slot that is already solved.
 */

import {
  applyMoves,
  type CubeState,
  type Move,
} from "../cube/moves";

import {
  ALL_F2L_SLOTS,
  EDGE_POSITIONS,
  countSolvedF2LSlots,
  isAlignedCrossSolved,
  isF2LSlotSolved,
  locateEdge,
  type F2LSlot,
} from "./detection";

export type CrossEdgeName = "DF" | "DR" | "DB" | "DL";
export type CrossLayer = "U" | "middle" | "D";
export type CrossOrientation = "D-on-U/D" | "D-on-side";
export type CrossRuleId =
  | "U-oriented"
  | "U-flipped-extract"
  | "middle-lift"
  | "D-oriented-lift"
  | "D-flipped-extract"
  | "align-and-insert";

export type CrossEdgeObservation = {
  edge: CrossEdgeName;
  position: string;
  layer: CrossLayer;
  stickerFace: "U" | "R" | "F" | "D" | "L" | "B";
  orientation: CrossOrientation;
  correctSlot: boolean;
  flippedInSlot: boolean;
  caseId: string;
};

export type CrossAction = {
  target: CrossEdgeName;
  ruleId: CrossRuleId;
  caseId: string;
  action: string;
  algorithm: Move[];
  observation: CrossEdgeObservation;
  protectedEdges: CrossEdgeName[];
  newlySolvedEdges: CrossEdgeName[];
  stateBefore: CubeState;
  stateAfter: CubeState;
};

export type CrossResult = {
  moves: Move[];
  depth: number;
  stateAfter: CubeState;
  actions: CrossAction[];
  decisionCount: number;
};

type SideFace = "R" | "F" | "L" | "B";

type CrossEdgeDefinition = {
  name: CrossEdgeName;
  colors: readonly [string, string];
  goalCode: number;
  daisyPosition: number;
  insertionFace: SideFace;
};

type RuleCandidate = {
  ruleId: CrossRuleId;
  moves: Move[];
  stateAfter: CubeState;
};

type EdgePlan = {
  targetIndex: number;
  actions: CrossAction[];
  moves: Move[];
  stateAfter: CubeState;
  decisionCount: number;
};

const POSITION_NAMES = [
  "UF", "UR", "UB", "UL",
  "FR", "FL", "BR", "BL",
  "DF", "DR", "DB", "DL",
] as const;

const FACE_NAMES = ["U", "R", "F", "D", "L", "B"] as const;

const CROSS_EDGES: readonly CrossEdgeDefinition[] = [
  { name: "DF", colors: ["D", "F"], goalCode: 16, daisyPosition: 0, insertionFace: "F" },
  { name: "DR", colors: ["D", "R"], goalCode: 18, daisyPosition: 1, insertionFace: "R" },
  { name: "DB", colors: ["D", "B"], goalCode: 20, daisyPosition: 2, insertionFace: "B" },
  { name: "DL", colors: ["D", "L"], goalCode: 22, daisyPosition: 3, insertionFace: "L" },
];

const U_SETUPS: readonly (readonly Move[])[] = [[], ["U"], ["U'"], ["U2"]];

export const CROSS_CANONICAL_RULES: readonly CrossRuleId[] = [
  "U-oriented",
  "U-flipped-extract",
  "middle-lift",
  "D-oriented-lift",
  "D-flipped-extract",
  "align-and-insert",
];

function solvedEdges(state: CubeState): CrossEdgeName[] {
  return CROSS_EDGES
    .filter((edge) => locateEdge(state, ...edge.colors).code === edge.goalCode)
    .map((edge) => edge.name);
}

function stickerFace(position: number, orientation: 0 | 1): typeof FACE_NAMES[number] {
  const stickerIndex = EDGE_POSITIONS[position][orientation === 0 ? 0 : 1];
  return FACE_NAMES[Math.floor(stickerIndex / 9)];
}

function sideFaces(position: number): SideFace[] {
  return POSITION_NAMES[position]
    .split("")
    .filter((face) => face !== "U" && face !== "D") as SideFace[];
}

function quarterTurns(face: SideFace): Move[][] {
  return [[face], [`${face}'` as Move]];
}

function solvedF2LSlots(state: CubeState): F2LSlot[] {
  return ALL_F2L_SLOTS.filter((slot) => isF2LSlotSolved(state, slot));
}

function candidateScore(
  state: CubeState,
  moves: readonly Move[],
  favoredSlots: ReadonlySet<F2LSlot>,
): number {
  let retainedFavored = 0;
  for (const slot of favoredSlots) {
    if (isF2LSlotSolved(state, slot)) retainedFavored++;
  }
  return retainedFavored * 10_000 + countSolvedF2LSlots(state) * 100 - moves.length;
}

function isDaisyEdge(state: CubeState, edgeIndex: number): boolean {
  const edge = CROSS_EDGES[edgeIndex];
  const location = locateEdge(state, ...edge.colors);
  return location.position < 4 && stickerFace(location.position, location.orientation) === "U";
}

function daisyEdges(state: CubeState): number[] {
  return CROSS_EDGES
    .map((_, index) => index)
    .filter((index) => isDaisyEdge(state, index));
}

function preservesDaisyEdges(state: CubeState, protectedEdges: readonly number[]): boolean {
  return protectedEdges.every((index) => isDaisyEdge(state, index));
}

export function inspectCrossEdge(
  state: CubeState,
  edgeName: CrossEdgeName,
): CrossEdgeObservation {
  const edge = CROSS_EDGES.find((candidate) => candidate.name === edgeName);
  if (edge === undefined) throw new Error(`[solveCross] unknown cross edge ${edgeName}`);

  const location = locateEdge(state, ...edge.colors);
  const layer: CrossLayer = location.position < 4
    ? "U"
    : location.position < 8
      ? "middle"
      : "D";
  const face = stickerFace(location.position, location.orientation);
  const orientation: CrossOrientation = face === "U" || face === "D"
    ? "D-on-U/D"
    : "D-on-side";
  const correctSlot = location.code === edge.goalCode;
  const flippedInSlot = location.position === edge.goalCode / 2 && !correctSlot;

  return {
    edge: edgeName,
    position: POSITION_NAMES[location.position],
    layer,
    stickerFace: face,
    orientation,
    correctSlot,
    flippedInSlot,
    caseId: [
      "cross",
      layer,
      orientation === "D-on-U/D" ? "oriented" : "side-facing",
      correctSlot ? "aligned" : flippedInSlot ? "flipped-slot" : "wrong-slot",
    ].join("-"),
  };
}

function actionDescription(ruleId: CrossRuleId): string {
  switch (ruleId) {
    case "U-oriented": return "Keep this D-up daisy edge on U.";
    case "U-flipped-extract": return "Move the side-facing U-layer edge into the middle layer.";
    case "middle-lift": return "Lift the middle-layer edge into a free U-layer daisy position.";
    case "D-oriented-lift": return "Lift the D-up bottom edge with a side-face half turn.";
    case "D-flipped-extract": return "Move the side-facing D-layer edge into the middle layer.";
    case "align-and-insert": return "Align the side color with its center and insert with a half turn.";
  }
}

function newlySolved(before: CubeState, after: CubeState): CrossEdgeName[] {
  const beforeSolved = new Set(solvedEdges(before));
  return solvedEdges(after).filter((edge) => !beforeSolved.has(edge));
}

function createAction(
  before: CubeState,
  targetIndex: number,
  candidate: RuleCandidate,
): CrossAction {
  const observation = inspectCrossEdge(before, CROSS_EDGES[targetIndex].name);
  return {
    target: CROSS_EDGES[targetIndex].name,
    ruleId: candidate.ruleId,
    caseId: observation.caseId,
    action: actionDescription(candidate.ruleId),
    algorithm: [...candidate.moves],
    observation,
    protectedEdges: solvedEdges(before),
    newlySolvedEdges: newlySolved(before, candidate.stateAfter),
    stateBefore: before,
    stateAfter: candidate.stateAfter,
  };
}

function chooseRuleCandidate(
  candidates: readonly RuleCandidate[],
  favoredSlots: ReadonlySet<F2LSlot>,
): RuleCandidate {
  const selected = [...candidates].sort(
    (left, right) =>
      candidateScore(right.stateAfter, right.moves, favoredSlots) -
      candidateScore(left.stateAfter, left.moves, favoredSlots),
  )[0];
  if (selected === undefined) throw new Error(`[solveCross] no semantic rule candidate`);
  return selected;
}

function nextDaisyRule(
  state: CubeState,
  targetIndex: number,
  favoredSlots: ReadonlySet<F2LSlot>,
): { selected: RuleCandidate; decisionCount: number } {
  const edge = CROSS_EDGES[targetIndex];
  const location = locateEdge(state, ...edge.colors);
  const layer: CrossLayer = location.position < 4
    ? "U"
    : location.position < 8
      ? "middle"
      : "D";
  const dStickerFace = stickerFace(location.position, location.orientation);
  const protectedPetals = daisyEdges(state).filter((index) => index !== targetIndex);
  const candidates: RuleCandidate[] = [];
  let decisionCount = 0;

  const consider = (
    moves: Move[],
    ruleId: CrossRuleId,
    accepts: (stateAfter: CubeState) => boolean,
  ): void => {
    decisionCount++;
    const stateAfter = applyMoves(state, moves);
    if (!accepts(stateAfter)) return;
    if (!preservesDaisyEdges(stateAfter, protectedPetals)) return;
    candidates.push({ ruleId, moves, stateAfter });
  };

  if (layer === "D" && dStickerFace === "D") {
    const face = sideFaces(location.position)[0];
    for (const setup of U_SETUPS) {
      consider([...setup, `${face}2` as Move], "D-oriented-lift", (stateAfter) =>
        isDaisyEdge(stateAfter, targetIndex),
      );
    }
  } else if (layer === "middle") {
    for (const face of sideFaces(location.position)) {
      for (const turn of quarterTurns(face)) {
        for (const setup of U_SETUPS) {
          consider([...setup, ...turn], "middle-lift", (stateAfter) =>
            isDaisyEdge(stateAfter, targetIndex),
          );
        }
      }
    }
  } else {
    for (const face of sideFaces(location.position)) {
      for (const turn of quarterTurns(face)) {
        const setups = layer === "U" ? [[] as Move[]] : U_SETUPS;
        for (const setup of setups) {
          consider(
            [...setup, ...turn],
            layer === "U" ? "U-flipped-extract" : "D-flipped-extract",
            (stateAfter) => {
              const next = locateEdge(stateAfter, ...edge.colors);
              return next.position >= 4 && next.position < 8;
            },
          );
        }
      }
    }
  }

  return { selected: chooseRuleCandidate(candidates, favoredSlots), decisionCount };
}

function planEdgeToDaisy(
  state: CubeState,
  targetIndex: number,
  favoredSlots: ReadonlySet<F2LSlot>,
): EdgePlan {
  let currentState = state;
  const moves: Move[] = [];
  const actions: CrossAction[] = [];
  let decisionCount = 0;

  for (let step = 0; step < 3 && !isDaisyEdge(currentState, targetIndex); step++) {
    const rule = nextDaisyRule(currentState, targetIndex, favoredSlots);
    decisionCount += rule.decisionCount;
    actions.push(createAction(currentState, targetIndex, rule.selected));
    moves.push(...rule.selected.moves);
    currentState = rule.selected.stateAfter;
  }

  if (!isDaisyEdge(currentState, targetIndex)) {
    throw new Error(`[solveCross] daisy rules did not lift ${CROSS_EDGES[targetIndex].name}`);
  }

  return { targetIndex, actions, moves, stateAfter: currentState, decisionCount };
}

function insertionCandidates(state: CubeState, targetIndex: number): RuleCandidate[] {
  const edge = CROSS_EDGES[targetIndex];
  const candidates: RuleCandidate[] = [];

  for (const setup of U_SETUPS) {
    const aligned = applyMoves(state, setup);
    const location = locateEdge(aligned, ...edge.colors);
    if (location.position !== edge.daisyPosition) continue;
    if (stickerFace(location.position, location.orientation) !== "U") continue;

    const moves = [...setup, `${edge.insertionFace}2` as Move];
    const stateAfter = applyMoves(state, moves);
    if (locateEdge(stateAfter, ...edge.colors).code !== edge.goalCode) continue;
    candidates.push({ ruleId: "align-and-insert", moves, stateAfter });
  }

  return candidates;
}

function updateFavoredSlots(state: CubeState, favoredSlots: Set<F2LSlot>): void {
  for (const slot of solvedF2LSlots(state)) favoredSlots.add(slot);
}

export function solveCross(state: CubeState): CrossResult {
  if (isAlignedCrossSolved(state).solved) {
    return { moves: [], depth: 0, stateAfter: state, actions: [], decisionCount: 0 };
  }

  let currentState = state;
  const moves: Move[] = [];
  const actions: CrossAction[] = [];
  const favoredSlots = new Set<F2LSlot>(solvedF2LSlots(state));
  let decisionCount = 0;

  while (daisyEdges(currentState).length < CROSS_EDGES.length) {
    const plans = CROSS_EDGES
      .map((_, index) => index)
      .filter((index) => !isDaisyEdge(currentState, index))
      .map((index) => planEdgeToDaisy(currentState, index, favoredSlots));
    decisionCount += plans.reduce((sum, plan) => sum + plan.decisionCount, 0);

    const selected = plans.sort((left, right) =>
      candidateScore(right.stateAfter, right.moves, favoredSlots) -
      candidateScore(left.stateAfter, left.moves, favoredSlots),
    )[0];
    if (selected === undefined) throw new Error(`[solveCross] no D edge can be lifted`);

    currentState = selected.stateAfter;
    moves.push(...selected.moves);
    actions.push(...selected.actions);
    updateFavoredSlots(currentState, favoredSlots);
  }

  while (!isAlignedCrossSolved(currentState).solved) {
    const plans = CROSS_EDGES
      .map((_, index) => index)
      .filter((index) => locateEdge(currentState, ...CROSS_EDGES[index].colors).code !== CROSS_EDGES[index].goalCode)
      .map((targetIndex) => {
        const candidates = insertionCandidates(currentState, targetIndex);
        decisionCount += U_SETUPS.length;
        const selected = chooseRuleCandidate(candidates, favoredSlots);
        return { targetIndex, selected };
      });

    const plan = plans.sort((left, right) =>
      candidateScore(right.selected.stateAfter, right.selected.moves, favoredSlots) -
      candidateScore(left.selected.stateAfter, left.selected.moves, favoredSlots),
    )[0];
    if (plan === undefined) throw new Error(`[solveCross] no daisy edge can be inserted`);

    const before = currentState;
    currentState = plan.selected.stateAfter;
    moves.push(...plan.selected.moves);
    actions.push(createAction(before, plan.targetIndex, plan.selected));
    updateFavoredSlots(currentState, favoredSlots);
  }

  return {
    moves,
    depth: moves.length,
    stateAfter: currentState,
    actions,
    decisionCount,
  };
}

export function getCrossCanonicalRuleCount(): number {
  return CROSS_CANONICAL_RULES.length;
}

export const registeredCrossRules = CROSS_CANONICAL_RULES;
