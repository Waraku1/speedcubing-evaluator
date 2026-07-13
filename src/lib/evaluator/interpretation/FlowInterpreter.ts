export class FlowInterpreter {
  interpret(
    reachabilityEntropy: number,
    momentumEntropy: number
  ): number {
    const continuity =
      1 /
      (1 + momentumEntropy);

    return (
      reachabilityEntropy *
      continuity
    );
  }
}