import { Metric } from "./Metric";
import { Transition } from "../transition/Transition";

export class ReachabilityMetric
  implements Metric<number>
{
  evaluate(
    transitions: Transition[]
  ): number {
    if (transitions.length === 0) {
      return 0;
    }

    let totalFreedom = 0;

    for (const t of transitions) {
      const available =
        Object.values(
          t.after.fingers.available
        ).filter(Boolean).length;

      totalFreedom += available;
    }

    return (
      totalFreedom /
      transitions.length
    );
  }
}