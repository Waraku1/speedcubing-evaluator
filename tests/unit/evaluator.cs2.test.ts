import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { EvaluationProducer } from "../../src/lib/evaluator/evaluation/EvaluationProducer";
import { PrototypeEvaluatorPipeline } from "../../src/lib/evaluator/prototype/PrototypeEvaluatorPipeline";

import { ErgonomicsInterpreter } from "../../src/lib/evaluator/interpretation/ErgonomicsInterpreter";
import { FlowInterpreter } from "../../src/lib/evaluator/interpretation/FlowInterpreter";
import { GripInterpreter } from "../../src/lib/evaluator/interpretation/GripInterpreter";
import { LookaheadInterpreter } from "../../src/lib/evaluator/interpretation/LookaheadInterpreter";
import { RotationBurdenInterpreter } from "../../src/lib/evaluator/interpretation/RotationBurdenInterpreter";

import { ReachabilityEntropyMetric } from "../../src/lib/evaluator/metrics/ReachabilityEntropyMetric";
import { GripEntropyMetric } from "../../src/lib/evaluator/metrics/entropy/GripEntropyMetric";
import { MomentumEntropyMetric } from "../../src/lib/evaluator/metrics/entropy/MomentumEntropyMetric";
import { OrientationEntropyMetric } from "../../src/lib/evaluator/metrics/entropy/OrientationEntropyMetric";

import type { ReachabilityModel } from "../../src/lib/evaluator/state-space/ReachabilityModel";
import type { HumanState } from "../../src/lib/evaluator/state/HumanState";
import type { Transition } from "../../src/lib/evaluator/transition/Transition";
import type { EvaluatorPipelineResult } from "../../src/lib/evaluator/pipeline/EvaluatorPipelineResult";

function createHumanState(seed: number): HumanState {
  return {
    orientation: {
      x: seed * 0.1,
      y: seed * 0.2,
      z: seed * 0.3,
      certainty: 1 - seed * 0.1,
    },
    grip: {
      leftContactCount: seed + 1,
      rightContactCount: seed + 2,
      leftStabilizing: seed % 2 === 0,
      rightStabilizing: seed % 2 !== 0,
    },
    fingers: {
      available: {
        L_THUMB: true,
        L_INDEX: seed % 2 === 0,
        L_MIDDLE: true,
        R_THUMB: true,
        R_INDEX: seed % 2 !== 0,
        R_MIDDLE: true,
      },
      fatigue: {
        L_THUMB: 0,
        L_INDEX: seed * 0.1,
        L_MIDDLE: 0,
        R_THUMB: 0,
        R_INDEX: seed * 0.1,
        R_MIDDLE: 0,
      },
      coordination: 1 - seed * 0.1,
    },
    momentum: {
      continuity: seed * 0.2,
      velocity: seed * 0.3,
    },
  };
}

function createTransitions(): Transition[] {
  const initial = createHumanState(0);
  const first = createHumanState(1);
  const secondState = createHumanState(2);
  const second: HumanState = {
    ...secondState,
    orientation: {
      ...first.orientation,
    },
  };
  const final = createHumanState(3);

  return [
    {
      before: initial,
      move: "R",
      after: first,
    },
    {
      before: first,
      move: "U",
      after: second,
    },
    {
      before: second,
      move: "F",
      after: final,
    },
  ];
}

function createReachabilityModel(): ReachabilityModel {
  return {
    getCandidates: () => [
      {
        move: "R",
        feasibility: 0.75,
      },
      {
        move: "U",
        feasibility: 0.25,
      },
    ],
  };
}

function evaluateWithExistingStages(
  transitions: Transition[],
  reachabilityModel: ReachabilityModel
): EvaluatorPipelineResult {
  const reachabilityEntropy =
    new ReachabilityEntropyMetric(
      reachabilityModel
    ).evaluate(transitions);

  const gripEntropy =
    new GripEntropyMetric().evaluate(
      transitions
    );

  const momentumEntropy =
    new MomentumEntropyMetric().evaluate(
      transitions
    );

  const orientationEntropy =
    new OrientationEntropyMetric().evaluate(
      transitions
    );

  const flowScore =
    new FlowInterpreter().interpret(
      reachabilityEntropy,
      momentumEntropy
    );

  const gripScore =
    new GripInterpreter().interpret(
      gripEntropy
    );

  const lookaheadScore =
    new LookaheadInterpreter().interpret(
      reachabilityEntropy
    );

  const rotationScore =
    new RotationBurdenInterpreter().interpret(
      orientationEntropy
    );

  const evaluation = {
    ergonomicsScore:
      new ErgonomicsInterpreter().interpret(
        flowScore,
        gripScore,
        rotationScore,
        lookaheadScore
      ),
  };

  return {
    evaluation,
    evidence: {
      flowScore,
      gripScore,
      rotationScore,
      lookaheadScore,
      reachabilityEntropy,
      gripEntropy,
      momentumEntropy,
      orientationEntropy,
      transitionCount: transitions.length,
      breakdown: {
        flow: flowScore,
        grip: gripScore,
        rotation: rotationScore,
        lookahead: lookaheadScore,
      },
    },
  };
}

describe("CS-2 evaluation responsibility separation", () => {
  it.each([
    [1, 1, 0, 1],
    [0.8, 0.6, 0.2, 0.75],
    [0.25, 0.5, 0.9, 0.4],
    [0, 1, 0.5, 1],
  ])(
    "preserves ErgonomicsInterpreter synthesis for Interpretation outputs",
    (
      flowScore,
      gripScore,
      rotationScore,
      lookaheadScore
    ) => {
      const producer =
        new EvaluationProducer();

      const interpreter =
        new ErgonomicsInterpreter();

      expect(
        producer.evaluate(
          flowScore,
          gripScore,
          rotationScore,
          lookaheadScore
        ).ergonomicsScore
      ).toBe(
        interpreter.interpret(
          flowScore,
          gripScore,
          rotationScore,
          lookaheadScore
        )
      );
    }
  );

  it("keeps EvaluationProducer free of upstream stage dependencies", () => {
    const producerSource = readFileSync(
      path.resolve(
        process.cwd(),
        "src/lib/evaluator/evaluation/EvaluationProducer.ts"
      ),
      "utf8"
    );

    const forbiddenReferences = [
      /Transition/,
      /HumanState/,
      /Demand/,
      /Entropy/,
      /ReachabilityModel/,
      /state-space/,
      /physics/,
      /pipeline/,
      /evidence/,
    ];

    for (const reference of forbiddenReferences) {
      expect(producerSource).not.toMatch(
        reference
      );
    }
  });

  it("preserves the existing orchestration result", () => {
    const transitions = createTransitions();
    const reachabilityModel =
      createReachabilityModel();

    const pipeline =
      new PrototypeEvaluatorPipeline(
        reachabilityModel
      );

    expect(
      pipeline.evaluate(transitions)
    ).toEqual(
      evaluateWithExistingStages(
        transitions,
        reachabilityModel
      )
    );
  });
});
