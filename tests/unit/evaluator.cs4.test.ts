import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { TransitionDemandExtractor } from "../../src/lib/evaluator/demand/TransitionDemandExtractor";
import { EvaluatorPipeline } from "../../src/lib/evaluator/pipeline/EvaluatorPipeline";

import type { HumanState } from "../../src/lib/evaluator/state/HumanState";
import type { Transition } from "../../src/lib/evaluator/transition/Transition";

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
  const highDemand = createHumanState(3);
  const lowerDemand = createHumanState(2);

  return [
    {
      before: initial,
      move: "R",
      after: first,
    },
    {
      before: first,
      move: "U",
      after: highDemand,
    },
    {
      before: highDemand,
      move: "F",
      after: lowerDemand,
    },
  ];
}

function readCanonicalPipeline(): string {
  return readFileSync(
    path.resolve(
      process.cwd(),
      "src/lib/evaluator/pipeline/EvaluatorPipeline.ts"
    ),
    "utf8"
  );
}

describe("CS-4 canonical Demand boundary", () => {
  it("maps each Transition to exactly one DemandVector in input order", () => {
    const transitions = createTransitions();

    const demandField =
      new EvaluatorPipeline().advanceToDemand(
        transitions
      );

    const extractor =
      new TransitionDemandExtractor();

    expect(demandField.vectors).toHaveLength(
      transitions.length
    );

    expect(demandField.vectors).toEqual(
      transitions.map((transition) =>
        extractor.extract(transition)
      )
    );
  });

  it("delegates every Transition to TransitionDemandExtractor", () => {
    const transitions = createTransitions();

    const extract = vi.spyOn(
      TransitionDemandExtractor.prototype,
      "extract"
    );

    new EvaluatorPipeline().advanceToDemand(
      transitions
    );

    expect(extract).toHaveBeenCalledTimes(
      transitions.length
    );

    expect(
      extract.mock.calls.map(
        ([transition]) => transition
      )
    ).toEqual(transitions);

    extract.mockRestore();
  });

  it("depends only on Transition and the Domain Demand boundary", () => {
    const source = readCanonicalPipeline();

    expect(source).toContain(
      "../demand/TransitionDemandExtractor"
    );
    expect(source).toContain(
      "../demand/DemandField"
    );

    const forbiddenReferences = [
      /Entropy/,
      /metrics\/entropy/,
      /ReachabilityEntropyMetric/,
      /interpretation/,
      /Interpreter/,
      /EvaluationProducer/,
      /EvaluationEvidence/,
      /EvaluatorPipelineResult/,
      /ReachabilityModel/,
      /state-space/,
      /physics/,
      /prototype/,
      /legacy/,
    ];

    for (const reference of forbiddenReferences) {
      expect(source).not.toMatch(reference);
    }
  });

  it("exposes only the semantic advance to Demand", () => {
    const source = readCanonicalPipeline();

    expect(
      Object.getOwnPropertyNames(
        EvaluatorPipeline.prototype
      ).sort()
    ).toEqual([
      "advanceToDemand",
      "constructor",
    ]);

    expect(source).not.toMatch(
      /\bevaluate\s*\(/
    );
    expect(source).not.toMatch(/Entropy/);
    expect(source).not.toMatch(/Interpreter/);
    expect(source).not.toMatch(
      /EvaluationProducer/
    );
  });
});
