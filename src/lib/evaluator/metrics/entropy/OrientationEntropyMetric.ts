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
      const orientation =
        transition.after.orientation;

      const bucket =
        [
          orientation.x.toFixed(1),
          orientation.y.toFixed(1),
          orientation.z.toFixed(1),
          orientation.certainty.toFixed(1),
        ].join(":");

      buckets.set(
        bucket,
        (buckets.get(bucket) ?? 0) + 1
      );
    }

    return calculateEntropy(
      [...buckets.values()]
    );
  }
}