export class GripInterpreter {
  interpret(
    gripEntropy: number
  ): number {
    return 1 / (
      1 + gripEntropy
    );
  }
}