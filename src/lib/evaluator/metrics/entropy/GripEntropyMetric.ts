import { Transition } from "../../transition/Transition";

export class GripEntropyMetric {
  evaluate(
    transitions: Transition[]
  ): number {
    const seen = new Set<string>();

    for (const t of transitions) {
      seen.add(
        JSON.stringify(
          t.after.grip
        )
      );
    }

    return seen.size;
  }
}