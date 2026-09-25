declare module "cubejs" {
  export default class Cube {
    static initSolver(): void;
    static fromString(value: string): Cube;
    solve(maxDepth?: number): string;
  }
}
