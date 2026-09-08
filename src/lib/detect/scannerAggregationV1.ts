import type { CubeDraftTokenV1 } from "../ui/cubeDraftV1";

const KNOWN_TOKENS = ["U", "R", "F", "D", "L", "B"] as const;
const TOKEN_SET = new Set<string>([...KNOWN_TOKENS, "N"]);

/**
 * Aggregate same-position observations with a unique strict majority.
 * Unknown/invalid observations participate in the denominator and never become U.
 */
export function aggregateScannerSamplesV1(
  samples: readonly (readonly unknown[])[]
): readonly CubeDraftTokenV1[] {
  if (samples.length === 0 || samples.some((sample) => sample.length !== 27)) {
    throw new RangeError("Scanner aggregation requires one or more 27-token samples.");
  }

  return Object.freeze(
    Array.from({ length: 27 }, (_, index): CubeDraftTokenV1 => {
      const counts = new Map<CubeDraftTokenV1, number>();

      for (const sample of samples) {
        const value = sample[index];
        const token =
          typeof value === "string" && TOKEN_SET.has(value)
            ? (value as CubeDraftTokenV1)
            : "N";
        counts.set(token, (counts.get(token) ?? 0) + 1);
      }

      let winner: CubeDraftTokenV1 = "N";
      let winnerCount = 0;
      let tied = false;

      for (const token of KNOWN_TOKENS) {
        const count = counts.get(token) ?? 0;
        if (count > winnerCount) {
          winner = token;
          winnerCount = count;
          tied = false;
        } else if (count === winnerCount && count > 0) {
          tied = true;
        }
      }

      return !tied && winnerCount > samples.length / 2 ? winner : "N";
    })
  );
}
