import { expect, test, type Page, type Request } from "@playwright/test";

type ScannerEvidence = {
  getUserMediaCalls: number;
  workerConstructions: number;
  workerTerminations: number;
  activeWorkers: number;
  workerDisposals: number;
  trackStops: number;
  activeTracks: number;
  trackStopAt: number | null;
  bitmapCloses: number;
  inferenceConcurrent: number;
  maximumInferenceConcurrent: number;
  inferenceStarts: number[];
  lateInferenceResults: number;
  workerTerminationAt: number | null;
  storageWrites: number;
  storageWriteAt: number | null;
  navigationAt: number | null;
  activeScannerTimers: number;
  activeAnimationFrames: number;
  activeVisibilityListeners: number;
  activePageHideListeners: number;
  constraints: unknown;
};

type ScannerMockOptions = Readonly<{
  denyCamera?: boolean;
  delayDispose?: boolean;
  storageFailure?: boolean;
  workerMode?:
    | "success"
    | "hold-model"
    | "model-failure"
    | "hold-inference"
    | "inference-failure";
}>;

async function installScannerMocks(
  page: Page,
  options: ScannerMockOptions = {}
): Promise<void> {
  await page.addInitScript((mockOptions) => {
    const scannerWindow = window as typeof window & {
      __scannerEvidence: ScannerEvidence;
      __releaseScannerDispose(): void;
    };
    const evidence: ScannerEvidence = {
      getUserMediaCalls: 0,
      workerConstructions: 0,
      workerTerminations: 0,
      activeWorkers: 0,
      workerDisposals: 0,
      trackStops: 0,
      activeTracks: 0,
      trackStopAt: null,
      bitmapCloses: 0,
      inferenceConcurrent: 0,
      maximumInferenceConcurrent: 0,
      inferenceStarts: [],
      lateInferenceResults: 0,
      workerTerminationAt: null,
      storageWrites: 0,
      storageWriteAt: null,
      navigationAt: null,
      activeScannerTimers: 0,
      activeAnimationFrames: 0,
      activeVisibilityListeners: 0,
      activePageHideListeners: 0,
      constraints: null,
    };
    scannerWindow.__scannerEvidence = evidence;
    scannerWindow.__releaseScannerDispose = () => undefined;

    const handoffKey = "hca.scannerDraft.v1";
    const nativeStorageSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key === handoffKey) {
        evidence.storageWrites += 1;
        evidence.storageWriteAt = performance.now();
        if (mockOptions.storageFailure) {
          throw new DOMException("storage unavailable", "QuotaExceededError");
        }
      }
      nativeStorageSetItem.call(this, key, value);
    };

    const recordNavigation = (url: string | URL | null | undefined) => {
      if (url === null || url === undefined || location.pathname !== "/detect") return;
      if (new URL(String(url), location.href).pathname === "/") {
        evidence.navigationAt ??= performance.now();
      }
    };
    const nativePushState = History.prototype.pushState;
    History.prototype.pushState = function pushState(
      data: unknown,
      unused: string,
      url?: string | URL | null
    ) {
      recordNavigation(url);
      nativePushState.call(this, data, unused, url);
    };
    const nativeReplaceState = History.prototype.replaceState;
    History.prototype.replaceState = function replaceState(
      data: unknown,
      unused: string,
      url?: string | URL | null
    ) {
      recordNavigation(url);
      nativeReplaceState.call(this, data, unused, url);
    };

    const scannerTimerDelays = new Set([750, 2_000, 45_000]);
    const scannerTimers = new Set<number>();
    const nativeSetTimeout = window.setTimeout.bind(window);
    const nativeClearTimeout = window.clearTimeout.bind(window);
    Object.defineProperty(window, "setTimeout", {
      configurable: true,
      value: (handler: TimerHandler, timeout = 0, ...args: unknown[]) => {
        if (mockOptions.delayDispose && timeout === 750) {
          const heldTimer = 2_000_000_000 + scannerTimers.size;
          scannerTimers.add(heldTimer);
          evidence.activeScannerTimers = scannerTimers.size;
          return heldTimer;
        }
        let timer = 0;
        const wrappedHandler =
          typeof handler === "function"
            ? () => {
                if (scannerTimers.delete(timer)) {
                  evidence.activeScannerTimers = scannerTimers.size;
                }
                handler(...args);
              }
            : handler;
        timer = nativeSetTimeout(wrappedHandler, timeout);
        if (scannerTimerDelays.has(timeout)) {
          scannerTimers.add(timer);
          evidence.activeScannerTimers = scannerTimers.size;
        }
        return timer;
      },
    });
    Object.defineProperty(window, "clearTimeout", {
      configurable: true,
      value: (timer: number | undefined) => {
        if (timer !== undefined && scannerTimers.delete(timer)) {
          evidence.activeScannerTimers = scannerTimers.size;
        }
        nativeClearTimeout(timer);
      },
    });

    let trackAnimationFrames = false;
    const animationFrames = new Set<number>();
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        let frame = 0;
        frame = nativeRequestAnimationFrame((timestamp) => {
          if (animationFrames.delete(frame)) {
            evidence.activeAnimationFrames = animationFrames.size;
          }
          callback(timestamp);
        });
        if (trackAnimationFrames) {
          animationFrames.add(frame);
          evidence.activeAnimationFrames = animationFrames.size;
        }
        return frame;
      },
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: (frame: number) => {
        if (animationFrames.delete(frame)) {
          evidence.activeAnimationFrames = animationFrames.size;
        }
        nativeCancelAnimationFrame(frame);
      },
    });

    const visibilityListeners = new Set<EventListenerOrEventListenerObject>();
    const pageHideListeners = new Set<EventListenerOrEventListenerObject>();
    const nativeAddEventListener = EventTarget.prototype.addEventListener;
    const nativeRemoveEventListener = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions
    ) {
      if (listener !== null && this === document && type === "visibilitychange") {
        visibilityListeners.add(listener);
        evidence.activeVisibilityListeners = visibilityListeners.size;
      }
      if (listener !== null && this === window && type === "pagehide") {
        pageHideListeners.add(listener);
        evidence.activePageHideListeners = pageHideListeners.size;
      }
      nativeAddEventListener.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function removeEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | EventListenerOptions
    ) {
      if (listener !== null && this === document && type === "visibilitychange") {
        visibilityListeners.delete(listener);
        evidence.activeVisibilityListeners = visibilityListeners.size;
      }
      if (listener !== null && this === window && type === "pagehide") {
        pageHideListeners.delete(listener);
        evidence.activePageHideListeners = pageHideListeners.size;
      }
      nativeRemoveEventListener.call(this, type, listener, options);
    };

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        async getUserMedia(constraints: unknown) {
          evidence.getUserMediaCalls += 1;
          evidence.constraints = constraints;
          trackAnimationFrames = true;
          if (mockOptions.denyCamera) {
            throw new DOMException("denied", "NotAllowedError");
          }

          const stream = new MediaStream();
          evidence.activeTracks += 1;
          let stopped = false;
          const track = {
            stop() {
              if (stopped) return;
              stopped = true;
              evidence.trackStops += 1;
              evidence.activeTracks -= 1;
              evidence.trackStopAt = performance.now();
            },
          } as MediaStreamTrack;
          Object.defineProperty(stream, "getTracks", {
            configurable: true,
            value: () => [track],
          });
          return stream;
        },
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: async () => undefined,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
      configurable: true,
      get: () => 640,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
      configurable: true,
      get: () => 640,
    });
    Object.defineProperty(window, "createImageBitmap", {
      configurable: true,
      value: async () =>
        ({
          close() {
            evidence.bitmapCloses += 1;
          },
        }) as ImageBitmap,
    });
    if (!("OffscreenCanvas" in window)) {
      Object.defineProperty(window, "OffscreenCanvas", {
        configurable: true,
        value: class MockOffscreenCanvas {},
      });
    }

    class MockWorker {
      private readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();
      private inferenceCount = 0;
      private heldInference: {
        bitmap: ImageBitmap;
        generation: number;
        requestId: unknown;
      } | null = null;
      private terminated = false;

      constructor() {
        evidence.workerConstructions += 1;
        evidence.activeWorkers += 1;
      }

      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (type === "message") {
          this.listeners.add(listener as (event: MessageEvent<unknown>) => void);
        }
      }

      removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (type === "message") {
          this.listeners.delete(listener as (event: MessageEvent<unknown>) => void);
        }
      }

      private emit(data: unknown) {
        const event = new MessageEvent("message", { data });
        for (const listener of this.listeners) listener(event);
      }

      postMessage(value: unknown) {
        const message = value as Record<string, unknown>;
        const generation = message.generation as number;
        if (message.type === "LOAD_MODEL") {
          if (mockOptions.workerMode === "hold-model") return;
          nativeSetTimeout(() => {
            this.emit(
              mockOptions.workerMode === "model-failure"
                ? {
                    type: "WORKER_ERROR",
                    generation,
                    code: "MODEL_LOAD_FAILED",
                  }
                : { type: "MODEL_READY", generation }
            );
          }, 0);
          return;
        }
        if (message.type === "DISPOSE") {
          evidence.workerDisposals += 1;
          const dispose = () => {
            if (this.heldInference !== null) {
              const held = this.heldInference;
              this.heldInference = null;
              evidence.inferenceConcurrent -= 1;
              held.bitmap.close();
              evidence.lateInferenceResults += 1;
              this.emit({
                type: "INFERENCE_RESULT",
                generation: held.generation,
                requestId: held.requestId,
                colors: Array(27).fill("U"),
                points: Array.from({ length: 27 }, (_, index) => ({
                  x: ((index % 9) % 3 + 1) / 4,
                  y: (Math.floor((index % 9) / 3) + 1) / 4,
                })),
                durationMs: 5,
              });
            }
            this.emit({ type: "DISPOSED", generation });
          };
          if (mockOptions.delayDispose) {
            scannerWindow.__releaseScannerDispose = dispose;
          } else {
            nativeSetTimeout(dispose, 0);
          }
          return;
        }
        if (message.type !== "INFER") return;

        this.inferenceCount += 1;
        evidence.inferenceConcurrent += 1;
        evidence.maximumInferenceConcurrent = Math.max(
          evidence.maximumInferenceConcurrent,
          evidence.inferenceConcurrent
        );
        evidence.inferenceStarts.push(performance.now());
        const bitmap = message.bitmap as ImageBitmap;
        if (mockOptions.workerMode === "hold-inference") {
          this.heldInference = {
            bitmap,
            generation,
            requestId: message.requestId,
          };
          return;
        }
        if (mockOptions.workerMode === "inference-failure") {
          nativeSetTimeout(() => {
            evidence.inferenceConcurrent -= 1;
            bitmap.close();
            this.emit({
              type: "WORKER_ERROR",
              generation,
              code: "INFERENCE_FAILED",
            });
          }, 0);
          return;
        }
        const poseOne = this.inferenceCount <= 5;
        const colors = poseOne
          ? [...Array(9).fill("U"), ...Array(9).fill("R"), ...Array(9).fill("B")]
          : [...Array(9).fill("D"), ...Array(9).fill("F"), ...Array(9).fill("L")];
        nativeSetTimeout(() => {
          evidence.inferenceConcurrent -= 1;
          bitmap.close();
          this.emit({
            type: "INFERENCE_RESULT",
            generation,
            requestId: message.requestId,
            colors,
            points: Array.from({ length: 27 }, (_, index) => ({
              x: ((index % 9) % 3 + 1) / 4,
              y: (Math.floor((index % 9) / 3) + 1) / 4,
            })),
            durationMs: 5,
          });
        }, 5);
      }

      terminate() {
        if (this.terminated) return;
        this.terminated = true;
        evidence.workerTerminations += 1;
        evidence.activeWorkers -= 1;
        evidence.workerTerminationAt = performance.now();
      }
    }

    Object.defineProperty(window, "Worker", {
      configurable: true,
      value: MockWorker,
    });
  }, options);
}

async function scannerEvidence(page: Page): Promise<ScannerEvidence> {
  return page.evaluate(
    () =>
      (window as typeof window & { __scannerEvidence: ScannerEvidence })
        .__scannerEvidence
  );
}

async function installCameraOnlyMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        async getUserMedia() {
          const stream = new MediaStream();
          const track = { stop() {} } as MediaStreamTrack;
          Object.defineProperty(stream, "getTracks", {
            configurable: true,
            value: () => [track],
          });
          return stream;
        },
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: async () => undefined,
    });
  });
}

async function installDelayedCameraMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const delayedWindow = window as typeof window & {
      __delayedEvidence: { trackStops: number; workerConstructions: number };
      __resolveCamera(): void;
    };
    const evidence = { trackStops: 0, workerConstructions: 0 };
    delayedWindow.__delayedEvidence = evidence;
    let resolveCamera: ((stream: MediaStream) => void) | null = null;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia() {
          return new Promise<MediaStream>((resolve) => {
            resolveCamera = resolve;
          });
        },
      },
    });
    delayedWindow.__resolveCamera = () => {
      const stream = new MediaStream();
      const track = {
        stop() {
          evidence.trackStops += 1;
        },
      } as MediaStreamTrack;
      Object.defineProperty(stream, "getTracks", {
        configurable: true,
        value: () => [track],
      });
      resolveCamera?.(stream);
    };
    Object.defineProperty(window, "Worker", {
      configurable: true,
      value: class MockWorker {
        constructor() {
          evidence.workerConstructions += 1;
        }
      },
    });
  });
}

type ListenerBaseline = Readonly<{
  activePageHideListeners: number;
  activeVisibilityListeners: number;
}>;

async function listenerBaseline(page: Page): Promise<ListenerBaseline> {
  const evidence = await scannerEvidence(page);
  return {
    activePageHideListeners: evidence.activePageHideListeners,
    activeVisibilityListeners: evidence.activeVisibilityListeners,
  };
}

async function expectScannerReleased(
  page: Page,
  baseline: ListenerBaseline
): Promise<void> {
  await expect
    .poll(async () => {
      const evidence = await scannerEvidence(page);
      return {
        activeAnimationFrames: evidence.activeAnimationFrames,
        activePageHideListeners: evidence.activePageHideListeners,
        activeScannerTimers: evidence.activeScannerTimers,
        activeTracks: evidence.activeTracks,
        activeVisibilityListeners: evidence.activeVisibilityListeners,
        activeWorkers: evidence.activeWorkers,
      };
    })
    .toEqual({
      activeAnimationFrames: 0,
      activePageHideListeners: baseline.activePageHideListeners,
      activeScannerTimers: 0,
      activeTracks: 0,
      activeVisibilityListeners: baseline.activeVisibilityListeners,
      activeWorkers: 0,
    });
}

async function startReadyScanner(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("button", { name: "Capture pose 1" })).toBeVisible();
}

async function completeTwoPoseScan(page: Page): Promise<void> {
  await startReadyScanner(page);
  await page.getByRole("button", { name: "Capture pose 1" }).click();
  await expect(page.getByRole("button", { name: "Capture pose 2" })).toBeVisible();
  await page.getByRole("button", { name: "Capture pose 2" }).click();
  await expect(
    page.getByRole("heading", { name: "Review and correct all six faces" })
  ).toBeVisible();
}

test.describe("C5R scanner acceptance contract", () => {
  test("SC-01 Explicit Start / SC-02 Permission denied / SC-14 Manual fallback / PB-05", async ({
    page,
  }) => {
    await installScannerMocks(page, { denyCamera: true });
    await page.goto("/detect");
    const baseline = await listenerBaseline(page);

    await expect(page.getByRole("link", { name: "Use manual cube entry" })).toBeVisible();
    expect(await scannerEvidence(page)).toMatchObject({
      getUserMediaCalls: 0,
      workerConstructions: 0,
    });
    const beforeStartResources = await page.evaluate(() =>
      performance.getEntriesByType("resource").map((entry) => entry.name).join("\n")
    );
    expect(beforeStartResources).not.toMatch(/cube_pose|onnxruntime|\.wasm(?:\?|$)/i);

    await page.getByRole("button", { name: "Start camera" }).click();
    await expect(page.locator('[data-scanner-state="ERROR"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Try camera again" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Use manual cube entry" })).toBeVisible();
    expect(await scannerEvidence(page)).toMatchObject({
      getUserMediaCalls: 1,
      workerConstructions: 0,
    });
    const afterDenialResources = await page.evaluate(() =>
      performance.getEntriesByType("resource").map((entry) => entry.name).join("\n")
    );
    expect(afterDenialResources).not.toMatch(/cube_pose|onnxruntime|\.wasm(?:\?|$)/i);
    await expectScannerReleased(page, baseline);
  });

  test("SC-03 Model failure releases every handle and starts zero inference", async ({
    page,
  }) => {
    await installScannerMocks(page, { workerMode: "model-failure" });
    await page.goto("/detect");
    const baseline = await listenerBaseline(page);

    await page.getByRole("button", { name: "Start camera" }).click();
    await expect(page.locator('[data-scanner-state="ERROR"]')).toBeVisible();
    await expect(page.getByText(/local scanner model could not load/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Try camera again" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Use manual cube entry" })).toBeVisible();
    await expectScannerReleased(page, baseline);
    expect(await scannerEvidence(page)).toMatchObject({
      inferenceStarts: [],
      trackStops: 1,
      workerDisposals: 1,
      workerTerminations: 1,
    });

    await page.getByRole("link", { name: "Use manual cube entry" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Enter the cube state" })).toBeVisible();
  });

  test("SC-14 Manual fallback remains visible after inference failure", async ({
    page,
  }) => {
    await installScannerMocks(page, { workerMode: "inference-failure" });
    await page.goto("/detect");
    const baseline = await listenerBaseline(page);

    await startReadyScanner(page);
    await page.getByRole("button", { name: "Capture pose 1" }).click();
    await expect(page.locator('[data-scanner-state="ERROR"]')).toBeVisible();
    await expect(page.getByText(/inference error/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Use manual cube entry" })).toBeVisible();
    await expectScannerReleased(page, baseline);
    expect((await scannerEvidence(page)).inferenceStarts).toHaveLength(1);
  });

  test("SC-06 Cancel cleanup during model loading", async ({ page }) => {
    await installScannerMocks(page, { workerMode: "hold-model" });
    await page.goto("/detect");
    const baseline = await listenerBaseline(page);

    await page.getByRole("button", { name: "Start camera" }).click();
    await expect(page.locator('[data-scanner-state="MODEL_LOADING"]')).toBeVisible();
    expect((await scannerEvidence(page)).activeScannerTimers).toBe(1);
    await page.getByRole("button", { name: "Cancel scan" }).click();
    await expect(page.locator('[data-scanner-state="CANCELLED"]')).toBeVisible();
    await expect(page.getByRole("link", { name: "Use manual cube entry" })).toBeVisible();
    await expectScannerReleased(page, baseline);
  });

  test("SC-06 Cancel cleanup while ready", async ({ page }) => {
    await installScannerMocks(page);
    await page.goto("/detect");
    const baseline = await listenerBaseline(page);

    await startReadyScanner(page);
    await page.getByRole("button", { name: "Cancel scan" }).click();
    await expect(page.locator('[data-scanner-state="CANCELLED"]')).toBeVisible();
    await expect(page.getByRole("link", { name: "Use manual cube entry" })).toBeVisible();
    await expectScannerReleased(page, baseline);
  });

  test("SC-06 Cancel cleanup / SC-09 Late inference suppression while scanning", async ({
    page,
  }) => {
    await installScannerMocks(page, { workerMode: "hold-inference" });
    await page.goto("/detect");
    const baseline = await listenerBaseline(page);

    await startReadyScanner(page);
    await page.getByRole("button", { name: "Capture pose 1" }).click();
    await expect
      .poll(async () => (await scannerEvidence(page)).inferenceStarts.length)
      .toBe(1);
    await expect(page.locator("[data-accepted-samples]")).toHaveAttribute(
      "data-accepted-samples",
      "0"
    );
    await expect(page.locator("[data-review-ready]")).toHaveAttribute(
      "data-review-ready",
      "false"
    );

    await page.getByRole("button", { name: "Cancel scan" }).click();
    await expect
      .poll(async () => (await scannerEvidence(page)).lateInferenceResults)
      .toBe(1);
    await expectScannerReleased(page, baseline);
    await expect(page.locator('[data-scanner-state="CANCELLED"]')).toBeVisible();
    await expect(page.locator("[data-accepted-samples]")).toHaveAttribute(
      "data-accepted-samples",
      "0"
    );
    await expect(page.locator("[data-review-ready]")).toHaveAttribute(
      "data-review-ready",
      "false"
    );
    await expect(
      page.getByRole("heading", { name: "Review and correct all six faces" })
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Use manual cube entry" })).toBeVisible();
    expect(
      await page.evaluate(() => sessionStorage.getItem("hca.scannerDraft.v1"))
    ).toBeNull();
  });

  test("SC-06 Cancel cleanup during permission / SC-08 Late camera completion", async ({
    page,
  }) => {
    await installDelayedCameraMock(page);
    await page.goto("/detect");

    await page.getByRole("button", { name: "Start camera" }).click();
    await expect(page.locator('[data-scanner-state="PERMISSION"]')).toBeVisible();
    await page.getByRole("button", { name: "Cancel scan" }).click();
    await page.evaluate(() =>
      (window as typeof window & { __resolveCamera(): void }).__resolveCamera()
    );
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as typeof window & {
              __delayedEvidence: { trackStops: number };
            }).__delayedEvidence.trackStops
        )
      )
      .toBe(1);
    expect(
      await page.evaluate(
        () =>
          (window as typeof window & {
            __delayedEvidence: { workerConstructions: number };
          }).__delayedEvidence.workerConstructions
      )
    ).toBe(0);
    await expect(page.locator('[data-scanner-state="CANCELLED"]')).toBeVisible();
    await expect(page.getByRole("link", { name: "Use manual cube entry" })).toBeVisible();
  });

  test("SC-07 Pagehide cleanup releases tracks, worker, RAF, timers, and listeners", async ({
    page,
  }) => {
    await installScannerMocks(page);
    await page.goto("/detect");
    const baseline = await listenerBaseline(page);
    await startReadyScanner(page);

    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await expectScannerReleased(page, baseline);
    expect(await scannerEvidence(page)).toMatchObject({
      trackStops: 1,
      workerTerminations: 1,
    });
  });

  test("SC-07 Unmount cleanup releases tracks, worker, RAF, timers, and listeners", async ({
    page,
  }) => {
    await installScannerMocks(page);
    await page.goto("/detect");
    const baseline = await listenerBaseline(page);
    await startReadyScanner(page);

    await page.getByRole("link", { name: "Use manual cube entry" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Enter the cube state" })).toBeVisible();
    await expectScannerReleased(page, baseline);
  });

  test("SC-04 One inference in flight / SC-05 <=8 inference starts/sec / SC-10 Unknown safety / SC-11 Two-step mapping / SC-12 Review/correction / SC-13 Draft handoff / SC-14 Manual fallback / SC-15 Responsive/keyboard / SC-16 Root isolation", async ({
    page,
  }) => {
    await installScannerMocks(page, { delayDispose: true });
    let evaluateRequests = 0;
    await page.route("**/api/evaluate", async (route) => {
      evaluateRequests += 1;
      await route.abort();
    });
    await page.goto("/detect");

    await completeTwoPoseScan(page);
    expect((await scannerEvidence(page)).constraints).toEqual({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    await expect(page.getByRole("link", { name: "Use manual cube entry" })).toBeVisible();
    const reviewStickers = page.locator(
      '[data-testid="cube-net-editor"] [data-sticker-editable], [data-testid="cube-net-editor"] [data-sticker-fixed]'
    );
    await expect(reviewStickers).toHaveCount(54);
    await expect(page.getByRole("radio", { name: /Unknown/ })).toBeVisible();
    await page.locator('[data-sticker-index="0"]').focus();
    await page.keyboard.press("?");
    await expect(page.locator('[data-sticker-index="0"]')).toHaveAttribute(
      "aria-label",
      /token N, Unknown color, Unknown/
    );
    await page.keyboard.press("U");

    await page.setViewportSize({ width: 360, height: 800 });
    expect(
      await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }))
    ).toEqual({ innerWidth: 360, scrollWidth: 360 });
    const stickerBox = await page.locator('[data-sticker-index="0"]').boundingBox();
    expect(stickerBox?.width).toBeGreaterThanOrEqual(44);
    expect(stickerBox?.height).toBeGreaterThanOrEqual(44);

    const scanningEvidence = await scannerEvidence(page);
    expect(scanningEvidence.activeTracks).toBe(0);
    expect(scanningEvidence.activeWorkers).toBe(1);
    expect(scanningEvidence.maximumInferenceConcurrent).toBe(1);
    expect(scanningEvidence.inferenceStarts).toHaveLength(10);
    for (let index = 1; index < scanningEvidence.inferenceStarts.length; index += 1) {
      expect(
        scanningEvidence.inferenceStarts[index] -
          scanningEvidence.inferenceStarts[index - 1]
      ).toBeGreaterThanOrEqual(110);
    }

    await page.getByRole("button", { name: "Use reviewed draft in evaluator" }).click();
    await expect(page.locator("[data-handoff-busy]")).toHaveAttribute(
      "data-handoff-busy",
      "true"
    );
    expect((await scannerEvidence(page)).storageWrites).toBe(0);
    await page.evaluate(() =>
      (
        window as typeof window & { __releaseScannerDispose(): void }
      ).__releaseScannerDispose()
    );

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Enter the cube state" })).toBeVisible();
    await expect(page.locator('[data-sticker-index="0"]')).toHaveAttribute(
      "aria-label",
      /token U, known/
    );
    await expect(page.locator('[data-sticker-index="0"]')).toBeFocused();
    await expect(page.getByRole("button", { name: "Run evaluation" })).toBeEnabled();
    expect(evaluateRequests).toBe(0);
    expect(
      await page.evaluate(() => sessionStorage.getItem("hca.scannerDraft.v1"))
    ).toBeNull();

    const handoffEvidence = await scannerEvidence(page);
    expect(handoffEvidence.storageWrites).toBe(1);
    expect(handoffEvidence.workerTerminationAt).not.toBeNull();
    expect(handoffEvidence.storageWriteAt).not.toBeNull();
    expect(handoffEvidence.navigationAt).not.toBeNull();
    expect(handoffEvidence.workerTerminationAt as number).toBeLessThanOrEqual(
      handoffEvidence.storageWriteAt as number
    );
    expect(handoffEvidence.storageWriteAt as number).toBeLessThan(
      handoffEvidence.navigationAt as number
    );
  });

  test("SC-13 Draft handoff storage failure preserves reviewed draft without navigation", async ({
    page,
  }) => {
    await installScannerMocks(page, { storageFailure: true });
    await page.goto("/detect");
    await completeTwoPoseScan(page);
    await expect
      .poll(async () => (await scannerEvidence(page)).workerTerminations)
      .toBe(1);

    await page.getByRole("button", { name: "Use reviewed draft in evaluator" }).click();
    await expect(page.getByText(/review is still here/i)).toBeVisible();
    await expect(page).toHaveURL(/\/detect$/);
    await expect(
      page.getByRole("heading", { name: "Review and correct all six faces" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Use reviewed draft in evaluator" })).toBeEnabled();
    expect(await scannerEvidence(page)).toMatchObject({
      navigationAt: null,
      storageWrites: 1,
    });
  });

  test("SC-17 Real-model smoke loads the audited model and WASM session", async ({
    page,
  }) => {
    test.setTimeout(50_000);
    await installCameraOnlyMock(page);
    const requestedUrls: string[] = [];
    const scannerRequests: Request[] = [];
    let afterStart = false;
    page.on("request", (request) => {
      requestedUrls.push(request.url());
      if (afterStart && request.url().startsWith("http")) scannerRequests.push(request);
    });
    await page.goto("/detect");

    expect(requestedUrls.join("\n")).not.toMatch(/cube_pose|\.wasm(?:\?|$)/i);
    const startedAt = Date.now();
    afterStart = true;
    await page.getByRole("button", { name: "Start camera" }).click();
    await expect(page.getByRole("button", { name: "Capture pose 1" })).toBeVisible({
      timeout: 45_000,
    });
    const readyDurationMs = Date.now() - startedAt;

    expect(requestedUrls.join("\n")).toContain(
      "/models/cube_pose.284726d2638cc8ba.onnx"
    );
    expect(requestedUrls.some((url) => /\.wasm(?:\?|$)/i.test(url))).toBe(true);
    expect(readyDurationMs).toBeLessThanOrEqual(35_000);
    const transferSizes = await Promise.all(
      scannerRequests.map((request) => request.sizes())
    );
    const encodedColdScannerBytes = transferSizes.reduce(
      (sum, size) => sum + size.responseBodySize,
      0
    );
    expect(encodedColdScannerBytes).toBeLessThanOrEqual(30 * 1024 * 1024);
    await page.getByRole("button", { name: "Cancel scan" }).click();
  });
});
