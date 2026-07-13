import { Face } from "../../cube/cube";
import { Metric } from "./Metric";
import { Transition } from "../transition/Transition";

const REGRIP_FACES =
  new Set<Face>(["F", "B"]);

export class RegripMetric
  implements Metric<number>
{
  evaluate(
    transitions: Transition[]
  ): number {
    let count = 0;

    for (const t of transitions) {
      const face =
        t.move[0] as Face;

      if (
        REGRIP_FACES.has(face)
      ) {
        count++;
      }
    }

    return count;
  }
}