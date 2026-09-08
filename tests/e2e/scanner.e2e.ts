import { expect, test, type Page, type Request } from "@playwright/test";

type ScannerEvidence = {
  getUserMediaCalls: number;
  workerConstructions: number;
  workerTerminations: number;
  trackStops: number;
  trackStopAt: number | null;
  bitmapCloses: number;
  inferenceConcurrent: number;
  maximumInferenceConcurrent: number;
  inferenceStarts: number[];
  workerTerminationAt: number | null;
  constraints: unknown;
};

async function installScannerMocks(page: Page, denyCamera = false): Promise<void> {
  await page.addInitScript(({ deny }) => {
    const scannerWindow = window as typeof window & {
      __scannerEvidence: ScannerEvidence;
    };
    const evidence: ScannerEvidence = {
      getUserMediaCalls: 0,
      workerConstructions: 0,
      workerTerminations: 0,
      trackStops: 0,
      trackStopAt: null,
      bitmapCloses: 0,
      inferenceConcurrent: 0,
      maximumInferenceConcurrent: 0,
      inferenceStarts: [],
      workerTerminationAt: null,
      constraints: null,
    };
    scannerWindow.__scannerEvidence = evidence;

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        async getUserMedia(constraints: unknown) {
          evidence.getUserMediaCalls += 1;
          evidence.constraints = constraints;
          if (deny) throw new DOMException("denied", "NotAllowedError");

          const stream = new MediaStream();
          const track = {
            stop() {
              evidence.trackStops += 1;
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

      constructor() {
        evidence.workerConstructions += 1;
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
          window.setTimeout(
            () => this.emit({ type: "MODEL_READY", generation }),
            0
          );
          return;
        }
        if (message.type === "DISPOSE") {
          window.setTimeout(
            () => this.emit({ type: "DISPOSED", generation }),
            0
          );
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
        const poseOne = this.inferenceCount <= 5;
        const colors = poseOne
          ? [...Array(9).fill("U"), ...Array(9).fill("R"), ...Array(9).fill("B")]
          : [...Array(9).fill("D"), ...Array(9).fill("F"), ...Array(9).fill("L")];
        const bitmap = message.bitmap as ImageBitmap;
        window.setTimeout(() => {
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
        evidence.workerTerminations += 1;
        evidence.workerTerminationAt = performance.now();
      }
    }

    Object.defineProperty(window, "Worker", {
      configurable: true,
      value: MockWorker,
    });
  }, { deny: denyCamera });
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

test.describe("C5 optional reviewed scanner", () => {
  test("SC-01/02 and PB-05 keep camera, worker, model, and WASM behind Start and permission", async ({
    page,
  }) => {
    await installScannerMocks(page, true);
    await page.goto("/detect");

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
    expect(await scannerEvidence(page)).toMatchObject({
      getUserMediaCalls: 1,
      workerConstructions: 0,
    });
    const afterDenialResources = await page.evaluate(() =>
      performance.getEntriesByType("resource").map((entry) => entry.name).join("\n")
    );
    expect(afterDenialResources).not.toMatch(/cube_pose|onnxruntime|\.wasm(?:\?|$)/i);
    await expect(page.getByRole("link", { name: "Use manual cube entry" })).toBeVisible();
  });

  test("SC-03..17 completes mocked two-pose review, cleanup, and one-use root handoff", async ({
    page,
  }) => {
    await installScannerMocks(page);
    let evaluateRequests = 0;
    await page.route("**/api/evaluate", async (route) => {
      evaluateRequests += 1;
      await route.abort();
    });
    await page.goto("/detect");

    await page.getByRole("button", { name: "Start camera" }).click();
    await expect(page.getByRole("button", { name: "Capture pose 1" })).toBeVisible();
    expect((await scannerEvidence(page)).constraints).toEqual({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    await expect(page.getByText("Red · R", { exact: true })).toBeVisible();
    await expect(page.getByText("Blue · B", { exact: true })).toBeVisible();
    await expect(page.locator("canvas")).toHaveCSS("transform", "none");

    await page.getByRole("button", { name: "Capture pose 1" }).click();
    await expect(page.getByRole("button", { name: "Capture pose 2" })).toBeVisible();
    await page.getByRole("button", { name: "Capture pose 2" }).click();
    await expect(
      page.getByRole("heading", { name: "Review and correct all six faces" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Use manual cube entry" })).toBeVisible();

    const reviewStickers = page.locator(
      '[data-testid="cube-net-editor"] [data-sticker-editable], [data-testid="cube-net-editor"] [data-sticker-fixed]'
    );
    await expect(reviewStickers).toHaveCount(54);
    await expect(page.getByRole("radio", { name: /Unknown/ })).toBeVisible();
    await page.getByRole("radio", { name: /Unknown/ }).check();
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

    await expect
      .poll(async () => (await scannerEvidence(page)).trackStops)
      .toBe(1);
    await expect
      .poll(async () => (await scannerEvidence(page)).workerTerminations)
      .toBe(1);
    const evidence = await scannerEvidence(page);
    expect(evidence.maximumInferenceConcurrent).toBe(1);
    expect(evidence.inferenceStarts).toHaveLength(10);
    for (let index = 1; index < evidence.inferenceStarts.length; index += 1) {
      expect(evidence.inferenceStarts[index] - evidence.inferenceStarts[index - 1]).toBeGreaterThanOrEqual(110);
    }

    await page.getByRole("button", { name: "Use reviewed draft in evaluator" }).click();
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
  });

  test("SC-08 stops a late permission stream and never constructs the worker", async ({
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
  });

  test("SC-09 visibility loss converges on the same bounded cleanup", async ({ page }) => {
    await installScannerMocks(page);
    await page.goto("/detect");
    await page.getByRole("button", { name: "Start camera" }).click();
    await expect(page.getByRole("button", { name: "Capture pose 1" })).toBeVisible();

    const visibilityLossAt = await page.evaluate(() => {
      const startedAt = performance.now();
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      return startedAt;
    });
    await expect(page.locator('[data-scanner-state="ERROR"]')).toBeVisible();
    await expect
      .poll(async () => (await scannerEvidence(page)).trackStops)
      .toBe(1);
    await expect
      .poll(async () => (await scannerEvidence(page)).workerTerminations)
      .toBe(1);
    const evidence = await scannerEvidence(page);
    expect((evidence.trackStopAt ?? Infinity) - visibilityLossAt).toBeLessThanOrEqual(250);
    expect((evidence.workerTerminationAt ?? Infinity) - visibilityLossAt).toBeLessThanOrEqual(1_000);
  });

  test("SC-17 / PB-06 loads the pinned real model only after camera permission", async ({
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
