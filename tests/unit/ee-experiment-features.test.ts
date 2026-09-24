import { describe, expect, it } from "vitest";

import {
  SOLVED_STATE,
  type Move,
} from "../../src/lib/cube/moves";

import {
  axisChangeRate,
  extractStateFeatures,
  moveTransitionEntropy,
} from "../../src/lib/ee-experiment/features";

describe("EE experiment feature extraction", () => {
  it("returns zero state-disorder features for the solved state", () => {
    expect(extractStateFeatures(SOLVED_STATE)).toEqual({
      twistedCornerCount: 0,
      flippedEdgeCount: 0,
      cornerCycleDeficit: 0,
      edgeCycleDeficit: 0,
      permutationCycleDeficit: 0,
    });
  });

  it("bounds solution-sequence metrics", () => {
    const moves: Move[] = ["R", "U", "R'", "U'", "F2"];

    expect(moveTransitionEntropy(moves)).toBeGreaterThanOrEqual(0);
    expect(moveTransitionEntropy(moves)).toBeLessThanOrEqual(1);
    expect(axisChangeRate(moves)).toBeGreaterThanOrEqual(0);
    expect(axisChangeRate(moves)).toBeLessThanOrEqual(1);
  });
});
