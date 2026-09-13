import type { SampleSummary } from "./contracts";

export function validatedSamples(
  samples: readonly number[],
  options: Readonly<{ allowNegative?: boolean }> = {}
): number[] {
  if (samples.length === 0) {
    throw new TypeError("Performance samples must not be empty.");
  }

  const copy = samples.map((sample) => {
    if (!Number.isFinite(sample)) {
      throw new TypeError("Performance samples must be finite numbers.");
    }
    if (!options.allowNegative && sample < 0) {
      throw new TypeError("Performance samples must not be negative.");
    }
    return sample;
  });

  return copy.sort((left, right) => left - right);
}

/**
 * Hyndman-Fan type 7 percentile, also used by common spreadsheet and R defaults.
 * For sorted n samples, the zero-based rank is (n - 1) * p and adjacent ranks
 * are linearly interpolated. Percent is inclusive from 0 through 100.
 */
export function percentile(samples: readonly number[], percent: number): number {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new RangeError("Percentile must be between 0 and 100 inclusive.");
  }

  const sorted = validatedSamples(samples);
  const rank = (sorted.length - 1) * (percent / 100);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];

  return lower + (upper - lower) * (rank - lowerIndex);
}

export function summarizeSamples(samples: readonly number[]): SampleSummary {
  const sorted = validatedSamples(samples);

  return Object.freeze({
    min: sorted[0],
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1],
  });
}
