import { Metric } from "./Metric";

import { Transition } from "../transition/Transition";

import { ReachabilityModel } from "../state-space/ReachabilityModel";

import { calculateEntropy }
from "../state-space/EntropyCalculator";

export class ReachabilityEntropyMetric
  implements Metric<number>
{
  constructor(
    private readonly model:
      ReachabilityModel
  ) {}

  evaluate(
    transitions: Transition[]
  ): number {
    if (
      transitions.length === 0
    ) {
      return 0;
    }

    let total = 0;

    for (
      const transition
      of transitions
    ) {
      const candidates =
        this.model.getCandidates(
          transition.after
        );

      total +=
        calculateEntropy(
          candidates.map(
            (c) =>
              c.feasibility
          )
        );
    }

    return (
      total /
      transitions.length
    );
  }
}