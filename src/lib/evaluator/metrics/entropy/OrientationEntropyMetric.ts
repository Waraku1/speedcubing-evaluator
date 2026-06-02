import { Transition }
from "../../transition/Transition";

import { calculateEntropy }
from "../../state-space/EntropyCalculator";

export class OrientationEntropyMetric {
  evaluate(
    transitions: Transition[]
  ): number {
    const buckets =
      new Map<string, number>();

    for (
      const transition
      of transitions
    ) {
      const certainty =
        transition.after.orientation
          .certainty;

      const bucket =
        certainty.toFixed(1);

      buckets.set(
        bucket,
        (buckets.get(bucket) ?? 0)
          + 1
      );
    }

    return calculateEntropy(
      [...buckets.values()]
    );
  }
}