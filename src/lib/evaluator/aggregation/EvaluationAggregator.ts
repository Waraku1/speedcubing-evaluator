import { Transition } from "../transition/Transition";
import { FlowMetric } from "../metrics/FlowMetric";
import { RegripMetric } from "../metrics/RegripMetric";
import { AxisMetric } from "../metrics/AxisMetric";
import { EvaluationResult } from "../types/EvaluationResult";

export class EvaluationAggregator {
  evaluate(
    transitions: Transition[]
  ): EvaluationResult {
    const flow =
      new FlowMetric()
        .evaluate(
          transitions
        );

    const grip =
      1 /
      (1 +
        new RegripMetric()
          .evaluate(
            transitions
          ));

    const rotation =
      new AxisMetric()
        .evaluate(
          transitions
        );

    return {
      ergonomicsScore:
        (
          flow +
          grip +
          rotation
        ) /
        3,

      flowScore: flow,
      gripScore: grip,
      rotationScore: rotation,
      lookaheadScore: 0,

      reachabilityEntropy: 0,
      gripEntropy: 0,
      momentumEntropy: 0,
      orientationEntropy: 0,

      transitionCount:
        transitions.length,

      breakdown: {
        flow,
        grip,
        rotation,
        lookahead: 0,
      },
    };
  }
}