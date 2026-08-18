import { ErgonomicsInterpreter } from "../interpretation/ErgonomicsInterpreter";

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
  ): number {
    return this.ergonomicsInterpreter.interpret(
      flowScore,
      gripScore,
      rotationScore,
      lookaheadScore
    );
  }
}
