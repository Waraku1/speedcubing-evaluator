import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";

export const SOLVED_FACELETS =
  "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

export async function expectNoWcagViolations(
  page: Page,
  scenario: string
): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags([
      "wcag2a",
      "wcag2aa",
      "wcag21a",
      "wcag21aa",
      "wcag22a",
      "wcag22aa",
    ])
    .analyze();
  const findings = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.map((node) => node.target.join(" ")),
  }));

  expect(findings, `${scenario}: ${JSON.stringify(findings, null, 2)}`).toEqual(
    []
  );
}

export async function loadSolvedExample(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Load solved example" }).click();
  await expect(page.locator('[data-state="READY"]')).toBeVisible();
}

export async function installEvaluationFixture(
  page: Page,
  fixture: Record<string, unknown>,
  status = 200
): Promise<void> {
  await page.route("**/api/evaluate", async (route) => {
    await route.fulfill({ json: fixture, status });
  });
}

export async function runFixtureEvaluation(page: Page): Promise<void> {
  await loadSolvedExample(page);
  await page.getByRole("button", { name: "Run evaluation" }).click();
  await expect(
    page.getByRole("heading", { name: "Evaluation result", level: 2 })
  ).toBeFocused();
}

export async function tabTo(
  page: Page,
  target: Locator,
  maximumTabs = 120
): Promise<void> {
  for (let index = 0; index < maximumTabs; index += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) {
      return;
    }
  }
  throw new Error(`Target was not reached within ${maximumTabs} Tab presses.`);
}

export async function expectKeyboardFocusVisible(
  locator: Locator
): Promise<void> {
  const evidence = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineStyle: style.outlineStyle,
      rect: {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
      },
      viewport: { width: innerWidth, height: innerHeight },
    };
  });

  expect(evidence.outlineStyle).not.toBe("none");
  expect(evidence.outlineWidth).toBeGreaterThanOrEqual(2);
  expect(evidence.rect.top).toBeGreaterThanOrEqual(0);
  expect(evidence.rect.left).toBeGreaterThanOrEqual(0);
  // Layout-unit rounding can expose a sub-pixel edge beyond the integer viewport.
  expect(evidence.rect.right).toBeLessThanOrEqual(evidence.viewport.width + 1);
  expect(evidence.rect.bottom).toBeLessThanOrEqual(evidence.viewport.height + 1);
}

export async function expectNoDocumentOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(widths.scrollWidth).toBe(widths.clientWidth);
}

export type ScannerMockMode =
  | "READY"
  | "PERMISSION_PENDING"
  | "MODEL_PENDING"
  | "INFERENCE_PENDING"
  | "CAMERA_DENIED"
  | "INFERENCE_ERROR"
  | "UNSUPPORTED_SECURE"
  | "INSECURE";

export async function installScannerStateMock(
  page: Page,
  options: Readonly<{
    mode?: ScannerMockMode;
    reviewHasUnknown?: boolean;
  }> = {}
): Promise<void> {
  await page.addInitScript((mockOptions) => {
    const mode = mockOptions.mode ?? "READY";
    if (mode === "INSECURE" || mode === "UNSUPPORTED_SECURE") {
      if (mode === "INSECURE") {
        Object.defineProperty(window, "isSecureContext", {
          configurable: true,
          value: false,
        });
      }
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: undefined,
      });
      return;
    }

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        async getUserMedia() {
          if (mode === "PERMISSION_PENDING") {
            return new Promise<MediaStream>(() => undefined);
          }
          if (mode === "CAMERA_DENIED") {
            throw new DOMException("denied", "NotAllowedError");
          }
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
      value: async () => ({ close() {} }) as ImageBitmap,
    });
    if (!("OffscreenCanvas" in window)) {
      Object.defineProperty(window, "OffscreenCanvas", {
        configurable: true,
        value: class MockOffscreenCanvas {},
      });
    }

    class MockWorker {
      private readonly listeners = new Set<
        (event: MessageEvent<unknown>) => void
      >();
      private inferenceCount = 0;

      addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject
      ) {
        if (type === "message") {
          this.listeners.add(
            listener as (event: MessageEvent<unknown>) => void
          );
        }
      }

      removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject
      ) {
        if (type === "message") {
          this.listeners.delete(
            listener as (event: MessageEvent<unknown>) => void
          );
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
          if (mode !== "MODEL_PENDING") {
            setTimeout(
              () => this.emit({ type: "MODEL_READY", generation }),
              0
            );
          }
          return;
        }
        if (message.type === "DISPOSE") {
          setTimeout(() => this.emit({ type: "DISPOSED", generation }), 0);
          return;
        }
        if (message.type !== "INFER") return;

        this.inferenceCount += 1;
        const bitmap = message.bitmap as ImageBitmap;
        if (mode === "INFERENCE_PENDING") return;
        if (mode === "INFERENCE_ERROR") {
          setTimeout(() => {
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
          ? [
              ...Array(9).fill("U"),
              ...Array(9).fill("R"),
              ...Array(9).fill("B"),
            ]
          : [
              ...Array(9).fill("D"),
              ...Array(9).fill("F"),
              ...Array(9).fill("L"),
            ];
        if (mockOptions.reviewHasUnknown) colors[0] = "N";
        setTimeout(() => {
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

      terminate() {}
    }

    Object.defineProperty(window, "Worker", {
      configurable: true,
      value: MockWorker,
    });
  }, options);
}

export async function startReadyScanner(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("button", { name: "Capture pose 1" })).toBeVisible();
}

export async function completeTwoPoseScan(page: Page): Promise<void> {
  await startReadyScanner(page);
  await page.getByRole("button", { name: "Capture pose 1" }).click();
  await expect(page.getByRole("button", { name: "Capture pose 2" })).toBeVisible();
  await page.getByRole("button", { name: "Capture pose 2" }).click();
  await expect(
    page.getByRole("heading", { name: "Review and correct all six faces" })
  ).toBeFocused();
}
