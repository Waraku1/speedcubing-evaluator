import { Transition }
from "../transition/Transition";

import { ActionDemand }
from "./ActionDemand";

export function extractTransitionDemand(
  transition: Transition
): ActionDemand {
  const {
    before,
    after,
  } = transition;

  const gripLoad =
    Math.max(
      0,
      before.grip.leftContactCount -
      after.grip.leftContactCount
    );

  const orientationLoad =
    Math.max(
      0,
      before.orientation.certainty -
      after.orientation.certainty
    );

  const continuityLoad =
    Math.max(
      0,
      before.momentum.continuity -
      after.momentum.continuity
    );

  const fingerLoad =
    Math.max(
      0,
      after.fingers.fatigue.L_INDEX -
      before.fingers.fatigue.L_INDEX
    );

  return {
    fingerLoad,
    gripLoad,
    orientationLoad,
    continuityLoad,
  };
}