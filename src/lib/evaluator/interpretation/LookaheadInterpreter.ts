export class LookaheadInterpreter {
  interpret(
    reachabilityEntropy: number
  ): number {
    return (
      1 /
      (1 + reachabilityEntropy)
    );
  }
}