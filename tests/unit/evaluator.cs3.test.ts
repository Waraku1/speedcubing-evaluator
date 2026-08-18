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

import type { Evaluation } from "../../src/lib/evaluator/evaluation/Evaluation";
import type { EvaluationEvidence } from "../../src/lib/evaluator/evidence/EvaluationEvidence";
import type { ReachabilityModel } from "../../src/lib/evaluator/state-space/ReachabilityModel";
import type { HumanState } from "../../src/lib/evaluator/state/HumanState";
import type { Transition } from "../../src/lib/evaluator/transition/Transition";

function readEvaluatorSource(relativePath: string): string {
  return readFileSync(
    path.resolve(
      process.cwd(),
      "src/lib/evaluator",
      relativePath
    ),
    "utf8"
  );
}

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

function evaluateEvidenceWithExistingStages(
  transitions: Transition[],
  reachabilityModel: ReachabilityModel
): EvaluationEvidence {
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

  return {
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
  };
}

describe("CS-3 Evaluation and evidence separation", () => {
  it("keeps Evaluation limited to ergonomicsScore", () => {
    const semanticFieldContract:
      Record<keyof Evaluation, true> = {
        ergonomicsScore: true,
      };

    const evaluation: Evaluation =
      new EvaluationProducer().evaluate(
        0.8,
        0.6,
        0.2,
        0.75
      );

    expect(Object.keys(evaluation)).toEqual(
      Object.keys(semanticFieldContract)
    );
  });

  it.each([
    [1, 1, 0, 1],
    [0.8, 0.6, 0.2, 0.75],
    [0.25, 0.5, 0.9, 0.4],
    [0, 1, 0.5, 1],
  ])(
    "preserves the existing evaluation synthesis",
    (
      flowScore,
      gripScore,
      rotationScore,
      lookaheadScore
    ) => {
      const evaluation =
        new EvaluationProducer().evaluate(
          flowScore,
          gripScore,
          rotationScore,
          lookaheadScore
        );

      expect(
        evaluation.ergonomicsScore
      ).toBe(
        new ErgonomicsInterpreter().interpret(
          flowScore,
          gripScore,
          rotationScore,
          lookaheadScore
        )
      );
    }
  );

  it("preserves all existing non-Evaluation values as evidence", () => {
    const transitions = createTransitions();
    const reachabilityModel =
      createReachabilityModel();

    const result =
      new PrototypeEvaluatorPipeline(
        reachabilityModel
      ).evaluate(transitions);

    expect(result.evidence).toEqual(
      evaluateEvidenceWithExistingStages(
        transitions,
        reachabilityModel
      )
    );
  });

  it("keeps Evaluation and its producer free of upstream and evidence dependencies", () => {
    const evaluationSource =
      readEvaluatorSource(
        "evaluation/Evaluation.ts"
      );

    const producerSource =
      readEvaluatorSource(
        "evaluation/EvaluationProducer.ts"
      );

    const forbiddenReferences = [
      /EvaluationEvidence/,
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
      expect(evaluationSource).not.toMatch(
        reference
      );
      expect(producerSource).not.toMatch(
        reference
      );
    }
  });

  it("returns only the Evaluation and evidence envelope", () => {
    const result =
      new PrototypeEvaluatorPipeline(
        createReachabilityModel()
      ).evaluate(createTransitions());

    expect(
      Object.keys(result).sort()
    ).toEqual([
      "evaluation",
      "evidence",
    ]);

    expect(result).not.toHaveProperty(
      "ergonomicsScore"
    );
    expect(result).not.toHaveProperty(
      "flowScore"
    );
    expect(result).not.toHaveProperty(
      "reachabilityEntropy"
    );
  });
});
