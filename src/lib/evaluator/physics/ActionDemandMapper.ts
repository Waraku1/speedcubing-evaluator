import { ActionDemand } from "./ActionDemand";

import { TransitionEffect } from "../transition-effects/TransitionEffect";

export function mapDemandToEffect(
  demand: ActionDemand
): TransitionEffect {
  return {
  gripDelta:
    -demand.gripLoad,

  fingerDelta:
    -demand.fingerLoad,

  orientationDelta:
    demand.orientationLoad,

  orientationUncertaintyDelta:
    demand.orientationLoad * 0.1,

  continuityDelta:
    -demand.continuityLoad,

  velocityDelta:
    -demand.continuityLoad * 0.5,
};
}