/**
 * Human-style aligned D-cross recognition.
 *
 * The solver inspects each D edge, classifies its layer, sticker direction,
 * and slot alignment, then selects one finite setup/extraction/insertion
 * sequence. Completed cross edges are treated as protected pieces. A small
 * one-action look-ahead chooses which visible edge to solve next.
 */

import {
  applyMoves,
  type CubeState,
  type Move,
} from "../cube/moves";

import {
  EDGE_POSITIONS,
  countSolvedF2LSlots,
  isAlignedCrossSolved,
  locateEdge,
} from "./detection";

import { CROSS_CASE_ALGORITHMS } from "./human-case-tables";

export type CrossEdgeName = "DF" | "DR" | "DB" | "DL";
export type CrossLayer = "U" | "middle" | "D";
export type CrossOrientation = "D-on-U/D" | "D-on-side";

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
  target: CrossEdgeName | "phase-boundary";
  caseId: string;
  action: string;
  algorithm: Move[];
  observation: CrossEdgeObservation | null;
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

const POSITION_NAMES = [
  "UF", "UR", "UB", "UL",
  "FR", "FL", "BR", "BL",
  "DF", "DR", "DB", "DL",
] as const;

const FACE_NAMES = ["U", "R", "F", "D", "L", "B"] as const;

const CROSS_EDGES: readonly {
  name: CrossEdgeName;
  colors: readonly [string, string];
  goalCode: number;
}[] = [
  { name: "DF", colors: ["D", "F"], goalCode: 16 },
  { name: "DR", colors: ["D", "R"], goalCode: 18 },
  { name: "DB", colors: ["D", "B"], goalCode: 20 },
  { name: "DL", colors: ["D", "L"], goalCode: 22 },
];

const PHASE_BOUNDARY_ADJUSTMENTS: readonly {
  id: string;
  moves: readonly Move[];
}[] = [
  { id: "FR-right-trigger", moves: ["R", "U", "R'"] },
  { id: "FR-right-trigger-reverse", moves: ["R", "U'", "R'"] },
  { id: "FR-front-trigger", moves: ["F'", "U", "F"] },
  { id: "FR-front-trigger-reverse", moves: ["F'", "U'", "F"] },
  { id: "FL-front-trigger", moves: ["F", "U", "F'"] },
  { id: "FL-front-trigger-reverse", moves: ["F", "U'", "F'"] },
  { id: "FL-left-trigger", moves: ["L'", "U", "L"] },
  { id: "FL-left-trigger-reverse", moves: ["L'", "U'", "L"] },
  { id: "BR-right-trigger", moves: ["R'", "U", "R"] },
  { id: "BR-right-trigger-reverse", moves: ["R'", "U'", "R"] },
  { id: "BR-back-trigger", moves: ["B", "U", "B'"] },
  { id: "BR-back-trigger-reverse", moves: ["B", "U'", "B'"] },
  { id: "BL-left-trigger", moves: ["L", "U", "L'"] },
  { id: "BL-left-trigger-reverse", moves: ["L", "U'", "L'"] },
  { id: "BL-back-trigger", moves: ["B'", "U", "B"] },
  { id: "BL-back-trigger-reverse", moves: ["B'", "U'", "B"] },
];

function parseAlgorithm(value: string): Move[] {
  return value === "" ? [] : value.split(" ") as Move[];
}

function solvedEdgeMask(state: CubeState): number {
  return CROSS_EDGES.reduce((mask, edge, index) => {
    const solved = locateEdge(state, ...edge.colors).code === edge.goalCode;
    return solved ? mask | (1 << index) : mask;
  }, 0);
}

function solvedEdges(state: CubeState): CrossEdgeName[] {
  const mask = solvedEdgeMask(state);
  return CROSS_EDGES
    .filter((_, index) => (mask & (1 << index)) !== 0)
    .map((edge) => edge.name);
}

function stickerFace(position: number, orientation: 0 | 1): typeof FACE_NAMES[number] {
  const stickerIndex = EDGE_POSITIONS[position][orientation === 0 ? 0 : 1];
  return FACE_NAMES[Math.floor(stickerIndex / 9)];
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
      edgeName,
      layer,
      POSITION_NAMES[location.position],
      orientation === "D-on-U/D" ? "oriented" : "side-facing",
      correctSlot ? "aligned" : flippedInSlot ? "flipped-slot" : "wrong-slot",
    ].join("-"),
  };
}

function describeAction(observation: CrossEdgeObservation): string {
  if (observation.correctSlot) return "Keep the aligned edge.";
  if (observation.flippedInSlot) {
    return "Lift the flipped edge out of its D slot, reorient it, and reinsert it.";
  }
  if (observation.layer === "middle") {
    return "Extract the middle-layer edge, align its side color, and insert it on D.";
  }
  if (observation.layer === "U") {
    return observation.orientation === "D-on-U/D"
      ? "Align the side color over its center and insert with a half turn."
      : "Turn the edge through a side face so D points down, then align it.";
  }
  return "Move the D-layer edge away from the wrong slot, align it, and restore protected edges.";
}

function newlySolved(before: CubeState, after: CubeState): CrossEdgeName[] {
  const beforeMask = solvedEdgeMask(before);
  const afterMask = solvedEdgeMask(after);
  return CROSS_EDGES
    .filter((_, index) =>
      (beforeMask & (1 << index)) === 0 && (afterMask & (1 << index)) !== 0,
    )
    .map((edge) => edge.name);
}

function solvedEdgeCount(mask: number): number {
  let count = 0;
  for (let index = 0; index < CROSS_EDGES.length; index++) {
    if ((mask & (1 << index)) !== 0) count++;
  }
  return count;
}

export function solveCross(state: CubeState): CrossResult {
  if (isAlignedCrossSolved(state).solved) {
    return {
      moves: [],
      depth: 0,
      stateAfter: state,
      actions: [],
      decisionCount: 0,
    };
  }

  const initialF2LCount = countSolvedF2LSlots(state);
  let currentState = state;
  const moves: Move[] = [];
  const actions: CrossAction[] = [];
  let decisionCount = 0;

  for (let step = 0; step < CROSS_EDGES.length; step++) {
    const mask = solvedEdgeMask(currentState);
    if (mask === 0b1111) break;

    let selected: {
      target: CrossEdgeName;
      observation: CrossEdgeObservation;
      algorithm: Move[];
      stateAfter: CubeState;
      solvedGain: number;
    } | null = null;

    for (let targetIndex = 0; targetIndex < CROSS_EDGES.length; targetIndex++) {
      if ((mask & (1 << targetIndex)) !== 0) continue;

      const target = CROSS_EDGES[targetIndex];
      const location = locateEdge(currentState, ...target.colors);
      const encoded = CROSS_CASE_ALGORITHMS[`${mask}:${targetIndex}:${location.code}`];
      if (encoded === undefined) continue;

      decisionCount++;
      const algorithm = parseAlgorithm(encoded);
      const stateAfter = applyMoves(currentState, algorithm);
      const afterMask = solvedEdgeMask(stateAfter);

      if ((afterMask & mask) !== mask || (afterMask & (1 << targetIndex)) === 0) {
        throw new Error(`[solveCross] invalid finite case ${mask}:${targetIndex}:${location.code}`);
      }

      const candidate = {
        target: target.name,
        observation: inspectCrossEdge(currentState, target.name),
        algorithm,
        stateAfter,
        solvedGain: solvedEdgeCount(afterMask) - solvedEdgeCount(mask),
      };

      if (
        selected === null ||
        candidate.algorithm.length < selected.algorithm.length ||
        (
          candidate.algorithm.length === selected.algorithm.length &&
          candidate.solvedGain > selected.solvedGain
        )
      ) {
        selected = candidate;
      }
    }

    if (selected === null) {
      throw new Error(`[solveCross] no recognized edge action for mask ${mask}`);
    }

    const before = currentState;
    const protectedEdges = solvedEdges(before);
    currentState = selected.stateAfter;
    moves.push(...selected.algorithm);
    actions.push({
      target: selected.target,
      caseId: selected.observation.caseId,
      action: describeAction(selected.observation),
      algorithm: [...selected.algorithm],
      observation: selected.observation,
      protectedEdges,
      newlySolvedEdges: newlySolved(before, currentState),
      stateBefore: before,
      stateAfter: currentState,
    });
  }

  if (!isAlignedCrossSolved(currentState).solved) {
    throw new Error(`[solveCross] finite edge actions did not complete the aligned D cross`);
  }

  // A Cross phase should not claim accidental F2L progress. If an insertion
  // happens to finish a pair, use one visible trigger to return that pair to U
  // while leaving the aligned D cross intact.
  while (countSolvedF2LSlots(currentState) > initialF2LCount) {
    const before = currentState;
    let selected: { id: string; moves: readonly Move[]; stateAfter: CubeState; count: number } | null = null;

    for (const adjustment of PHASE_BOUNDARY_ADJUSTMENTS) {
      decisionCount++;
      const stateAfter = applyMoves(currentState, adjustment.moves);
      if (!isAlignedCrossSolved(stateAfter).solved) continue;
      const count = countSolvedF2LSlots(stateAfter);
      if (selected === null || count < selected.count) {
        selected = { ...adjustment, stateAfter, count };
      }
    }

    if (selected === null || selected.count >= countSolvedF2LSlots(currentState)) {
      throw new Error(`[solveCross] could not preserve the Cross/F2L phase boundary`);
    }

    currentState = selected.stateAfter;
    moves.push(...selected.moves);
    actions.push({
      target: "phase-boundary",
      caseId: `cross-boundary-${selected.id}`,
      action: "Move an accidentally completed pair back to U for an explicit F2L stage.",
      algorithm: [...selected.moves],
      observation: null,
      protectedEdges: solvedEdges(before),
      newlySolvedEdges: [],
      stateBefore: before,
      stateAfter: currentState,
    });
  }

  return {
    moves,
    depth: moves.length,
    stateAfter: currentState,
    actions,
    decisionCount,
  };
}

export function getCrossCaseTableSize(): number {
  return Object.keys(CROSS_CASE_ALGORITHMS).length;
}

export const registeredCrossCases = CROSS_CASE_ALGORITHMS;
