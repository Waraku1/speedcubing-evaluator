export type CubeJsWorkerRequestV1 = {
  type: "SOLVE";
  jobId: string;
  facelets: string;
};

export type CubeJsWorkerResponseV1 =
  | { type: "READY" }
  | { type: "INIT_FAILED" }
  | { type: "SOLVED"; jobId: string; solution: unknown }
  | { type: "FAILED"; jobId: string };

export type CubeJsWorkerDataV1 = {
  expectedVersion: "1.3.2";
};

/**
 * A self-contained CommonJS worker is used deliberately: Node executes a real
 * worker thread while Next can keep cubejs external instead of attempting to
 * execute an unpackaged TypeScript worker path at runtime.
 */
export const CUBE_JS_SOLVER_WORKER_SOURCE_V1 = String.raw`
"use strict";
const { parentPort, workerData } = require("node:worker_threads");

if (!parentPort) {
  throw new Error("worker port unavailable");
}

let Cube = null;

try {
  const packageMetadata = require("cubejs/package.json");
  if (packageMetadata.version !== workerData.expectedVersion) {
    throw new Error("cubejs version mismatch");
  }
  Cube = require("cubejs");
  Cube.initSolver();
  parentPort.postMessage({ type: "READY" });
} catch {
  parentPort.postMessage({ type: "INIT_FAILED" });
}

parentPort.on("message", (request) => {
  if (!Cube || !request || request.type !== "SOLVE") {
    return;
  }

  try {
    const solution = Cube.fromString(request.facelets).solve();
    parentPort.postMessage({
      type: "SOLVED",
      jobId: request.jobId,
      solution,
    });
  } catch {
    parentPort.postMessage({
      type: "FAILED",
      jobId: request.jobId,
    });
  }
});
`;
