import { Metric } from "./Metric";
import { Transition } from "../transition/Transition";

export class FlowMetric
  implements Metric<number>
{
  evaluate(
    transitions: Transition[]
  ): number {
    if (
      transitions.length === 0
    ) {
      return 1;
    }

    let penalty = 0;

    for (
      let i = 1;
      i < transitions.length;
      i++
    ) {
      const prev =
        transitions[i - 1]
          .move[0];

      const next =
        transitions[i]
          .move[0];

      if (prev === next) {
        penalty += 0.05;
      }
    }

    return Math.max(
      0,
      1 - penalty
    );
  }
}