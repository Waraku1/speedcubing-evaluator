import { HumanState } from "../state/HumanState";
import { ActionCandidate } from "./ActionCandidate";

export interface ReachabilityModel {
  getCandidates(
    state: HumanState
  ): ActionCandidate[];
}