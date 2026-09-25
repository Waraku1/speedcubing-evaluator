import { describe, expect, it } from "vitest";

import {
  decodeCubies,
  extractStateFeatures,
} from "../../src/lib/ee-experiment/features";

import {
  LEGAL_EO_VECTOR_COUNT,
  eoHammingWeight,
  eoVectorFromIndex,
  generateEOExperimentState,
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
  it("enumerates every legal EO vector exactly once with the exact Hamming-weight distribution", () => {
    const seen = new Set<string>();
    const counts = new Map<number, number>();

    for (let eoIndex = 0; eoIndex < LEGAL_EO_VECTOR_COUNT; eoIndex++) {
      const eo = eoVectorFromIndex(eoIndex);
      expect(eo.reduce((sum, value) => sum + value, 0) % 2).toBe(0);
      seen.add(eo.join(""));
      const weight = eoHammingWeight(eo);
      counts.set(weight, (counts.get(weight) ?? 0) + 1);
    }

    expect(seen.size).toBe(2048);
    expect(Object.fromEntries(counts)).toEqual({
      0: 1,
      2: 66,
      4: 495,
      6: 924,
      8: 495,
      10: 66,
      12: 1,
    });
  });

  it("randomizes nuisance coordinates independently across complete EO blocks", () => {
    const a = generateEOExperimentState("EE-EO-TEST", 0, 777);
    const b = generateEOExperimentState("EE-EO-TEST", 1, 777);

    expect(a.coordinates.eo).toEqual(b.coordinates.eo);
    expect(a.eoHammingWeight).toBe(b.eoHammingWeight);
    expect(a.stateSignature).not.toBe(b.stateSignature);
  });
});
