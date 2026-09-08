import { aggregateScannerSamplesV1 } from "./scannerAggregationV1";
import { scannerPointToDisplayPointV1 } from "./scannerDisplayV1";
import {
  isScannerWorkerOutboundV1,
  type ScannerPointV1,
  type ScannerWorkerInboundV1,
  type ScannerWorkerOutboundV1,
} from "./scannerMessagesV1";
import {
  validateAndMapPoseCaptureV1,
  type CanonicalPoseCaptureV1,
  type RawPoseCaptureV1,
  type ScanPoseNumberV1,
} from "./scanPoseV1";
import type { CubeDraftTokenV1 } from "../ui/cubeDraftV1";

export const SCANNER_MODEL_V1 = Object.freeze({
  url: "/models/cube_pose.284726d2638cc8ba.onnx",
  sha256: "284726d2638cc8ba56dbcdb8b56109e26fcd362c689e5571c6e8b0846190af7e",
  bytes: 12_770_043,
});

export const SCANNER_RUNTIME_LIMITS_V1 = Object.freeze({
  minimumInferenceIntervalMs: 125,
  modelLoadTimeoutMs: 45_000,
  inferenceTimeoutMs: 2_000,
  cleanupReleaseBudgetMs: 750,
  samplesPerPose: 5,
});

export type ScannerRuntimeStatusV1 =
  | "PERMISSION"
  | "MODEL_LOADING"
  | "READY";

export type ScannerRuntimeFailureV1 =
  | "UNSUPPORTED_BROWSER"
  | "CAMERA_DENIED"
  | "CAMERA_FAILED"
  | "MODEL_LOAD_FAILED"
  | "MODEL_LOAD_TIMEOUT"
  | "INFERENCE_FAILED"
  | "INFERENCE_TIMEOUT"
  | "VISIBILITY_LOST";

export type ScannerRuntimeMetricsV1 = Readonly<{
  inferenceStarted: number;
  inferenceCompleted: number;
  busySkips: number;
  maximumConcurrentInference: number;
  inferenceDurationsMs: readonly number[];
  trackStopLatencyMs: number | null;
  cleanupDurationMs: number | null;
}>;

export type ScannerRuntimeCallbacksV1 = Readonly<{
  onStatus: (status: ScannerRuntimeStatusV1) => void;
  onFrame: (
    colors: readonly CubeDraftTokenV1[],
    points: readonly ScannerPointV1[]
  ) => void;
  onPoseProgress: (acceptedSamples: number, requiredSamples: number) => void;
  onPoseGuidance: (message: string) => void;
  onPoseAccepted: (
    pose: ScanPoseNumberV1,
    faces: CanonicalPoseCaptureV1<CubeDraftTokenV1>
  ) => void;
  onFailure: (failure: ScannerRuntimeFailureV1) => void;
  onMetrics?: (metrics: ScannerRuntimeMetricsV1) => void;
}>;

type RuntimeTimer = ReturnType<typeof globalThis.setTimeout>;

export class ScannerRuntimeV1 {
  private generation = 0;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private stream: MediaStream | null = null;
  private worker: Worker | null = null;
  private animationFrame: number | null = null;
  private modelTimer: RuntimeTimer | null = null;
  private inferenceTimer: RuntimeTimer | null = null;
  private modelReady = false;
  private inFlight = false;
  private activeRequestId = 0;
  private activePose: ScanPoseNumberV1 | null = null;
  private samples: readonly CubeDraftTokenV1[][] = [];
  private overlayColors: readonly CubeDraftTokenV1[] = [];
  private overlayPoints: readonly ScannerPointV1[] = [];
  private lastInferenceStart = -Infinity;
  private callbacks: ScannerRuntimeCallbacksV1 | null = null;
  private cleanupPromise: Promise<void> | null = null;
  private visibilityHandler: (() => void) | null = null;
  private pageHideHandler: (() => void) | null = null;
  private metrics = this.emptyMetrics();

  private emptyMetrics(): {
    inferenceStarted: number;
    inferenceCompleted: number;
    busySkips: number;
    maximumConcurrentInference: number;
    inferenceDurationsMs: number[];
    trackStopLatencyMs: number | null;
    cleanupDurationMs: number | null;
  } {
    return {
      inferenceStarted: 0,
      inferenceCompleted: 0,
      busySkips: 0,
      maximumConcurrentInference: 0,
      inferenceDurationsMs: [],
      trackStopLatencyMs: null,
      cleanupDurationMs: null,
    };
  }

  getMetrics(): ScannerRuntimeMetricsV1 {
    return Object.freeze({
      ...this.metrics,
      inferenceDurationsMs: Object.freeze([...this.metrics.inferenceDurationsMs]),
    });
  }

  async start(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    callbacks: ScannerRuntimeCallbacksV1
  ): Promise<void> {
    await this.cleanup();
    this.cleanupPromise = null;
    const generation = ++this.generation;
    this.video = video;
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.metrics = this.emptyMetrics();

    if (
      !globalThis.isSecureContext ||
      navigator.mediaDevices?.getUserMedia === undefined ||
      typeof Worker === "undefined" ||
      typeof createImageBitmap === "undefined" ||
      typeof OffscreenCanvas === "undefined"
    ) {
      this.fail(generation, "UNSUPPORTED_BROWSER");
      return;
    }

    this.attachLifecycleListeners(generation);
    callbacks.onStatus("PERMISSION");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
    } catch (error) {
      if (generation !== this.generation) return;
      const failure =
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "SecurityError")
          ? "CAMERA_DENIED"
          : "CAMERA_FAILED";
      this.fail(generation, failure);
      return;
    }

    if (generation !== this.generation) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }

    this.stream = stream;
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      this.fail(generation, "CAMERA_FAILED");
      return;
    }
    if (generation !== this.generation) return;

    callbacks.onStatus("MODEL_LOADING");
    let worker: Worker;
    try {
      worker = new Worker(new URL("./scannerWorkerV1.ts", import.meta.url), {
        type: "module",
        name: "hca-cube-scanner-v1",
      });
    } catch {
      this.fail(generation, "MODEL_LOAD_FAILED");
      return;
    }
    this.worker = worker;
    worker.addEventListener("message", this.handleWorkerMessage);
    worker.addEventListener("error", this.handleWorkerTransportError);
    this.modelTimer = globalThis.setTimeout(() => {
      this.fail(generation, "MODEL_LOAD_TIMEOUT");
    }, SCANNER_RUNTIME_LIMITS_V1.modelLoadTimeoutMs);
    const message: ScannerWorkerInboundV1 = {
      type: "LOAD_MODEL",
      generation,
      modelUrl: SCANNER_MODEL_V1.url,
    };
    try {
      worker.postMessage(message);
    } catch {
      this.fail(generation, "MODEL_LOAD_FAILED");
      return;
    }
    this.drawFrame(generation);
  }

  beginPose(pose: ScanPoseNumberV1): boolean {
    if (!this.modelReady || this.worker === null || this.activePose !== null) {
      return false;
    }
    this.activePose = pose;
    this.samples = [];
    this.callbacks?.onPoseProgress(0, SCANNER_RUNTIME_LIMITS_V1.samplesPerPose);
    return true;
  }

  private attachLifecycleListeners(generation: number): void {
    this.visibilityHandler = () => {
      if (document.visibilityState === "hidden") {
        this.fail(generation, "VISIBILITY_LOST");
      }
    };
    this.pageHideHandler = () => {
      void this.cleanup();
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);
    window.addEventListener("pagehide", this.pageHideHandler, { once: true });
  }

  private drawFrame = (generation: number): void => {
    if (generation !== this.generation || this.video === null || this.canvas === null) {
      return;
    }

    const video = this.video;
    const canvas = this.canvas;
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      const size = Math.min(video.videoWidth, video.videoHeight);
      const sourceX = (video.videoWidth - size) / 2;
      const sourceY = (video.videoHeight - size) / 2;
      if (canvas.width !== 640) canvas.width = 640;
      if (canvas.height !== 640) canvas.height = 640;
      const context = canvas.getContext("2d");
      context?.drawImage(video, sourceX, sourceY, size, size, 0, 0, 640, 640);
      if (context !== null) this.drawOverlay(context);

      if (this.modelReady && this.activePose !== null) {
        const now = performance.now();
        if (this.inFlight) {
          this.metrics.busySkips += 1;
        } else if (
          now - this.lastInferenceStart >=
          SCANNER_RUNTIME_LIMITS_V1.minimumInferenceIntervalMs
        ) {
          void this.startInference(generation, sourceX, sourceY, size);
        }
      }
    }

    this.animationFrame = requestAnimationFrame(() => this.drawFrame(generation));
  };

  private drawOverlay(context: CanvasRenderingContext2D): void {
    const colors: Readonly<Record<CubeDraftTokenV1, string>> = {
      U: "#ffffff",
      R: "#c83e3e",
      F: "#2f855a",
      D: "#f2c94c",
      L: "#dd7a16",
      B: "#2b6cb0",
      N: "#586775",
    };
    this.overlayPoints.forEach((point, index) => {
      const displayPoint = scannerPointToDisplayPointV1(point);
      context.beginPath();
      context.arc(
        displayPoint.x * 640,
        displayPoint.y * 640,
        7,
        0,
        Math.PI * 2
      );
      context.fillStyle = colors[this.overlayColors[index] ?? "N"];
      context.fill();
      context.lineWidth = 2;
      context.strokeStyle = "#17212b";
      context.stroke();
    });
  }

  private async startInference(
    generation: number,
    sourceX: number,
    sourceY: number,
    size: number
  ): Promise<void> {
    if (
      this.inFlight ||
      this.worker === null ||
      this.video === null ||
      this.activePose === null
    ) {
      return;
    }

    this.inFlight = true;
    this.lastInferenceStart = performance.now();
    this.metrics.inferenceStarted += 1;
    this.metrics.maximumConcurrentInference = Math.max(
      this.metrics.maximumConcurrentInference,
      this.inFlight ? 1 : 0
    );
    const requestId = ++this.activeRequestId;

    try {
      const bitmap = await createImageBitmap(
        this.video,
        sourceX,
        sourceY,
        size,
        size,
        { resizeWidth: 640, resizeHeight: 640, resizeQuality: "medium" }
      );
      if (
        generation !== this.generation ||
        this.worker === null ||
        this.activePose === null
      ) {
        bitmap.close();
        return;
      }

      const message: ScannerWorkerInboundV1 = {
        type: "INFER",
        generation,
        requestId,
        bitmap,
      };
      this.inferenceTimer = globalThis.setTimeout(() => {
        this.fail(generation, "INFERENCE_TIMEOUT");
      }, SCANNER_RUNTIME_LIMITS_V1.inferenceTimeoutMs);
      this.worker.postMessage(message, [bitmap]);
    } catch {
      if (generation === this.generation) {
        this.inFlight = false;
        this.fail(generation, "INFERENCE_FAILED");
      }
    }
  }

  private handleWorkerMessage = (event: MessageEvent<unknown>): void => {
    if (!isScannerWorkerOutboundV1(event.data)) return;
    const message: ScannerWorkerOutboundV1 = event.data;
    if (message.generation !== this.generation) return;

    if (message.type === "MODEL_READY") {
      this.clearModelTimer();
      this.modelReady = true;
      this.callbacks?.onStatus("READY");
      return;
    }
    if (message.type === "WORKER_ERROR") {
      this.fail(
        message.generation,
        message.code === "MODEL_LOAD_FAILED"
          ? "MODEL_LOAD_FAILED"
          : "INFERENCE_FAILED"
      );
      return;
    }
    if (message.type === "DISPOSED") return;
    if (message.requestId !== this.activeRequestId) return;
    if (message.durationMs > SCANNER_RUNTIME_LIMITS_V1.inferenceTimeoutMs) {
      this.fail(message.generation, "INFERENCE_TIMEOUT");
      return;
    }

    this.clearInferenceTimer();
    this.inFlight = false;
    this.metrics.inferenceCompleted += 1;
    this.metrics.inferenceDurationsMs.push(message.durationMs);
    if (message.type === "NO_DETECTION" || this.activePose === null) return;

    this.callbacks?.onFrame(message.colors, message.points);
    this.overlayColors = message.colors;
    this.overlayPoints = message.points;
    this.samples = [...this.samples, [...message.colors]];
    this.callbacks?.onPoseProgress(
      this.samples.length,
      SCANNER_RUNTIME_LIMITS_V1.samplesPerPose
    );
    if (this.samples.length < SCANNER_RUNTIME_LIMITS_V1.samplesPerPose) return;

    const aggregated = aggregateScannerSamplesV1(this.samples);
    const raw: RawPoseCaptureV1<CubeDraftTokenV1> = Object.freeze({
      top: Object.freeze(aggregated.slice(0, 9)),
      left: Object.freeze(aggregated.slice(9, 18)),
      right: Object.freeze(aggregated.slice(18, 27)),
    });
    const pose = this.activePose;
    const mapped = validateAndMapPoseCaptureV1(pose, raw);
    if (!mapped.ok) {
      this.samples = [];
      this.callbacks?.onPoseProgress(0, SCANNER_RUNTIME_LIMITS_V1.samplesPerPose);
      this.callbacks?.onPoseGuidance(mapped.reason);
      return;
    }

    this.activePose = null;
    this.samples = [];
    this.overlayColors = [];
    this.overlayPoints = [];
    this.callbacks?.onPoseAccepted(pose, mapped.faces);
  };

  private handleWorkerTransportError = (event: Event): void => {
    if (event.currentTarget !== this.worker) return;
    this.fail(this.generation, "INFERENCE_FAILED");
  };

  private fail(generation: number, failure: ScannerRuntimeFailureV1): void {
    if (generation !== this.generation) return;
    this.callbacks?.onFailure(failure);
    void this.cleanup();
  }

  private clearModelTimer(): void {
    if (this.modelTimer !== null) globalThis.clearTimeout(this.modelTimer);
    this.modelTimer = null;
  }

  private clearInferenceTimer(): void {
    if (this.inferenceTimer !== null) globalThis.clearTimeout(this.inferenceTimer);
    this.inferenceTimer = null;
  }

  cleanup(): Promise<void> {
    if (this.cleanupPromise !== null) return this.cleanupPromise;
    const startedAt = performance.now();
    const disposedGeneration = this.generation;
    this.generation += 1;
    this.activePose = null;
    this.samples = [];
    this.overlayColors = [];
    this.overlayPoints = [];
    this.modelReady = false;
    this.inFlight = false;
    this.clearModelTimer();
    this.clearInferenceTimer();

    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    if (this.visibilityHandler !== null) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
    }
    if (this.pageHideHandler !== null) {
      window.removeEventListener("pagehide", this.pageHideHandler);
    }
    this.visibilityHandler = null;
    this.pageHideHandler = null;

    const stream = this.stream;
    this.stream = null;
    const stopStartedAt = performance.now();
    if (stream !== null) {
      for (const track of stream.getTracks()) track.stop();
    }
    this.metrics.trackStopLatencyMs = performance.now() - stopStartedAt;
    if (this.video !== null) this.video.srcObject = null;
    this.video = null;
    this.canvas = null;

    const worker = this.worker;
    this.worker = null;
    this.cleanupPromise = new Promise<void>((resolve) => {
      if (worker === null) {
        resolve();
        return;
      }

      let settled = false;
      let releaseTimer: RuntimeTimer | null = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (releaseTimer !== null) globalThis.clearTimeout(releaseTimer);
        worker.removeEventListener("message", onDisposed);
        worker.removeEventListener("message", this.handleWorkerMessage);
        worker.removeEventListener("error", this.handleWorkerTransportError);
        worker.terminate();
        resolve();
      };
      const onDisposed = (event: MessageEvent<unknown>) => {
        if (
          isScannerWorkerOutboundV1(event.data) &&
          event.data.type === "DISPOSED" &&
          event.data.generation === disposedGeneration
        ) {
          finish();
        }
      };
      worker.addEventListener("message", onDisposed);
      const message: ScannerWorkerInboundV1 = {
        type: "DISPOSE",
        generation: disposedGeneration,
      };
      releaseTimer = globalThis.setTimeout(
        finish,
        SCANNER_RUNTIME_LIMITS_V1.cleanupReleaseBudgetMs
      );
      try {
        worker.postMessage(message);
      } catch {
        finish();
      }
    }).finally(() => {
      this.metrics.cleanupDurationMs = performance.now() - startedAt;
      this.callbacks?.onMetrics?.(this.getMetrics());
    });

    return this.cleanupPromise;
  }
}
