/**
 * Human F2L case recognition.
 *
 * Each pair is solved independently:
 *   1. locate its corner and edge,
 *   2. extract a trapped piece with the trigger for its visible slot,
 *   3. classify the two U-layer pieces by orientation and relative position,
 *   4. apply the finite algorithm registered for that case.
 *
 * Every available trigger preserves the aligned D cross. Triggers belonging
 * to completed slots are excluded, so earlier pairs stay solved.
 */

import {
  applyMoves,
  cancelMoves,
  type CubeState,
  type Move,
} from "../cube/moves";

import {
  ALL_F2L_SLOTS,
  countSolvedF2LSlots,
  getF2LPairKey,
  getUnsolvedF2LSlots,
  isAlignedCrossSolved,
  isF2LSolved,
  isF2LSlotSolved,
  locateCorner,
  locateEdge,
  type CornerLocation,
  type EdgeLocation,
  type F2LSlot,
} from "./detection";

import { TOP_F2L_CASE_ALGORITHMS } from "./human-case-tables";

export type F2LCaseCategory =
  | "solved"
  | "top-layer-pair"
  | "corner-in-slot"
  | "edge-in-slot"
  | "both-in-slots";

export type F2LCase = {
  id: string;
  slot: F2LSlot;
  category: F2LCaseCategory;
  corner: CornerLocation & { positionName: string };
  edge: EdgeLocation & { positionName: string };
  relativePosition: number | null;
  algorithm: Move[];
};

export type F2LAction = {
  type: "extract-corner" | "extract-edge" | "pair-and-insert";
  caseId: string;
  sourceSlot: F2LSlot | null;
  algorithm: Move[];
  stateBefore: CubeState;
  stateAfter: CubeState;
};

export type F2LStage = {
  slot: F2LSlot;
  caseId: string;
  algorithm: Move[];
  moves: Move[];
  macroIds: string[];
  actions: F2LAction[];
  newlySolvedSlots: F2LSlot[];
  stateBefore: CubeState;
  stateAfter: CubeState;
  decisionCount: number;
};

export type F2LResult = {
  moves: Move[];
  depth: number;
  stateAfter: CubeState;
  slotMoves: Record<F2LSlot, Move[]>;
  solvedOrder: F2LSlot[];
  stages: F2LStage[];
  decisionCount: number;
};

type SlotPlan = {
  slot: F2LSlot;
  caseId: string;
  moves: Move[];
  actions: F2LAction[];
  stateAfter: CubeState;
  newlySolvedSlots: F2LSlot[];
  decisionCount: number;
};

type Trigger = {
  id: string;
  slot: F2LSlot;
  moves: readonly Move[];
};

const CORNER_POSITION_NAMES = [
  "UFR", "UFL", "UBR", "UBL", "DFR", "DFL", "DBR", "DBL",
] as const;

const EDGE_POSITION_NAMES = [
  "UF", "UR", "UB", "UL", "FR", "FL", "BR", "BL", "DF", "DR", "DB", "DL",
] as const;

const SLOT_DATA: Readonly<Record<F2LSlot, {
  corner: readonly [string, string, string];
  edge: readonly [string, string];
}>> = {
  FR: { corner: ["D", "F", "R"], edge: ["F", "R"] },
  FL: { corner: ["D", "F", "L"], edge: ["F", "L"] },
  BR: { corner: ["D", "B", "R"], edge: ["B", "R"] },
  BL: { corner: ["D", "B", "L"], edge: ["B", "L"] },
};

const SLOT_FOR_LOWER_POSITION: Readonly<Record<number, F2LSlot>> = {
  4: "FR",
  5: "FL",
  6: "BR",
  7: "BL",
};

const SLOT_TRIGGERS: Readonly<Record<F2LSlot, readonly Trigger[]>> = {
  FR: [
    { id: "FR-right-trigger", slot: "FR", moves: ["R", "U", "R'"] },
    { id: "FR-right-trigger-reverse", slot: "FR", moves: ["R", "U'", "R'"] },
    { id: "FR-front-trigger", slot: "FR", moves: ["F'", "U", "F"] },
    { id: "FR-front-trigger-reverse", slot: "FR", moves: ["F'", "U'", "F"] },
  ],
  FL: [
    { id: "FL-front-trigger", slot: "FL", moves: ["F", "U", "F'"] },
    { id: "FL-front-trigger-reverse", slot: "FL", moves: ["F", "U'", "F'"] },
    { id: "FL-left-trigger", slot: "FL", moves: ["L'", "U", "L"] },
    { id: "FL-left-trigger-reverse", slot: "FL", moves: ["L'", "U'", "L"] },
  ],
  BR: [
    { id: "BR-right-trigger", slot: "BR", moves: ["R'", "U", "R"] },
    { id: "BR-right-trigger-reverse", slot: "BR", moves: ["R'", "U'", "R"] },
    { id: "BR-back-trigger", slot: "BR", moves: ["B", "U", "B'"] },
    { id: "BR-back-trigger-reverse", slot: "BR", moves: ["B", "U'", "B'"] },
  ],
  BL: [
    { id: "BL-left-trigger", slot: "BL", moves: ["L", "U", "L'"] },
    { id: "BL-left-trigger-reverse", slot: "BL", moves: ["L", "U'", "L'"] },
    { id: "BL-back-trigger", slot: "BL", moves: ["B'", "U", "B"] },
    { id: "BL-back-trigger-reverse", slot: "BL", moves: ["B'", "U'", "B"] },
  ],
};

function parseAlgorithm(value: string): Move[] {
  return value === "" ? [] : value.split(" ") as Move[];
}

function cloneSlotMoves(): Record<F2LSlot, Move[]> {
  return { FR: [], FL: [], BR: [], BL: [] };
}

function allSlotsRemainSolved(state: CubeState, slots: readonly F2LSlot[]): boolean {
  return slots.every((slot) => isF2LSlotSolved(state, slot));
}

function locatePair(state: CubeState, slot: F2LSlot): {
  corner: CornerLocation;
  edge: EdgeLocation;
} {
  const pieces = SLOT_DATA[slot];
  return {
    corner: locateCorner(state, pieces.corner),
    edge: locateEdge(state, ...pieces.edge),
  };
}

export function recognizeF2LCase(state: CubeState, slot: F2LSlot): F2LCase {
  const { corner, edge } = locatePair(state, slot);
  const bothOnTop = corner.position < 4 && edge.position < 4;
  const cornerBelow = corner.position >= 4;
  const edgeBelow = edge.position >= 4;
  const relativePosition = bothOnTop
    ? (edge.position - corner.position + 4) % 4
    : null;

  let category: F2LCaseCategory;
  if (isF2LSlotSolved(state, slot)) category = "solved";
  else if (bothOnTop) category = "top-layer-pair";
  else if (cornerBelow && edgeBelow) category = "both-in-slots";
  else if (cornerBelow) category = "corner-in-slot";
  else category = "edge-in-slot";

  const id = category === "top-layer-pair"
    ? `F2L-top-C${corner.orientation}-E${edge.orientation}-R${relativePosition}`
    : category === "solved"
      ? `F2L-${slot}-solved`
      : `F2L-${category}-C${CORNER_POSITION_NAMES[corner.position]}-E${EDGE_POSITION_NAMES[edge.position]}`;

  const encoded = bothOnTop
    ? TOP_F2L_CASE_ALGORITHMS[`${slot}:${getF2LPairKey(state, slot)}`]
    : undefined;

  return {
    id,
    slot,
    category,
    corner: { ...corner, positionName: CORNER_POSITION_NAMES[corner.position] },
    edge: { ...edge, positionName: EDGE_POSITION_NAMES[edge.position] },
    relativePosition,
    algorithm: encoded === undefined ? [] : cancelMoves(parseAlgorithm(encoded)),
  };
}

function chooseExtraction(
  state: CubeState,
  target: F2LSlot,
  protectedSlots: readonly F2LSlot[],
  extract: "corner" | "edge",
  sourceSlot: F2LSlot,
): { trigger: Trigger; stateAfter: CubeState; decisionCount: number } {
  let selected: { trigger: Trigger; stateAfter: CubeState; score: number } | null = null;
  let decisionCount = 0;

  for (const trigger of SLOT_TRIGGERS[sourceSlot]) {
    decisionCount++;
    const stateAfter = applyMoves(state, trigger.moves);
    const pair = locatePair(stateAfter, target);
    const extracted = extract === "corner"
      ? pair.corner.position < 4
      : pair.edge.position < 4;

    if (!extracted) continue;
    if (!isAlignedCrossSolved(stateAfter).solved) continue;
    if (!allSlotsRemainSolved(stateAfter, protectedSlots)) continue;

    const score =
      (isF2LSlotSolved(stateAfter, target) ? -100 : 0) +
      (pair.corner.position < 4 ? -10 : 0) +
      (pair.edge.position < 4 ? -10 : 0);

    if (selected === null || score < selected.score) {
      selected = { trigger, stateAfter, score };
    }
  }

  if (selected === null) {
    throw new Error(`[solveF2L] no ${extract} extraction case for ${target} from ${sourceSlot}`);
  }

  return { ...selected, decisionCount };
}

function planSlot(state: CubeState, slot: F2LSlot): SlotPlan {
  const protectedSlots = ALL_F2L_SLOTS.filter((candidate) => isF2LSlotSolved(state, candidate));
  const moves: Move[] = [];
  const actions: F2LAction[] = [];
  let currentState = state;
  let decisionCount = 0;

  for (let actionIndex = 0; actionIndex < 8 && !isF2LSlotSolved(currentState, slot); actionIndex++) {
    const recognized = recognizeF2LCase(currentState, slot);

    if (recognized.category === "top-layer-pair") {
      decisionCount++;
      if (recognized.algorithm.length === 0) {
        throw new Error(`[solveF2L] missing finite top-pair case ${slot}/${recognized.id}`);
      }

      const stateAfter = applyMoves(currentState, recognized.algorithm);
      if (
        !isF2LSlotSolved(stateAfter, slot) ||
        !isAlignedCrossSolved(stateAfter).solved ||
        !allSlotsRemainSolved(stateAfter, protectedSlots)
      ) {
        throw new Error(`[solveF2L] invalid top-pair algorithm ${slot}/${recognized.id}`);
      }

      actions.push({
        type: "pair-and-insert",
        caseId: recognized.id,
        sourceSlot: null,
        algorithm: [...recognized.algorithm],
        stateBefore: currentState,
        stateAfter,
      });
      moves.push(...recognized.algorithm);
      currentState = stateAfter;
      continue;
    }

    const pair = locatePair(currentState, slot);
    const extract = pair.corner.position >= 4 ? "corner" : "edge";
    const sourcePosition = extract === "corner" ? pair.corner.position : pair.edge.position;
    const sourceSlot = SLOT_FOR_LOWER_POSITION[sourcePosition];

    if (sourceSlot === undefined || protectedSlots.includes(sourceSlot)) {
      throw new Error(`[solveF2L] ${slot} ${extract} is trapped in protected position ${sourcePosition}`);
    }

    const extraction = chooseExtraction(
      currentState,
      slot,
      protectedSlots,
      extract,
      sourceSlot,
    );
    decisionCount += extraction.decisionCount;
    const caseId = `F2L-extract-${extract}-${sourceSlot}-${
      extract === "corner" ? pair.corner.orientation : pair.edge.orientation
    }-${extraction.trigger.id}`;

    actions.push({
      type: extract === "corner" ? "extract-corner" : "extract-edge",
      caseId,
      sourceSlot,
      algorithm: [...extraction.trigger.moves],
      stateBefore: currentState,
      stateAfter: extraction.stateAfter,
    });
    moves.push(...extraction.trigger.moves);
    currentState = extraction.stateAfter;
  }

  if (!isF2LSlotSolved(currentState, slot)) {
    throw new Error(`[solveF2L] finite case actions did not solve ${slot}`);
  }

  const newlySolvedSlots = ALL_F2L_SLOTS.filter(
    (candidate) => !isF2LSlotSolved(state, candidate) && isF2LSlotSolved(currentState, candidate),
  );

  return {
    slot,
    caseId: actions.at(-1)?.caseId ?? `F2L-${slot}-skip`,
    moves,
    actions,
    stateAfter: currentState,
    newlySolvedSlots,
    decisionCount,
  };
}

function choosePair(state: CubeState): SlotPlan {
  const beforeCount = countSolvedF2LSlots(state);
  let selected: SlotPlan | null = null;

  for (const slot of getUnsolvedF2LSlots(state)) {
    const plan = planSlot(state, slot);
    const added = countSolvedF2LSlots(plan.stateAfter) - beforeCount;
    const selectedAdded = selected === null
      ? Number.POSITIVE_INFINITY
      : countSolvedF2LSlots(selected.stateAfter) - beforeCount;

    if (
      selected === null ||
      (added === 1 && selectedAdded !== 1) ||
      (added === selectedAdded && plan.moves.length < selected.moves.length)
    ) {
      selected = plan;
    }
  }

  if (selected === null) {
    throw new Error(`[solveF2L] no visible pair can be selected`);
  }

  return selected;
}

export function solveF2L(state: CubeState): F2LResult {
  if (!isAlignedCrossSolved(state).solved) {
    throw new Error(`[solveF2L] aligned cross must be solved before F2L`);
  }

  const slotMoves = cloneSlotMoves();
  if (isF2LSolved(state).solved) {
    return {
      moves: [],
      depth: 0,
      stateAfter: state,
      slotMoves,
      solvedOrder: [],
      stages: [],
      decisionCount: 0,
    };
  }

  let currentState = state;
  const moves: Move[] = [];
  const solvedOrder: F2LSlot[] = [];
  const stages: F2LStage[] = [];
  let decisionCount = 0;

  while (!isF2LSolved(currentState).solved) {
    const before = currentState;
    const plan = choosePair(currentState);
    decisionCount += plan.decisionCount;
    currentState = plan.stateAfter;
    moves.push(...plan.moves);
    slotMoves[plan.slot].push(...plan.moves);
    solvedOrder.push(plan.slot);

    stages.push({
      slot: plan.slot,
      caseId: plan.caseId,
      algorithm: [...plan.moves],
      moves: [...plan.moves],
      macroIds: plan.actions.map((action) => action.caseId),
      actions: plan.actions,
      newlySolvedSlots: plan.newlySolvedSlots,
      stateBefore: before,
      stateAfter: currentState,
      decisionCount: plan.decisionCount,
    });
  }

  if (!isAlignedCrossSolved(currentState).solved) {
    throw new Error(`[solveF2L] F2L broke the aligned cross`);
  }

  return {
    moves,
    depth: moves.length,
    stateAfter: currentState,
    slotMoves,
    solvedOrder,
    stages,
    decisionCount,
  };
}

export function getTopF2LCaseTableSize(): number {
  return Object.keys(TOP_F2L_CASE_ALGORITHMS).length;
}

export const registeredF2LCases = TOP_F2L_CASE_ALGORITHMS;
export const registeredF2LMacros = {
  cases: TOP_F2L_CASE_ALGORITHMS,
  slotTriggers: SLOT_TRIGGERS,
};
