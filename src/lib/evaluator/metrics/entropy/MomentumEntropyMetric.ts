import { Transition }
from "../../transition/Transition";

import { calculateEntropy }
from "../../state-space/EntropyCalculator";

export class MomentumEntropyMetric {
  evaluate(
    transitions: Transition[]
  ): number {
    const buckets =
      new Map<string, number>();

    for (
      const transition
      of transitions
    ) {
      const continuity =
        transition.after.momentum
          .continuity;

      const velocity =
        transition.after.momentum
          .velocity;

      const bucket =
        `${continuity.toFixed(1)}:${velocity.toFixed(1)}`;

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