import { DemandField } from "../demand/DemandField";
import { TransitionDemandExtractor } from "../demand/TransitionDemandExtractor";
import { Transition } from "../transition/Transition";

export class EvaluatorPipeline {
  private readonly transitionDemandExtractor:
    TransitionDemandExtractor;

  constructor() {
    this.transitionDemandExtractor =
      new TransitionDemandExtractor();
  }

  advanceToDemand(
    transitions: Transition[]
  ): DemandField {
    return {
      vectors: transitions.map(
        (transition) =>
          this.transitionDemandExtractor.extract(
            transition
          )
      ),
    };
  }
}
