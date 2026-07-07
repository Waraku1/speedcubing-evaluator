import { Move } from "../../cube/cube";

import { ActionDemand }
from "./ActionDemand";

export function extractActionDemand(
  move: Move
): ActionDemand {
  const face = move[0];

  switch (face) {
    case "U":
      return {
        fingerLoad: 0.8,
        gripLoad: 0.1,
        orientationLoad: 0,
        continuityLoad: 0.1,
      };

    case "D":
      return {
        fingerLoad: 1.2,
        gripLoad: 0.3,
        orientationLoad: 0.2,
        continuityLoad: 0.3,
      };

    case "R":
      return {
        fingerLoad: 1,
        gripLoad: 0.1,
        orientationLoad: 0,
        continuityLoad: 0.1,
      };

    case "L":
      return {
        fingerLoad: 1.2,
        gripLoad: 0.3,
        orientationLoad: 0.2,
        continuityLoad: 0.3,
      };

    case "F":
      return {
        fingerLoad: 1.5,
        gripLoad: 1,
        orientationLoad: 0.5,
        continuityLoad: 0.8,
      };

    case "B":
      return {
        fingerLoad: 2,
        gripLoad: 1.5,
        orientationLoad: 1,
        continuityLoad: 1.2,
      };

    default:
      return {
        fingerLoad: 1,
        gripLoad: 0.2,
        orientationLoad: 0,
        continuityLoad: 0.1,
      };
  }
}