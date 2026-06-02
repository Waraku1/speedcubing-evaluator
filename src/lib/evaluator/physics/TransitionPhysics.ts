import { Move } from "../../cube/cube";

import { HumanState } from "../state/HumanState";

import { extractActionDemand }
from "./ActionDemandExtractor";

import { reduceHumanState }
from "./HumanStateReducer";

export function applyMovePhysics(
  state: HumanState,
  move: Move
): HumanState {
  const demand =
    extractActionDemand(move);

  return reduceHumanState(
    state,
    demand
  );
}