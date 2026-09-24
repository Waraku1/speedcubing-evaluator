import { describe, expect, it } from "vitest";

import {
  SOLVED_STATE,
  applyMoves,
  type Move,
} from "../../src/lib/cube/moves";

import {
  axisChangeRate,
  axisTransitionEntropy,
  extractStateFeatures,
  moveTransitionEntropy,
} from "../../src/lib/ee-experiment/features";

describe("EE experiment feature extraction", () => {
  it("returns zero disorder features for the solved state", () => {
    expect(extractStateFeatures(SOLVED_STATE)).toEqual({
      twistedCornerCount: 0,
      flippedEdgeCount: 0,
      cornerCycleDeficit: 0,
      edgeCycleDeficit: 0,
      permutationCycleDeficit: 0,
    });
  });

  it("keeps declared metrics finite on a legal scramble", () => {
    const scramble: Move[] = ["R", "U", "F2", "L'", "D", "B2", "R2", "U'", "F", "D2"];
    const state = applyMoves(SOLVED_STATE, scramble);
    const features = extractStateFeatures(state);

    expect(Number.isFinite(axisTransitionEntropy(scramble))).toBe(true);
    expect(features.twistedCornerCount).toBeGreaterThanOrEqual(0);
    expect(features.twistedCornerCount).toBeLessThanOrEqual(8);
    expect(features.flippedEdgeCount).toBeGreaterThanOrEqual(0);
    expect(features.flippedEdgeCount).toBeLessThanOrEqual(12);
  });

  it("bounds sequence metrics", () => {
    const moves: Move[] = ["R", "U", "R'", "U'", "F2"];
    expect(axisTransitionEntropy(moves)).toBeGreaterThanOrEqual(0);
    expect(axisTransitionEntropy(moves)).toBeLessThanOrEqual(1);
    expect(moveTransitionEntropy(moves)).toBeGreaterThanOrEqual(0);
    expect(moveTransitionEntropy(moves)).toBeLessThanOrEqual(1);
    expect(axisChangeRate(moves)).toBeGreaterThanOrEqual(0);
    expect(axisChangeRate(moves)).toBeLessThanOrEqual(1);
  });
});
