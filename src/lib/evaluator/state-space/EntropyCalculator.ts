export function calculateEntropy(
  values: number[]
): number {
  const total = values.reduce(
    (a, b) => a + b,
    0
  );

  if (total === 0) {
    return 0;
  }

  return values.reduce(
    (entropy, value) => {
      const p = value / total;

      if (p <= 0) {
        return entropy;
      }

      return (
        entropy -
        p * Math.log2(p)
      );
    },
    0
  );
}