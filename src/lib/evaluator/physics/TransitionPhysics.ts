import { Move } from "../../cube/cube";

import { HumanState } from "../state/HumanState";

import { extractActionDemand }
from "./ActionDemandExtractor";

import { mapDemandToEffect }
from "./ActionDemandMapper";

import { reduceHumanState }
from "./HumanStateReducer";

export function applyMovePhysics(
  state: HumanState,
  move: Move
): HumanState {
  const demand =
    extractActionDemand(move);

  const effect =
    mapDemandToEffect(
      demand
    );

  return reduceHumanState(
    state,
    effect
  );
}