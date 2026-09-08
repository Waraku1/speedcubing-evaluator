/// <reference lib="webworker" />

import * as ort from "onnxruntime-web";
import { runScannerInferenceV1 } from "./visionOnnx";
import {
  isScannerWorkerInboundV1,
  type ScannerWorkerInboundV1,
  type ScannerWorkerOutboundV1,
} from "./scannerMessagesV1";

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
const canvas = new OffscreenCanvas(640, 640);
const context = canvas.getContext("2d", { willReadFrequently: true });
let session: ort.InferenceSession | null = null;
let activeGeneration = -1;
let queue = Promise.resolve();

function send(message: ScannerWorkerOutboundV1): void {
  workerScope.postMessage(message);
}

async function releaseSession(): Promise<void> {
  const current = session;
  session = null;
  if (current !== null) await current.release();
}

async function handleMessage(message: ScannerWorkerInboundV1): Promise<void> {
  if (message.type === "LOAD_MODEL") {
    activeGeneration = message.generation;
    try {
      await releaseSession();
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      const loaded = await ort.InferenceSession.create(message.modelUrl, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      if (activeGeneration !== message.generation) {
        await loaded.release();
        return;
      }
      session = loaded;
      send({ type: "MODEL_READY", generation: message.generation });
    } catch {
      if (activeGeneration === message.generation) {
        send({
          type: "WORKER_ERROR",
          generation: message.generation,
          code: "MODEL_LOAD_FAILED",
        });
      }
    }
    return;
  }

  if (message.type === "DISPOSE") {
    activeGeneration = -1;
    await releaseSession();
    send({ type: "DISPOSED", generation: message.generation });
    return;
  }

  const startedAt = performance.now();
  try {
    if (message.generation !== activeGeneration || session === null || context === null) {
      return;
    }
    const result = await runScannerInferenceV1(
      session,
      message.bitmap,
      canvas,
      context
    );
    if (message.generation !== activeGeneration) return;
    const durationMs = performance.now() - startedAt;
    if (result === null) {
      send({
        type: "NO_DETECTION",
        generation: message.generation,
        requestId: message.requestId,
        durationMs,
      });
    } else {
      send({
        type: "INFERENCE_RESULT",
        generation: message.generation,
        requestId: message.requestId,
        colors: result.colors,
        points: result.points,
        durationMs,
      });
    }
  } catch {
    if (message.generation === activeGeneration) {
      send({
        type: "WORKER_ERROR",
        generation: message.generation,
        code: "INFERENCE_FAILED",
      });
    }
  } finally {
    message.bitmap.close();
  }
}

workerScope.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (!isScannerWorkerInboundV1(event.data)) return;
  const message = event.data;
  queue = queue.then(() => handleMessage(message));
});
