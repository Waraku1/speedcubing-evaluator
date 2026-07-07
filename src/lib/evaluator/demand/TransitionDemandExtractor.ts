import { Transition } from "../transition/Transition";

import { DemandVector } from "./DemandVector";

export class TransitionDemandExtractor {
  extract(
    transition: Transition
  ): DemandVector {
    const fingerDemand =
      this.extractFingerDemand(
        transition
      );

    const gripDemand =
      this.extractGripDemand(
        transition
      );

    const orientationDemand =
      this.extractOrientationDemand(
        transition
      );

    const continuityDemand =
      this.extractContinuityDemand(
        transition
      );

    return {
      fingerDemand,
      gripDemand,
      orientationDemand,
      continuityDemand,
    };
  }

  private extractFingerDemand(
    transition: Transition
  ): number {
    const before =
      transition.before.fingers;

    const after =
      transition.after.fingers;

    const keys =
      Object.keys(
        after.fatigue
      ) as Array<
        keyof typeof after.fatigue
      >;

    let total = 0;

    for (const key of keys) {
      total +=
        Math.max(
          0,
          after.fatigue[key] -
          before.fatigue[key]
        );
    }

    return total;
  }

  private extractGripDemand(
    transition: Transition
  ): number {
    const before =
      transition.before.grip;

    const after =
      transition.after.grip;

    return (
      Math.abs(
        before.leftContactCount -
        after.leftContactCount
      ) +
      Math.abs(
        before.rightContactCount -
        after.rightContactCount
      )
    );
  }

  private extractOrientationDemand(
    transition: Transition
  ): number {
    const before =
      transition.before.orientation;

    const after =
      transition.after.orientation;

    return Math.max(
      0,
      before.certainty -
      after.certainty
    );
  }

  private extractContinuityDemand(
    transition: Transition
  ): number {
    const before =
      transition.before.momentum;

    const after =
      transition.after.momentum;

    return Math.max(
      0,
      before.continuity -
      after.continuity
    );
  }
}