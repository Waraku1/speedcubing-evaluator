import { ErgonomicsInterpreter } from "../interpretation/ErgonomicsInterpreter";

import { Evaluation } from "./Evaluation";

export class EvaluationProducer {
  private readonly ergonomicsInterpreter:
    ErgonomicsInterpreter;

  constructor() {
    this.ergonomicsInterpreter =
      new ErgonomicsInterpreter();
  }

  evaluate(
    flowScore: number,
    gripScore: number,
    rotationScore: number,
    lookaheadScore: number
  ): Evaluation {
    return {
      ergonomicsScore:
        this.ergonomicsInterpreter.interpret(
          flowScore,
          gripScore,
          rotationScore,
          lookaheadScore
        ),
    };
  }
}
