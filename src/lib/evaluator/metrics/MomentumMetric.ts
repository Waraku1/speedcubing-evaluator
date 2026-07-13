import { Metric } from "./Metric";
import { Transition } from "../transition/Transition";

function distance(
  before: Transition["before"],
  after: Transition["after"]
): number {
  let d = 0;

  if (
    before.grip.leftContactCount !==
    after.grip.leftContactCount
  ) {
    d++;
  }

  if (
    before.grip.rightContactCount !==
    after.grip.rightContactCount
  ) {
    d++;
  }

  return d;
}

export class MomentumMetric
  implements Metric<number>
{
  evaluate(
    transitions: Transition[]
  ): number {
    if (transitions.length === 0) {
      return 1;
    }

    let total = 0;

    for (const t of transitions) {
      total += distance(
        t.before,
        t.after
      );
    }

    const avg =
      total / transitions.length;

    return 1 / (1 + avg);
  }
}