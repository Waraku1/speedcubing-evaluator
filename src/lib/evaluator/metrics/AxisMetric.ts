import { Face } from "../../cube/cube";
import { Metric } from "./Metric";
import { Transition } from "../transition/Transition";

type Axis = "UD" | "RL" | "FB";

const FACE_TO_AXIS: Record<Face, Axis> = {
  U: "UD",
  D: "UD",
  R: "RL",
  L: "RL",
  F: "FB",
  B: "FB",
};

export class AxisMetric
  implements Metric<number>
{
  evaluate(
    transitions: Transition[]
  ): number {
    if (transitions.length <= 1) {
      return 1;
    }

    let switches = 0;

    for (
      let i = 1;
      i < transitions.length;
      i++
    ) {
      const prev =
        FACE_TO_AXIS[
          transitions[i - 1]
            .move[0] as Face
        ];

      const next =
        FACE_TO_AXIS[
          transitions[i]
            .move[0] as Face
        ];

      if (prev !== next) {
        switches++;
      }
    }

    return (
      1 -
      switches /
        (transitions.length - 1)
    );
  }
}