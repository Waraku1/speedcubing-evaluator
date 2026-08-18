import { Evaluation } from "../evaluation/Evaluation";
import { EvaluationEvidence } from "../evidence/EvaluationEvidence";

export type EvaluatorPipelineResult = {
  evaluation: Evaluation;
  evidence: EvaluationEvidence;
};
