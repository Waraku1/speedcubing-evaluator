// aggregation/EvaluationAggregator.ts

import { Transition } from "../transition/Transition";

import { EvaluationResult } from "../types/EvaluationResult";

import { ReachabilityModel } from "../state-space/ReachabilityModel";

import { ReachabilityEntropyMetric } from "../metrics/ReachabilityEntropyMetric";

import { GripEntropyMetric } from "../metrics/entropy/GripEntropyMetric";
import { MomentumEntropyMetric } from "../metrics/entropy/MomentumEntropyMetric";
import { OrientationEntropyMetric } from "../metrics/entropy/OrientationEntropyMetric";

import { FlowInterpreter } from "../interpretation/FlowInterpreter";
import { GripInterpreter } from "../interpretation/GripInterpreter";
import { LookaheadInterpreter } from "../interpretation/LookaheadInterpreter";
import { RotationBurdenInterpreter } from "../interpretation/RotationBurdenInterpreter";
import { ErgonomicsInterpreter } from "../interpretation/ErgonomicsInterpreter";

export class EvaluationAggregator {
  private readonly reachabilityEntropyMetric: ReachabilityEntropyMetric;

  private readonly gripEntropyMetric: GripEntropyMetric;

  private readonly momentumEntropyMetric: MomentumEntropyMetric;

  private readonly orientationEntropyMetric: OrientationEntropyMetric;

  private readonly flowInterpreter: FlowInterpreter;

  private readonly gripInterpreter: GripInterpreter;

  private readonly lookaheadInterpreter: LookaheadInterpreter;

  private readonly rotationBurdenInterpreter: RotationBurdenInterpreter;

  private readonly ergonomicsInterpreter: ErgonomicsInterpreter;

  constructor(
    reachabilityModel: ReachabilityModel
  ) {
    this.reachabilityEntropyMetric =
      new ReachabilityEntropyMetric(
        reachabilityModel
      );

    this.gripEntropyMetric =
      new GripEntropyMetric();

    this.momentumEntropyMetric =
      new MomentumEntropyMetric();

    this.orientationEntropyMetric =
      new OrientationEntropyMetric();

    this.flowInterpreter =
      new FlowInterpreter();

    this.gripInterpreter =
      new GripInterpreter();

    this.lookaheadInterpreter =
      new LookaheadInterpreter();

    this.rotationBurdenInterpreter =
      new RotationBurdenInterpreter();

    this.ergonomicsInterpreter =
      new ErgonomicsInterpreter();
  }

  evaluate(
    transitions: Transition[]
  ): EvaluationResult {
    // --------------------------------------------------
    // Entropy Layer
    // --------------------------------------------------

    const reachabilityEntropy =
      this.reachabilityEntropyMetric.evaluate(
        transitions
      );

    const gripEntropy =
      this.gripEntropyMetric.evaluate(
        transitions
      );

    const momentumEntropy =
      this.momentumEntropyMetric.evaluate(
        transitions
      );

    const orientationEntropy =
      this.orientationEntropyMetric.evaluate(
        transitions
      );

    // --------------------------------------------------
    // Interpretation Layer
    // --------------------------------------------------

    const flowScore =
      this.flowInterpreter.interpret(
        reachabilityEntropy,
        momentumEntropy
      );

    const gripScore =
      this.gripInterpreter.interpret(
        gripEntropy
      );

    const lookaheadScore =
      this.lookaheadInterpreter.interpret(
        reachabilityEntropy
      );

    const rotationScore =
      this.rotationBurdenInterpreter.interpret(
        orientationEntropy
      );

    // --------------------------------------------------
    // Ergonomics Layer
    // --------------------------------------------------

    const ergonomicsScore =
      this.ergonomicsInterpreter.interpret(
        flowScore,
        gripScore,
        rotationScore,
        lookaheadScore
      );

    // --------------------------------------------------
    // Result
    // --------------------------------------------------

    return {
      ergonomicsScore,

      flowScore,

      gripScore,

      rotationScore,

      lookaheadScore,

      reachabilityEntropy,

      gripEntropy,

      momentumEntropy,

      orientationEntropy,

      transitionCount:
        transitions.length,

      breakdown: {
        flow: flowScore,

        grip: gripScore,

        rotation: rotationScore,

        lookahead: lookaheadScore,
      },
    };
  }
}