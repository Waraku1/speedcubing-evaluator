declare module "cubejs" {
  export type CubeJSON = {
    center: number[];
    cp: number[];
    co: number[];
    ep: number[];
    eo: number[];
  };

  export default class Cube {
    constructor(state?: CubeJSON);
    static initSolver(): void;
    static fromString(state: string): Cube;
    move(algorithm: string): Cube;
    solve(maxDepth?: number): string;
    asString(): string;
  }
}
