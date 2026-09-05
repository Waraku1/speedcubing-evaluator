import type { DomainDemandV1 } from "../demand/DomainDemandV1";
import { TransitionDemandExtractor } from "../demand/TransitionDemandExtractor";
import type { Transition } from "../transition/Transition";

export class EvaluatorPipeline {
  private readonly transitionDemandExtractor:
    TransitionDemandExtractor;

  constructor() {
    this.transitionDemandExtractor =
      new TransitionDemandExtractor();
  }

  advanceToDemand(
    transitions: readonly Transition[]
  ): DomainDemandV1 {
    return this.transitionDemandExtractor.extract(
      transitions
    );
  }
}
