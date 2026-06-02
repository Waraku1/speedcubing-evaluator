import { Transition }
from "../../transition/Transition";

import { calculateEntropy }
from "../../state-space/EntropyCalculator";

export class MomentumEntropyMetric {
  evaluate(
    transitions: Transition[]
  ): number {
    const buckets =
      new Map<number, number>();

    for (
      const transition
      of transitions
    ) {
      let delta = 0;

      if (
        transition.before.grip
          .leftContactCount !==
        transition.after.grip
          .leftContactCount
      ) {
        delta++;
      }

      if (
        transition.before.grip
          .rightContactCount !==
        transition.after.grip
          .rightContactCount
      ) {
        delta++;
      }

      buckets.set(
        delta,
        (buckets.get(delta) ?? 0)
          + 1
      );
    }

    return calculateEntropy(
      [...buckets.values()]
    );
  }
}