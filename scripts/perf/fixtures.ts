import { applyMoves } from "../../src/lib/cube/moves";
import { createCubeFaceletStateV1 } from "../../src/lib/cube/cubeStateV1";
import type { Move } from "../../src/lib/cube/cube";
import { createInitialHumanState } from "../../src/lib/evaluator/transition/HumanStateFactory";
import { generateTransitions } from "../../src/lib/evaluator/transition/TransitionGenerator";
import type { Transition } from "../../src/lib/evaluator/transition/Transition";
import {
  MOVE_V1_TOKENS,
  SOLVED_FACELETS_V1,
  type CubeFaceletStateV1,
  type MoveV1,
} from "../../src/types/solver-v1";

export const PERFORMANCE_FIXTURE_SEED = 0x51f15e;
export const PERFORMANCE_SCRAMBLE_LENGTH = 18;

export function fixedSeedScrambles(count: number): MoveV1[][] {
  if (!Number.isInteger(count) || count < 1) {
    throw new TypeError("Fixture count must be a positive integer.");
  }
  let seed = PERFORMANCE_FIXTURE_SEED;
  const results: MoveV1[][] = [];

  for (let stateIndex = 0; stateIndex < count; stateIndex += 1) {
    const moves: MoveV1[] = [];
    let previousFace = "";
    while (moves.length < PERFORMANCE_SCRAMBLE_LENGTH) {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      const candidate = MOVE_V1_TOKENS[seed % MOVE_V1_TOKENS.length];
      if (candidate[0] === previousFace) continue;
      moves.push(candidate);
      previousFace = candidate[0];
    }
    results.push(moves);
  }
  return results;
}

export function fixedLegalCubeStates(count: number): CubeFaceletStateV1[] {
  const states = fixedSeedScrambles(count).map((scramble) =>
    createCubeFaceletStateV1(applyMoves(SOLVED_FACELETS_V1, scramble))
  );
  if (new Set(states.map((state) => state.stateId)).size !== count) {
    throw new Error("Deterministic performance states must be unique.");
  }
  return states;
}

export function governedTransitions(count: number): Transition[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new TypeError("Transition count must be a positive integer.");
  }
  const source = fixedSeedScrambles(Math.ceil(count / PERFORMANCE_SCRAMBLE_LENGTH)).flat();
  const moves = Array.from({ length: count }, (_, index) => source[index] as Move);
  return generateTransitions(createInitialHumanState(), moves);
}
