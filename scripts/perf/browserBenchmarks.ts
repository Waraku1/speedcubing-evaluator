import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

import { chromium, devices, type Page, type Response } from "@playwright/test";

import { SCANNER_MODEL_V1 } from "../../src/lib/detect/scannerRuntimeV1";
import { PERFORMANCE_BUDGETS, type EvidenceClass, type PerfMeasurement, type PerfResource } from "./contracts";
import type { PerfArgs } from "./args";
import { createMeasurement, exitCodeFor, localEnvironment, printSummary, writeEvidence } from "./evidence";
import { aggregateResources, forbiddenRootResources, normalizeResource } from "./resources";
import { percentile } from "./statistics";

type ScannerInstrumentation = {
  workers: number;
  tracks: number;
  workerStarts: number[];
  inferenceStarts: number[];
  inferenceDurations: number[];
  concurrentInference: number;
  maximumConcurrentInference: number;
  trackStops: number[];
};

async function installScannerInstrumentation(page: Page, mockCamera: boolean): Promise<void> {
  if (mockCamera) {
    await page.addInitScript({ content: String.raw`
      window.__perfScanner = {
        workers: 0,
        tracks: 0,
        workerStarts: [],
        inferenceStarts: [],
        inferenceDurations: [],
        concurrentInference: 0,
        maximumConcurrentInference: 0,
        trackStops: []
      };
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async function () {
            const stream = new MediaStream();
            const track = { stop: function () {} };
            Object.defineProperty(stream, "getTracks", {
              configurable: true,
              value: function () { return [track]; }
            });
            return stream;
          }
        }
      });
      Object.defineProperty(HTMLMediaElement.prototype, "play", {
        configurable: true,
        value: async function () {}
      });
    ` });
  } else {
    await page.addInitScript({ content: String.raw`
      const evidence = {
        workers: 0,
        tracks: 0,
        workerStarts: [],
        inferenceStarts: [],
        inferenceDurations: [],
        concurrentInference: 0,
        maximumConcurrentInference: 0,
        trackStops: []
      };
      window.__perfScanner = evidence;
      const nativeGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: async function (constraints) {
          const stream = await nativeGetUserMedia(constraints);
          const tracks = stream.getTracks();
          evidence.tracks += tracks.length;
          for (const track of tracks) {
            const nativeStop = track.stop.bind(track);
            let stopped = false;
            track.stop = function () {
              if (!stopped) {
                stopped = true;
                evidence.tracks -= 1;
                evidence.trackStops.push(performance.now());
              }
              nativeStop();
            };
          }
          return stream;
        }
      });
      const NativeWorker = window.Worker;
      Object.defineProperty(window, "Worker", {
        configurable: true,
        value: new Proxy(NativeWorker, {
          construct: function (target, argumentsList) {
            const worker = Reflect.construct(target, argumentsList);
            evidence.workers += 1;
            evidence.workerStarts.push(performance.now());
            const nativeTerminate = worker.terminate.bind(worker);
            const inference = new Map<number, number>();
            const nativePostMessage = worker.postMessage.bind(worker);
            worker.terminate = function () {
              evidence.workers = Math.max(0, evidence.workers - 1);
              nativeTerminate();
            };
            worker.postMessage = function (message, transfer) {
              if (typeof message === "object" && message !== null && "type" in message && message.type === "INFER") {
                const requestId = "requestId" in message && typeof message.requestId === "number" ? message.requestId : -1;
                const started = performance.now();
                inference.set(requestId, started);
                evidence.inferenceStarts.push(started);
                evidence.concurrentInference += 1;
                evidence.maximumConcurrentInference = Math.max(evidence.maximumConcurrentInference, evidence.concurrentInference);
              }
              nativePostMessage(message, transfer ?? []);
            };
            worker.addEventListener("message", function (event) {
              const message = event.data;
              if (typeof message !== "object" || message === null || !("requestId" in message)) return;
              const requestId = typeof message.requestId === "number" ? message.requestId : -1;
              const started = inference.get(requestId);
              if (started === undefined) return;
              inference.delete(requestId);
              evidence.concurrentInference -= 1;
              evidence.inferenceDurations.push(performance.now() - started);
            });
            return worker;
          }
        }),
      });
    ` });
  }
}

async function observedResources(responses: readonly Response[]): Promise<PerfResource[]> {
  return Promise.all(responses.map(async (response) => {
    const request = response.request();
    const [sizes, body] = await Promise.all([
      request.sizes(),
      response.body().catch(() => Buffer.alloc(0)),
    ]);
    return normalizeResource({
      url: response.url(),
      resourceType: request.resourceType(),
      encodedBytes: Math.max(0, sizes.responseBodySize),
      decodedBytes: body.byteLength,
      transferBytes: Math.max(0, sizes.responseBodySize + sizes.responseHeadersSize),
      responseBody: request.resourceType() === "script" ? body.toString("utf8") : undefined,
    });
  }));
}

function responsesFor(page: Page): { responses: Response[]; pending: Promise<void>[] } {
  const responses: Response[] = [];
  const pending: Promise<void>[] = [];
  page.on("response", (response) => {
    if (!response.url().startsWith("http")) return;
    responses.push(response);
    pending.push(response.finished().then(() => undefined, () => undefined));
  });
  return { responses, pending };
}

function p95(samples: readonly number[]): number {
  return percentile(samples, 95);
}

export function maxStartsInOneSecond(timestamps: readonly number[]): number {
  let maximum = 0;
  let left = 0;
  for (let right = 0; right < timestamps.length; right += 1) {
    while (timestamps[right] - timestamps[left] >= 1_000) left += 1;
    maximum = Math.max(maximum, right - left + 1);
  }
  return maximum;
}

type ScannerSessionObservation = Readonly<{
  coldReadyMs: number;
  coldFetchMs: number;
  warmReadyMs: number;
  coldEncodedBytes: number;
  forbiddenBeforeStart: number;
  cleanupMs: number;
  trackEndMs: number;
  pendingResources: number;
  browserBaselineBytes: number;
  browserPeakBytes: number;
  browserSettledBytes: number;
  resources: readonly PerfResource[];
  instrumentation: ScannerInstrumentation;
}>;

async function measureScannerSession(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  baseUrl: string,
  physical: boolean
): Promise<ScannerSessionObservation> {
  const context = await browser.newContext({
    ...devices["Desktop Chrome"],
    ...(physical ? { permissions: ["camera"] } : {}),
  });
  const page = await context.newPage();
  try {
    await installScannerInstrumentation(page, !physical);
    const observed = responsesFor(page);
    await page.goto(`${baseUrl}/detect`, { waitUntil: "networkidle" });
    await Promise.all(observed.pending);
    const beforeStartResources = await observedResources(observed.responses);
    const forbiddenBeforeStart = beforeStartResources.filter((resource) =>
      resource.category === "ONNX_MODEL" || resource.category === "ORT_WASM"
    ).length;
    const browserBaselineBytes = await page.evaluate(() =>
      (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0
    );
    const afterStartIndex = observed.responses.length;
    const browserStartedAt = await page.evaluate(() => performance.now());
    const coldStart = performance.now();
    await page.getByRole("button", { name: "Start camera" }).click();
    try {
      await Promise.race([
        page.getByRole("button", { name: "Capture pose 1" }).waitFor({ timeout: PERFORMANCE_BUDGETS.scannerHardDeadlineMs }),
        page.locator('[data-scanner-state="ERROR"]').waitFor({ timeout: PERFORMANCE_BUDGETS.scannerHardDeadlineMs }).then(() => {
          throw new Error("Scanner entered ERROR before ready.");
        }),
      ]);
    } catch (error) {
      const state = await page.locator("[data-scanner-state]").getAttribute("data-scanner-state");
      const status = await page.locator("[data-scanner-state]").innerText().catch(() => "unavailable");
      throw new Error(`Scanner ready collector failed in state ${state ?? "unknown"}: ${status.slice(0, 1_000)}`, { cause: error });
    }
    const coldReadyMs = performance.now() - coldStart;
    const heapAfterCold = await page.evaluate(() =>
      (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0
    );
    await Promise.all(observed.pending);
    const resources = await observedResources(observed.responses.slice(afterStartIndex));
    const coldEncodedBytes = aggregateResources(resources).encodedBytes;
    const coldFetchMs = await page.evaluate((startedAt) => {
      const completed = performance.getEntriesByType("resource")
        .map((entry) => entry as PerformanceResourceTiming)
        .filter((entry) => entry.startTime >= startedAt && entry.name.startsWith("http"))
        .map((entry) => entry.responseEnd - startedAt);
      return completed.length > 0 ? Math.max(...completed) : 0;
    }, browserStartedAt);

    await page.getByRole("button", { name: "Cancel scan" }).click();
    await page.locator('[data-scanner-state="CANCELLED"]').waitFor();
    const warmStart = performance.now();
    await page.getByRole("button", { name: "Try camera again" }).click();
    await page.getByRole("button", { name: "Capture pose 1" }).waitFor({ timeout: PERFORMANCE_BUDGETS.scannerHardDeadlineMs });
    const warmReadyMs = performance.now() - warmStart;
    const heapAfterWarm = await page.evaluate(() =>
      (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0
    );

    const browserCleanupStartedAt = await page.evaluate(() => performance.now());
    const cleanupStart = performance.now();
    await page.getByRole("button", { name: "Cancel scan" }).click();
    await page.locator('[data-scanner-state="CANCELLED"]').waitFor();
    await page.waitForFunction(() => {
      const evidence = (window as typeof window & { __perfScanner: ScannerInstrumentation }).__perfScanner;
      return evidence.tracks === 0;
    }, undefined, { timeout: PERFORMANCE_BUDGETS.resourceSettlementMs });
    const cleanupMs = performance.now() - cleanupStart;
    const instrumentation = await page.evaluate(() =>
      (window as typeof window & { __perfScanner: ScannerInstrumentation }).__perfScanner
    );
    const trackEndMs = instrumentation.trackStops.length > 0
      ? Math.max(...instrumentation.trackStops) - browserCleanupStartedAt
      : 0;
    const browserSettledBytes = await page.evaluate(() =>
      (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0
    );
    const pendingResources = page.workers().length + instrumentation.workers + instrumentation.tracks;
    return {
      coldReadyMs,
      coldFetchMs,
      warmReadyMs,
      coldEncodedBytes,
      forbiddenBeforeStart,
      cleanupMs,
      trackEndMs,
      pendingResources,
      browserBaselineBytes,
      browserPeakBytes: Math.max(browserBaselineBytes, heapAfterCold, heapAfterWarm, browserSettledBytes),
      browserSettledBytes,
      resources,
      instrumentation,
    };
  } finally {
    await context.close();
  }
}

export async function runBundleBenchmark(args: PerfArgs): Promise<number> {
  const baseUrl = args.baseUrl ?? "http://127.0.0.1:3000";
  const browser = await chromium.launch({
    headless: !args.physical,
    args: ["--enable-precise-memory-info"],
  });
  const rootEncoded: number[] = [];
  const rootDecoded: number[] = [];
  const forbiddenCounts: number[] = [];
  const rootResources: PerfResource[] = [];
  const rootSessions = args.sessions ?? 20;
  try {
    for (let session = 0; session < rootSessions; session += 1) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const observed = responsesFor(page);
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await page.locator('a[href="/detect"]').hover();
      await page.getByRole("button", { name: "Load solved example" }).click();
      await page.waitForLoadState("networkidle");
      await Promise.all(observed.pending);
      const resources = await observedResources(observed.responses);
      const scripts = aggregateResources(resources, (resource) =>
        resource.resourceType === "script" && resource.url.includes("/_next/static/chunks/")
      );
      rootEncoded.push(scripts.encodedBytes);
      rootDecoded.push(scripts.decodedBytes);
      forbiddenCounts.push(forbiddenRootResources(resources).length);
      rootResources.push(...resources);
      await context.close();
    }

    const scannerSessionCount = args.physical ? args.sessions ?? 20 : 1;
    const scannerSessions: ScannerSessionObservation[] = [];
    for (let session = 0; session < scannerSessionCount; session += 1) {
      scannerSessions.push(await measureScannerSession(browser, baseUrl, args.physical));
    }
    const coldReady = scannerSessions.map((session) => session.coldReadyMs);
    const coldFetch = scannerSessions.map((session) => session.coldFetchMs);
    const warmReady = scannerSessions.map((session) => session.warmReadyMs);
    const coldEncoded = scannerSessions.map((session) => session.coldEncodedBytes);
    const cleanupDuration = scannerSessions.map((session) => session.cleanupMs);
    const trackEndDuration = scannerSessions.map((session) => session.trackEndMs);
    const pendingResources = scannerSessions.map((session) => session.pendingResources);
    const browserPeakBytes = scannerSessions.map((session) => session.browserPeakBytes);
    const browserSettledDeltaBytes = scannerSessions.map((session) =>
      Math.max(0, session.browserSettledBytes - session.browserBaselineBytes)
    );
    const coldResources = scannerSessions.flatMap((session) => session.resources);
    const forbiddenBeforeStart = scannerSessions.reduce((total, session) => total + session.forbiddenBeforeStart, 0);
    const maximumInferenceConcurrent = scannerSessions.map((session) => session.instrumentation.maximumConcurrentInference);
    const inferenceStartsPerSecond = scannerSessions.map((session) =>
      maxStartsInOneSecond(session.instrumentation.inferenceStarts)
    );
    const inferenceDurations = scannerSessions.flatMap((session) => session.instrumentation.inferenceDurations);

    const modelPath = path.join(process.cwd(), "public", SCANNER_MODEL_V1.url);
    const modelBytes = statSync(modelPath).size;
    const modelSha256 = createHash("sha256").update(readFileSync(modelPath)).digest("hex");
    const evidenceClass: EvidenceClass = args.physical ? "PHYSICAL_DEVICE" : "LOCAL_BASELINE";
    const physicalDecision = "HARNESS_READY_PHYSICAL_DEVICE_REQUIRED" as const;
    const measurements: PerfMeasurement[] = [
      createMeasurement({
        measurementId: "root-js-encoded",
        pbGateId: "PB-04",
        scenario: `${rootSessions} cold root loads, hover scanner link, ordinary manual edit flow`,
        rawSamples: rootEncoded,
        units: "bytes",
        threshold: [{ metric: "encoded max", operator: "<=", limit: PERFORMANCE_BUDGETS.rootJsEncodedBytes, observed: Math.max(...rootEncoded), unit: "bytes" }],
        resources: rootResources,
        notes: ["Resources are actual browser fetches, not files merely present in build output."],
      }),
      createMeasurement({
        measurementId: "root-js-decoded",
        pbGateId: "PB-04",
        scenario: `${rootSessions} cold root loads, decoded response bodies`,
        rawSamples: rootDecoded,
        units: "bytes",
        threshold: [{ metric: "decoded max", operator: "<=", limit: PERFORMANCE_BUDGETS.rootJsDecodedBytes, observed: Math.max(...rootDecoded), unit: "bytes" }],
      }),
      createMeasurement({
        measurementId: "root-forbidden-resources",
        pbGateId: "PB-05",
        scenario: "root load plus hover plus ordinary manual workbench flow",
        rawSamples: forbiddenCounts,
        units: "count",
        threshold: [{ metric: "forbidden requests", operator: "==", limit: 0, observed: Math.max(...forbiddenCounts), unit: "count" }],
        resources: forbiddenRootResources(rootResources),
      }),
      createMeasurement({
        measurementId: "scanner-model-asset",
        pbGateId: "PB-08",
        scenario: "canonical artifact model file identity",
        rawSamples: [modelBytes],
        units: "bytes",
        failures: modelBytes === SCANNER_MODEL_V1.bytes && modelSha256 === SCANNER_MODEL_V1.sha256 ? [] : [{ code: "MODEL_IDENTITY_MISMATCH" }],
        threshold: [{ metric: "model bytes", operator: "<=", limit: PERFORMANCE_BUDGETS.modelBytes, observed: modelBytes, unit: "bytes" }],
        notes: [`model=${SCANNER_MODEL_V1.url}; sha256=${modelSha256}`],
      }),
      createMeasurement({
        measurementId: "scanner-cold-transfer",
        pbGateId: "PB-08",
        scenario: "actual cold browser transfers after explicit scanner Start",
        rawSamples: coldEncoded,
        units: "bytes",
        failures: forbiddenBeforeStart === 0 ? [] : [{ code: "SCANNER_RESOURCE_FETCHED_BEFORE_START" }],
        threshold: [{ metric: "cold scanner encoded max", operator: "<=", limit: PERFORMANCE_BUDGETS.scannerEncodedBytes, observed: Math.max(...coldEncoded), unit: "bytes" }],
        resources: coldResources,
        notes: [`before Start model/ORT requests=${forbiddenBeforeStart}`],
      }),
      createMeasurement({
        measurementId: "scanner-cold-fetch-collector",
        pbGateId: "PB-06",
        scenario: "scanner Start to completion of fetched scanner resources",
        rawSamples: coldFetch,
        units: "milliseconds",
        threshold: [{ metric: "fetch p95", operator: "<=", limit: PERFORMANCE_BUDGETS.scannerFetchP95Ms, observed: p95(coldFetch), unit: "milliseconds" }],
        decision: physicalDecision,
        notes: ["Resource Timing responseEnd values are recorded after explicit Start."],
      }),
      createMeasurement({
        measurementId: "scanner-cold-ready-collector",
        pbGateId: "PB-06",
        scenario: "scanner Start to real-worker model ready",
        rawSamples: coldReady,
        units: "milliseconds",
        threshold: [
          { metric: "ready p95", operator: "<=", limit: PERFORMANCE_BUDGETS.scannerReadyP95Ms, observed: p95(coldReady), unit: "milliseconds" },
          { metric: "hard deadline max", operator: "<=", limit: PERFORMANCE_BUDGETS.scannerHardDeadlineMs, observed: Math.max(...coldReady), unit: "milliseconds" },
        ],
        decision: physicalDecision,
        notes: [args.physical ? "Physical-device collector run." : "Local camera shim is collector smoke only; physical-device evidence is required."],
      }),
      createMeasurement({
        measurementId: "scanner-warm-ready-collector",
        pbGateId: "PB-07",
        scenario: "warm scanner ready collector",
        rawSamples: warmReady,
        units: "milliseconds",
        threshold: [{ metric: "warm ready p95", operator: "<=", limit: PERFORMANCE_BUDGETS.scannerWarmReadyP95Ms, observed: p95(warmReady), unit: "milliseconds" }],
        decision: physicalDecision,
        notes: ["Use --physical --sessions 20 on the accepted browser/device profile."],
      }),
      createMeasurement({
        measurementId: "scanner-inference-governor-collector",
        pbGateId: "PB-09",
        scenario: "Worker INFER postMessage concurrency and start timestamps",
        rawSamples: maximumInferenceConcurrent,
        units: "count",
        threshold: [{ metric: "max concurrent inference", operator: "<=", limit: PERFORMANCE_BUDGETS.inferenceConcurrency, observed: Math.max(...maximumInferenceConcurrent), unit: "count" }],
        decision: physicalDecision,
        notes: ["Begin both poses on a physical device to populate inference rate evidence."],
      }),
      createMeasurement({
        measurementId: "scanner-track-end-collector",
        pbGateId: "PB-10",
        scenario: "Cancel interaction to final owned MediaStreamTrack.stop",
        rawSamples: trackEndDuration,
        units: "milliseconds",
        threshold: [{ metric: "tracks ended max", operator: "<=", limit: PERFORMANCE_BUDGETS.tracksEndedMs, observed: Math.max(...trackEndDuration), unit: "milliseconds" }],
        decision: physicalDecision,
        notes: ["The local camera shim does not count as physical track evidence."],
      }),
      createMeasurement({
        measurementId: "scanner-inference-rate-collector",
        pbGateId: "PB-09",
        scenario: "maximum Worker INFER starts in any rolling one-second window",
        rawSamples: inferenceStartsPerSecond,
        units: "count",
        threshold: [{ metric: "starts per second max", operator: "<=", limit: PERFORMANCE_BUDGETS.inferenceStartsPerSecond, observed: Math.max(...inferenceStartsPerSecond), unit: "count" }],
        decision: physicalDecision,
        notes: ["A complete two-pose physical scan is required to populate the final rate."],
      }),
      createMeasurement({
        measurementId: "scanner-cleanup-collector",
        pbGateId: "PB-10",
        scenario: "cancel-to-worker/track settlement instrumentation",
        rawSamples: cleanupDuration,
        units: "milliseconds",
        threshold: [{ metric: "complete cleanup max", operator: "<=", limit: PERFORMANCE_BUDGETS.cleanupMs, observed: Math.max(...cleanupDuration), unit: "milliseconds" }],
        decision: physicalDecision,
        notes: ["Local run uses a camera shim; final track timing requires a physical device."],
      }),
      createMeasurement({
        measurementId: "scanner-inference-latency-collector",
        pbGateId: "PB-11",
        scenario: "Worker INFER request/response duration collector",
        rawSamples: inferenceDurations,
        units: "milliseconds",
        threshold: inferenceDurations.length > 0 ? [
          { metric: "inference p95", operator: "<=", limit: PERFORMANCE_BUDGETS.inferenceP95Ms, observed: p95(inferenceDurations), unit: "milliseconds" },
          { metric: "unrecovered inference max", operator: "<=", limit: PERFORMANCE_BUDGETS.unrecoveredInferenceMs, observed: Math.max(...inferenceDurations), unit: "milliseconds" },
        ] : [],
        decision: physicalDecision,
        notes: ["A real physical scan is required to populate inference durations."],
      }),
      createMeasurement({
        measurementId: "browser-retention-collector",
        pbGateId: "PB-17",
        scenario: "browser used-JS-heap baseline, peak, and post-cleanup settlement collector",
        rawSamples: browserSettledDeltaBytes,
        units: "bytes",
        threshold: [
          { metric: "settled delta max", operator: "<=", limit: PERFORMANCE_BUDGETS.browserSettledDeltaBytes, observed: Math.max(...browserSettledDeltaBytes), unit: "bytes" },
          { metric: "peak max", operator: "<=", limit: PERFORMANCE_BUDGETS.browserPeakBytes, observed: Math.max(...browserPeakBytes), unit: "bytes" },
        ],
        decision: physicalDecision,
        notes: ["Run the documented 20-session physical profile with browser memory instrumentation."],
      }),
      createMeasurement({
        measurementId: "browser-resource-settlement",
        pbGateId: "PB-19",
        scenario: "real scanner worker and locally observable resources after Cancel",
        rawSamples: pendingResources,
        units: "count",
        threshold: [{ metric: "pending observable resources", operator: "==", limit: 0, observed: Math.max(...pendingResources), unit: "count" }],
        notes: ["Physical-device track evidence remains outside this local oracle."],
      }),
    ];
    const pathname = writeEvidence("bundle", localEnvironment(evidenceClass, {
      browser: "chromium",
      browserVersion: browser.version(),
      hostClass: args.physical ? "physical-device-browser" : "local-production-artifact",
    }), measurements, args.evidenceDirectory);
    printSummary(pathname, measurements);
    return exitCodeFor(measurements);
  } finally {
    await browser.close();
  }
}
