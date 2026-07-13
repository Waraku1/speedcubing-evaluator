import { Move } from "../../cube/cube";
import { HumanState } from "../state/HumanState";

export type Transition = {
  before: HumanState;
  move: Move;
  after: HumanState;
};