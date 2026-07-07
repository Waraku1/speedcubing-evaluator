import { calculateEntropy }
from "./EntropyCalculator";

export function calculateNormalizedEntropy(
  values: number[]
): number {
  if (
    values.length <= 1
  ) {
    return 0;
  }

  const entropy =
    calculateEntropy(values);

  const maxEntropy =
    Math.log2(
      values.length
    );

  if (
    maxEntropy === 0
  ) {
    return 0;
  }

  return entropy /
    maxEntropy;
}