/**
 * Canonical human F2L recognition.
 *
 * A pair trapped outside its target slot is first extracted with a visible
 * slot trigger. The resulting pair is normalized by AUF into the FR frame,
 * classified as one of 41 canonical cases, and solved with one shared human
 * algorithm transformed to FR/FL/BR/BL by face symmetry.
 */

import {
  applyMoves,
  cancelMoves,
  type CubeState,
  type Move,
} from "../cube/moves";

import {
  ALL_F2L_SLOTS,
  CORNER_POSITIONS,
  EDGE_POSITIONS,
  countSolvedF2LSlots,
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

import {
  CANONICAL_F2L_CASES,
  bothInSlotCaseNumber,
  cornerInSlotCaseNumber,
  edgeInSlotCaseNumber,
  getCanonicalF2LCase,
  rotateAlgorithmForSlot,
  rotateFaceForSlot,
  topCaseNumber,
  unrotateFaceFromSlot,
  type CanonicalF2LCategory,
  type CanonicalF2LCaseDefinition,
} from "./f2l-cases";

export type F2LCaseCategory = CanonicalF2LCategory | "extraction" | "solved";

export type F2LCase = {
  id: string;
  number: number | null;
  category: F2LCaseCategory;
  slot: F2LSlot;
  corner: CornerLocation & { positionName: string };
  edge: EdgeLocation & { positionName: string };
  cornerOrientation: 0 | 1 | 2 | null;
  edgeOrientation: 0 | 1 | null;
  relativePosition: 0 | 1 | 2 | 3 | null;
  auf: Move[];
  algorithm: Move[];
};

export type F2LAction = {
  type: "extract-corner" | "extract-edge" | "pair-and-insert";
  caseId: string;
  category: F2LCaseCategory;
  sourceSlot: F2LSlot | null;
  algorithm: Move[];
  stateBefore: CubeState;
  stateAfter: CubeState;
};

export type F2LStage = {
  slot: F2LSlot;
  caseId: string;
  category: F2LCaseCategory;
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
  recognizedCase: F2LCase;
  moves: Move[];
  actions: F2LAction[];
  stateAfter: CubeState;
  newlySolvedSlots: F2LSlot[];
  decisionCount: number;
};

type Trigger = {
  id: string;
  moves: Move[];
};

type SideFace = "F" | "R" | "B" | "L";

const FACE_NAMES = ["U", "R", "F", "D", "L", "B"] as const;

const CORNER_POSITION_NAMES = [
  "UFR", "UFL", "UBR", "UBL", "DFR", "DFL", "DBR", "DBL",
] as const;

const EDGE_POSITION_NAMES = [
  "UF", "UR", "UB", "UL", "FR", "FL", "BR", "BL", "DF", "DR", "DB", "DL",
] as const;

const TOP_EDGE_SIDE_ORDER: Readonly<Record<SideFace, 0 | 1 | 2 | 3>> = {
  F: 0,
  R: 1,
  B: 2,
  L: 3,
};

const SLOT_DATA: Readonly<Record<F2LSlot, {
  corner: readonly [string, string, string];
  edge: readonly [string, string];
  cornerPosition: number;
  edgePosition: number;
  topCornerPosition: number;
}>> = {
  FR: { corner: ["D", "F", "R"], edge: ["F", "R"], cornerPosition: 4, edgePosition: 4, topCornerPosition: 0 },
  FL: { corner: ["D", "F", "L"], edge: ["F", "L"], cornerPosition: 5, edgePosition: 5, topCornerPosition: 1 },
  BR: { corner: ["D", "B", "R"], edge: ["B", "R"], cornerPosition: 6, edgePosition: 6, topCornerPosition: 2 },
  BL: { corner: ["D", "B", "L"], edge: ["B", "L"], cornerPosition: 7, edgePosition: 7, topCornerPosition: 3 },
};

const SLOT_FOR_LOWER_POSITION: Readonly<Record<number, F2LSlot>> = {
  4: "FR",
  5: "FL",
  6: "BR",
  7: "BL",
};

const U_SETUPS: readonly (readonly Move[])[] = [[], ["U"], ["U'"], ["U2"]];

const CANONICAL_FR_TRIGGERS: readonly Trigger[] = [
  { id: "right-trigger", moves: ["R", "U", "R'"] },
  { id: "right-trigger-reverse", moves: ["R", "U'", "R'"] },
  { id: "front-trigger", moves: ["F'", "U", "F"] },
  { id: "front-trigger-reverse", moves: ["F'", "U'", "F"] },
];

function triggersForSlot(slot: F2LSlot): Trigger[] {
  return CANONICAL_FR_TRIGGERS.map((trigger) => ({
    id: `${slot}-${trigger.id}`,
    moves: rotateAlgorithmForSlot(trigger.moves, slot),
  }));
}

function cloneSlotMoves(): Record<F2LSlot, Move[]> {
  return { FR: [], FL: [], BR: [], BL: [] };
}

function faceAtSticker(index: number): typeof FACE_NAMES[number] {
  return FACE_NAMES[Math.floor(index / 9)];
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

function canonicalCornerOrientation(
  location: CornerLocation,
  slot: F2LSlot,
): 0 | 1 | 2 {
  const stickerIndex = CORNER_POSITIONS[location.position][location.orientation];
  const face = faceAtSticker(stickerIndex);
  if (face === "U" || face === "D") return 0;
  const canonicalFace = unrotateFaceFromSlot(face as SideFace, slot);
  return canonicalFace === "R" ? 1 : 2;
}

function topEdgeOrientation(
  state: CubeState,
  location: EdgeLocation,
  slot: F2LSlot,
): 0 | 1 {
  const [first, second] = EDGE_POSITIONS[location.position];
  const uIndex = faceAtSticker(first) === "U" ? first : second;
  const canonicalFColor = rotateFaceForSlot("F", slot);
  return state[uIndex] === canonicalFColor ? 0 : 1;
}

function slottedEdgeOrientation(
  state: CubeState,
  location: EdgeLocation,
  slot: F2LSlot,
): 0 | 1 {
  const canonicalFFace = rotateFaceForSlot("F", slot);
  const index = EDGE_POSITIONS[location.position]
    .find((stickerIndex) => faceAtSticker(stickerIndex) === canonicalFFace);
  if (index === undefined) throw new Error(`[solveF2L] edge is not in the ${slot} slot`);
  return state[index] === canonicalFFace ? 0 : 1;
}

function alignTopCorner(
  state: CubeState,
  slot: F2LSlot,
): { state: CubeState; auf: Move[]; corner: CornerLocation } {
  const data = SLOT_DATA[slot];
  for (const setup of U_SETUPS) {
    const after = applyMoves(state, setup);
    const corner = locateCorner(after, data.corner);
    if (corner.position === data.topCornerPosition) {
      return { state: after, auf: [...setup], corner };
    }
  }
  throw new Error(`[solveF2L] cannot AUF ${slot} corner above its slot`);
}

function canonicalTopCase(state: CubeState, slot: F2LSlot): F2LCase {
  const aligned = alignTopCorner(state, slot);
  const pair = locatePair(aligned.state, slot);
  if (pair.edge.position >= 4) throw new Error(`[solveF2L] ${slot} edge is not on U`);

  const cornerOrientation = canonicalCornerOrientation(aligned.corner, slot);
  const edgeOrientation = topEdgeOrientation(aligned.state, pair.edge, slot);
  const sideFace = EDGE_POSITION_NAMES[pair.edge.position]
    .split("")
    .find((face) => face !== "U") as SideFace;
  const relativePosition = TOP_EDGE_SIDE_ORDER[unrotateFaceFromSlot(sideFace, slot)];
  const number = topCaseNumber(cornerOrientation, edgeOrientation, relativePosition);
  const definition = getCanonicalF2LCase(number);
  const algorithm = cancelMoves([
    ...aligned.auf,
    ...rotateAlgorithmForSlot(definition.algorithm, slot),
  ]);

  return makeCase(state, slot, definition, algorithm, aligned.auf);
}

function makeCase(
  state: CubeState,
  slot: F2LSlot,
  definition: CanonicalF2LCaseDefinition,
  algorithm: Move[],
  auf: Move[] = [],
): F2LCase {
  const pair = locatePair(state, slot);
  return {
    id: definition.id,
    number: definition.number,
    category: definition.category,
    slot,
    corner: { ...pair.corner, positionName: CORNER_POSITION_NAMES[pair.corner.position] },
    edge: { ...pair.edge, positionName: EDGE_POSITION_NAMES[pair.edge.position] },
    cornerOrientation: definition.cornerOrientation,
    edgeOrientation: definition.edgeOrientation,
    relativePosition: definition.relativePosition,
    auf,
    algorithm,
  };
}

function extractionCase(state: CubeState, slot: F2LSlot): F2LCase {
  const pair = locatePair(state, slot);
  return {
    id: `F2L-extract-C${CORNER_POSITION_NAMES[pair.corner.position]}-E${EDGE_POSITION_NAMES[pair.edge.position]}`,
    number: null,
    category: "extraction",
    slot,
    corner: { ...pair.corner, positionName: CORNER_POSITION_NAMES[pair.corner.position] },
    edge: { ...pair.edge, positionName: EDGE_POSITION_NAMES[pair.edge.position] },
    cornerOrientation: null,
    edgeOrientation: null,
    relativePosition: null,
    auf: [],
    algorithm: [],
  };
}

export function recognizeF2LCase(state: CubeState, slot: F2LSlot): F2LCase {
  const data = SLOT_DATA[slot];
  const pair = locatePair(state, slot);

  if (isF2LSlotSolved(state, slot)) {
    const result = extractionCase(state, slot);
    return { ...result, id: `F2L-${slot}-solved`, category: "solved" };
  }

  if (pair.corner.position < 4 && pair.edge.position < 4) {
    return canonicalTopCase(state, slot);
  }

  if (pair.corner.position === data.cornerPosition && pair.edge.position < 4) {
    const cornerOrientation = canonicalCornerOrientation(pair.corner, slot);
    const edgeOrientation = topEdgeOrientation(state, pair.edge, slot);
    const definition = getCanonicalF2LCase(
      cornerInSlotCaseNumber(cornerOrientation, edgeOrientation),
    );
    return makeCase(state, slot, definition, []);
  }

  if (pair.edge.position === data.edgePosition && pair.corner.position < 4) {
    const aligned = alignTopCorner(state, slot);
    const cornerOrientation = canonicalCornerOrientation(aligned.corner, slot);
    const edgeOrientation = slottedEdgeOrientation(state, pair.edge, slot);
    const definition = getCanonicalF2LCase(
      edgeInSlotCaseNumber(cornerOrientation, edgeOrientation),
    );
    return makeCase(state, slot, definition, [], aligned.auf);
  }

  if (
    pair.corner.position === data.cornerPosition &&
    pair.edge.position === data.edgePosition
  ) {
    const cornerOrientation = canonicalCornerOrientation(pair.corner, slot);
    const edgeOrientation = slottedEdgeOrientation(state, pair.edge, slot);
    const definition = getCanonicalF2LCase(
      bothInSlotCaseNumber(cornerOrientation, edgeOrientation),
    );
    return makeCase(state, slot, definition, []);
  }

  return extractionCase(state, slot);
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

  for (const trigger of triggersForSlot(sourceSlot)) {
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
    throw new Error(`[solveF2L] no ${extract} extraction for ${target} from ${sourceSlot}`);
  }
  return { ...selected, decisionCount };
}

function planSlot(state: CubeState, slot: F2LSlot): SlotPlan {
  const protectedSlots = ALL_F2L_SLOTS.filter((candidate) => isF2LSlotSolved(state, candidate));
  const moves: Move[] = [];
  const actions: F2LAction[] = [];
  let currentState = state;
  let decisionCount = 0;
  let recognizedCase: F2LCase | null = null;

  for (let actionIndex = 0; actionIndex < 8 && !isF2LSlotSolved(currentState, slot); actionIndex++) {
    const recognized = recognizeF2LCase(currentState, slot);
    if (recognized.number !== null && recognizedCase === null) recognizedCase = recognized;

    if (recognized.category === "top-layer-pair") {
      decisionCount++;
      const stateAfter = applyMoves(currentState, recognized.algorithm);
      if (
        !isF2LSlotSolved(stateAfter, slot) ||
        !isAlignedCrossSolved(stateAfter).solved ||
        !allSlotsRemainSolved(stateAfter, protectedSlots)
      ) {
        throw new Error(`[solveF2L] invalid canonical algorithm ${slot}/${recognized.id}`);
      }

      actions.push({
        type: "pair-and-insert",
        caseId: recognized.id,
        category: recognized.category,
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
    const caseId = `${recognized.id}-${extraction.trigger.id}`;

    actions.push({
      type: extract === "corner" ? "extract-corner" : "extract-edge",
      caseId,
      category: "extraction",
      sourceSlot,
      algorithm: [...extraction.trigger.moves],
      stateBefore: currentState,
      stateAfter: extraction.stateAfter,
    });
    moves.push(...extraction.trigger.moves);
    currentState = extraction.stateAfter;
  }

  if (!isF2LSlotSolved(currentState, slot)) {
    throw new Error(`[solveF2L] canonical case actions did not solve ${slot}`);
  }

  if (recognizedCase === null) {
    const fallback = extractionCase(state, slot);
    recognizedCase = { ...fallback, id: actions.at(-1)?.caseId ?? fallback.id };
  }

  const newlySolvedSlots = ALL_F2L_SLOTS.filter(
    (candidate) => !isF2LSlotSolved(state, candidate) && isF2LSlotSolved(currentState, candidate),
  );

  return {
    slot,
    recognizedCase,
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

  if (selected === null) throw new Error(`[solveF2L] no visible pair can be selected`);
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
      caseId: plan.recognizedCase.id,
      category: plan.recognizedCase.category,
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

export function getCanonicalF2LCaseCount(): number {
  return CANONICAL_F2L_CASES.length;
}

export const registeredF2LCases = CANONICAL_F2L_CASES;
export const registeredF2LMacros = {
  cases: CANONICAL_F2L_CASES,
  canonicalTriggers: CANONICAL_FR_TRIGGERS,
};
