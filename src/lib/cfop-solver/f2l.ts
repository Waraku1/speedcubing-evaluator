/**
 * f2l.ts — complete macro-based human F2L solver
 *
 * Instead of raw-move BFS, this solver searches only over standard human F2L
 * macros:
 *   - U / U' / U2 setups
 *   - four safe triggers for each currently unsolved slot
 *
 * Each trigger preserves the aligned D cross and every other F2L slot. The
 * search abstraction tracks only the target pair and the four-slot solved
 * mask, so the state space is at most 576 × 16 states per target slot.
 */

import {
  applyMoves,
  type CubeState,
  type Move,
} from "../cube/moves";

import {
  ALL_F2L_SLOTS,
  countSolvedF2LSlots,
  getF2LPairKey,
  getF2LSolvedMask,
  getF2LSlotStatus,
  getUnsolvedF2LSlots,
  isAlignedCrossSolved,
  isF2LSolved,
  isF2LSlotSolved,
  type F2LSlot,
} from "./detection";

export type F2LMacro = {
  id: string;
  slot: F2LSlot | null;
  moves: Move[];
  description: string;
};

export type F2LStage = {
  slot: F2LSlot;
  moves: Move[];
  macroIds: string[];
  stateBefore: CubeState;
  stateAfter: CubeState;
  searchedNodes: number;
};

export type F2LResult = {
  moves: Move[];
  depth: number;
  stateAfter: CubeState;
  slotMoves: Record<F2LSlot, Move[]>;
  solvedOrder: F2LSlot[];
  stages: F2LStage[];
  searchedNodes: number;
};

type SearchNode = {
  state: CubeState;
  moves: Move[];
  macroIds: string[];
  macroDepth: number;
  lastMacroId: string | null;
};

type SlotCandidate = {
  slot: F2LSlot;
  moves: Move[];
  macroIds: string[];
  stateAfter: CubeState;
  searchedNodes: number;
};

const MAX_MACRO_DEPTH = 8;
const SLOT_NODE_LIMIT = 12_000;

function parseAlgorithm(value: string): Move[] {
  return value.trim().split(/\s+/) as Move[];
}

const U_MACROS: readonly F2LMacro[] = [
  {
    id: "setup-U",
    slot: null,
    moves: ["U"],
    description: "Rotate the U layer clockwise.",
  },
  {
    id: "setup-U-prime",
    slot: null,
    moves: ["U'"],
    description: "Rotate the U layer counter-clockwise.",
  },
  {
    id: "setup-U2",
    slot: null,
    moves: ["U2"],
    description: "Rotate the U layer by 180 degrees.",
  },
];

const SLOT_MACROS: Readonly<Record<F2LSlot, readonly F2LMacro[]>> = {
  FR: [
    ["FR-R-U-Rp", "R U R'"],
    ["FR-R-Up-Rp", "R U' R'"],
    ["FR-Fp-U-F", "F' U F"],
    ["FR-Fp-Up-F", "F' U' F"],
  ].map(([id, algorithm]) => ({
    id,
    slot: "FR" as const,
    moves: parseAlgorithm(algorithm),
    description: "Safe FR extraction, pairing, or insertion trigger.",
  })),

  FL: [
    ["FL-F-U-Fp", "F U F'"],
    ["FL-F-Up-Fp", "F U' F'"],
    ["FL-Lp-U-L", "L' U L"],
    ["FL-Lp-Up-L", "L' U' L"],
  ].map(([id, algorithm]) => ({
    id,
    slot: "FL" as const,
    moves: parseAlgorithm(algorithm),
    description: "Safe FL extraction, pairing, or insertion trigger.",
  })),

  BR: [
    ["BR-Rp-U-R", "R' U R"],
    ["BR-Rp-Up-R", "R' U' R"],
    ["BR-B-U-Bp", "B U B'"],
    ["BR-B-Up-Bp", "B U' B'"],
  ].map(([id, algorithm]) => ({
    id,
    slot: "BR" as const,
    moves: parseAlgorithm(algorithm),
    description: "Safe BR extraction, pairing, or insertion trigger.",
  })),

  BL: [
    ["BL-L-U-Lp", "L U L'"],
    ["BL-L-Up-Lp", "L U' L'"],
    ["BL-Bp-U-B", "B' U B"],
    ["BL-Bp-Up-B", "B' U' B"],
  ].map(([id, algorithm]) => ({
    id,
    slot: "BL" as const,
    moves: parseAlgorithm(algorithm),
    description: "Safe BL extraction, pairing, or insertion trigger.",
  })),
};

function cloneSlotMoves(): Record<F2LSlot, Move[]> {
  return {
    FR: [],
    FL: [],
    BR: [],
    BL: [],
  };
}

function appendMoves(target: Move[], source: readonly Move[]): void {
  for (const move of source) target.push(move);
}

function allProtectedSlotsRemainSolved(
  state: CubeState,
  protectedSlots: readonly F2LSlot[],
): boolean {
  return protectedSlots.every((slot) => isF2LSlotSolved(state, slot));
}

function searchKey(state: CubeState, target: F2LSlot): number {
  return getF2LPairKey(state, target) * 16 + getF2LSolvedMask(state);
}

function getActiveMacros(state: CubeState): F2LMacro[] {
  const active = [...U_MACROS];

  for (const slot of getUnsolvedF2LSlots(state)) {
    active.push(...SLOT_MACROS[slot]);
  }

  return active;
}

function isRepeatedUSetup(previous: string | null, current: F2LMacro): boolean {
  return previous?.startsWith("setup-U") === true && current.slot === null;
}

function findSlotCandidate(
  state: CubeState,
  target: F2LSlot,
): SlotCandidate | null {
  const solvedBefore = countSolvedF2LSlots(state);
  const protectedSlots = ALL_F2L_SLOTS.filter((slot) => isF2LSlotSolved(state, slot));
  const macros = getActiveMacros(state);

  const queue: SearchNode[] = [{
    state,
    moves: [],
    macroIds: [],
    macroDepth: 0,
    lastMacroId: null,
  }];

  const visited = new Set<number>([searchKey(state, target)]);

  for (let cursor = 0; cursor < queue.length; cursor++) {
    if (cursor >= SLOT_NODE_LIMIT) {
      throw new Error(
        `[solveF2L] ${target} node limit exceeded: ${SLOT_NODE_LIMIT}`,
      );
    }

    const node = queue[cursor];
    if (node.macroDepth >= MAX_MACRO_DEPTH) continue;

    for (const macro of macros) {
      if (isRepeatedUSetup(node.lastMacroId, macro)) continue;

      const nextState = applyMoves(node.state, macro.moves);

      if (!isAlignedCrossSolved(nextState).solved) continue;
      if (!allProtectedSlotsRemainSolved(nextState, protectedSlots)) continue;

      const nextMoves = [...node.moves, ...macro.moves];
      const nextMacroIds = [...node.macroIds, macro.id];
      const solvedAfter = countSolvedF2LSlots(nextState);

      if (
        isF2LSlotSolved(nextState, target) &&
        solvedAfter === solvedBefore + 1
      ) {
        return {
          slot: target,
          moves: nextMoves,
          macroIds: nextMacroIds,
          stateAfter: nextState,
          searchedNodes: cursor + 1,
        };
      }

      const key = searchKey(nextState, target);
      if (visited.has(key)) continue;

      visited.add(key);
      queue.push({
        state: nextState,
        moves: nextMoves,
        macroIds: nextMacroIds,
        macroDepth: node.macroDepth + 1,
        lastMacroId: macro.id,
      });
    }
  }

  return null;
}

function chooseBestCandidate(state: CubeState): SlotCandidate {
  const unsolvedSlots = getUnsolvedF2LSlots(state);
  let best: SlotCandidate | null = null;

  for (const slot of unsolvedSlots) {
    const candidate = findSlotCandidate(state, slot);
    if (candidate === null) continue;

    if (
      best === null ||
      candidate.moves.length < best.moves.length ||
      (
        candidate.moves.length === best.moves.length &&
        candidate.macroIds.length < best.macroIds.length
      )
    ) {
      best = candidate;
    }
  }

  if (best !== null) return best;

  const details = unsolvedSlots
    .map((slot) => `${slot}:${JSON.stringify(getF2LSlotStatus(state, slot).wrongStickers)}`)
    .join(" | ");

  throw new Error(`[solveF2L] no human-macro solution found: ${details}`);
}

export function solveF2L(state: CubeState): F2LResult {
  if (!isAlignedCrossSolved(state).solved) {
    throw new Error(`[solveF2L] aligned cross must be solved before F2L`);
  }

  if (isF2LSolved(state).solved) {
    return {
      moves: [],
      depth: 0,
      stateAfter: state,
      slotMoves: cloneSlotMoves(),
      solvedOrder: [],
      stages: [],
      searchedNodes: 0,
    };
  }

  let currentState = state;
  const allMoves: Move[] = [];
  const slotMoves = cloneSlotMoves();
  const solvedOrder: F2LSlot[] = [];
  const stages: F2LStage[] = [];
  let searchedNodes = 0;

  while (!isF2LSolved(currentState).solved) {
    const candidate = chooseBestCandidate(currentState);
    const before = currentState;

    appendMoves(allMoves, candidate.moves);
    appendMoves(slotMoves[candidate.slot], candidate.moves);
    solvedOrder.push(candidate.slot);
    searchedNodes += candidate.searchedNodes;
    currentState = candidate.stateAfter;

    stages.push({
      slot: candidate.slot,
      moves: [...candidate.moves],
      macroIds: [...candidate.macroIds],
      stateBefore: before,
      stateAfter: currentState,
      searchedNodes: candidate.searchedNodes,
    });
  }

  if (!isAlignedCrossSolved(currentState).solved) {
    throw new Error(`[solveF2L] F2L broke the aligned cross`);
  }

  return {
    moves: allMoves,
    depth: allMoves.length,
    stateAfter: currentState,
    slotMoves,
    solvedOrder,
    stages,
    searchedNodes,
  };
}

export const registeredF2LMacros = {
  U: U_MACROS,
  slots: SLOT_MACROS,
};
