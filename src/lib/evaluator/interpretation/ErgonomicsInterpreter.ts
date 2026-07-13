export class ErgonomicsInterpreter {
  interpret(
    flow: number,
    grip: number,
    rotation: number,
    lookahead: number
  ): number {
    return (
      flow *
      grip *
      (1 - rotation) *
      lookahead
    );
  }
}