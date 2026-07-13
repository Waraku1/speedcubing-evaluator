import { Move } from "../../cube/cube";

import { HumanState } from "../state/HumanState";

import { ActionCandidate } from "./ActionCandidate";
import { ReachabilityModel } from "./ReachabilityModel";

const MOVES: Move[] = [
  "U",
  "U'",
  "R",
  "R'",
  "F",
  "F'",
  "L",
  "L'",
  "D",
  "D'",
  "B",
  "B'",
];

export class RuleBasedReachabilityModel
  implements ReachabilityModel
{
  getCandidates(
    state: HumanState
  ): ActionCandidate[] {
    return MOVES.map((move) => {
      let feasibility = 1;

      if (
        state.grip.rightContactCount <
        2
      ) {
        if (
          move.startsWith("B")
        ) {
          feasibility *= 0.3;
        }
      }

      return {
        move,
        feasibility,
      };
    });
  }
}