import { Transition } from "../transition/Transition";

export interface Metric<T> {
  evaluate(
    transitions: Transition[]
  ): T;
}