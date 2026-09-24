import { describe, expect, it } from "vitest";

import {
  decodeCubies,
  extractStateFeatures,
} from "../../src/lib/ee-experiment/features";

import {
  generateRandomState,
  permutationParity,
} from "../../src/lib/ee-experiment/random-state";

import {
  assertValidCubeState,
} from "../../src/lib/cfop-solver/state-adapter";

describe("EE random-state generator", () => {
  it("regenerates the identical state from study seed and sample index", () => {
    const a = generateRandomState("EE-RANDOM-STATE-TEST", 17);
    const b = generateRandomState("EE-RANDOM-STATE-TEST", 17);

    expect(b).toEqual(a);
  });

  it("satisfies cube constraints and coordinate/facelet round-trip", () => {
    for (let index = 0; index < 100; index++) {
      const generated = generateRandomState("EE-RANDOM-STATE-INVARIANTS", index);
      const { cp, co, ep, eo } = generated.coordinates;

      expect(new Set(cp).size).toBe(8);
      expect(new Set(ep).size).toBe(12);
      expect(co.reduce((sum, value) => sum + value, 0) % 3).toBe(0);
      expect(eo.reduce((sum, value) => sum + value, 0) % 2).toBe(0);
      expect(permutationParity(cp)).toBe(permutationParity(ep));
      expect(generated.stateSignature).toMatch(/^[URFDLB]{54}$/);

      expect(() => assertValidCubeState(generated.stateSignature)).not.toThrow();

      const decoded = decodeCubies(generated.stateSignature);
      expect(decoded.cornerPermutation).toEqual(cp);
      expect(decoded.cornerOrientation).toEqual(co);
      expect(decoded.edgePermutation).toEqual(ep);
      expect(decoded.edgeOrientation).toEqual(eo);

      const features = extractStateFeatures(generated.stateSignature);
      expect(features.flippedEdgeCount).toBeGreaterThanOrEqual(0);
      expect(features.flippedEdgeCount).toBeLessThanOrEqual(12);
      expect(features.twistedCornerCount).toBeGreaterThanOrEqual(0);
      expect(features.twistedCornerCount).toBeLessThanOrEqual(8);
      expect(Number.isFinite(features.permutationCycleDeficit)).toBe(true);
    }
  });
});
