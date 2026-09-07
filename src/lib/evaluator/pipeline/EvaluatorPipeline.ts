import type { DomainDemandV1 } from "../demand/DomainDemandV1";
import type { DemandAdvanceInputV1 } from "../demand/DemandAdvanceInputV1";
import { StatusOnlyDomainDemandProducerV1 } from "../demand/StatusOnlyDomainDemandProducerV1";
import { TransitionDemandExtractor } from "../demand/TransitionDemandExtractor";
import type { Transition } from "../transition/Transition";

function isLegacyTransitionInput(
  input: DemandAdvanceInputV1 | readonly Transition[]
): input is readonly Transition[] {
  return Array.isArray(input);
}

export class EvaluatorPipeline {
  private readonly transitionDemandExtractor:
    TransitionDemandExtractor;
  private readonly statusOnlyDomainDemandProducer:
    StatusOnlyDomainDemandProducerV1;

  constructor() {
    this.transitionDemandExtractor =
      new TransitionDemandExtractor();
    this.statusOnlyDomainDemandProducer =
      new StatusOnlyDomainDemandProducerV1();
  }

  advanceToDemand(
    input: DemandAdvanceInputV1 | readonly Transition[]
  ): DomainDemandV1 {
    if (isLegacyTransitionInput(input)) {
      return this.transitionDemandExtractor.extract(input);
    }

    if (input.kind === "GOVERNED_TRANSITIONS") {
      return this.transitionDemandExtractor.extract(input.transitions);
    }

    return this.statusOnlyDomainDemandProducer.produce(input);
  }
}
