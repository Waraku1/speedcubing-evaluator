import { Move } from "../../cube/cube";
import { ActionDemand } from "./ActionDemand";

export function extractActionDemand(
  move: Move
): ActionDemand {
  const face = move[0];

  switch (face) {
    case "U":
      return {
        fingerLoad: 1,
        gripLoad: 0,
        orientationLoad: 0,
        continuityLoad: 0,
      };

    case "R":
      return {
        fingerLoad: 1,
        gripLoad: 0,
        orientationLoad: 0,
        continuityLoad: 0,
      };

    case "F":
      return {
        fingerLoad: 2,
        gripLoad: 2,
        orientationLoad: 0,
        continuityLoad: 1,
      };

    case "B":
      return {
        fingerLoad: 3,
        gripLoad: 3,
        orientationLoad: 1,
        continuityLoad: 2,
      };

    default:
      return {
        fingerLoad: 1,
        gripLoad: 1,
        orientationLoad: 0,
        continuityLoad: 0,
      };
  }
}