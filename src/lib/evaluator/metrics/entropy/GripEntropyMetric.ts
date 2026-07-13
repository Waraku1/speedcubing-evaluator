import { Transition }
from "../../transition/Transition";

import { calculateEntropy }
from "../../state-space/EntropyCalculator";

export class GripEntropyMetric {
  evaluate(
    transitions: Transition[]
  ): number {
    const counts =
      new Map<string, number>();

    for (
      const transition
      of transitions
    ) {
      const key =
        JSON.stringify(
          transition.after.grip
        );

      counts.set(
        key,
        (counts.get(key) ?? 0)
          + 1
      );
    }

    return calculateEntropy(
      [...counts.values()]
    );
  }
}