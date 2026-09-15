import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  createC6ErrorFixture,
  createC6LargeTraceFixture,
  createC6NonSolvedFixture,
  createC6SolvedFixture,
  createC6ValidityVocabularyFixture,
} from "../fixtures/c6PresentationFixtures";
import {
  completeTwoPoseScan,
  expectKeyboardFocusVisible,
  expectNoDocumentOverflow,
  expectNoWcagViolations,
  installEvaluationFixture,
  installScannerStateMock,
  loadSolvedExample,
  runFixtureEvaluation,
  tabTo,
  type ScannerMockMode,
} from "./helpers/c7c2";

const BASE_URL = "http://localhost:3000";

async function withScannerState(
  browser: Browser,
  mode: ScannerMockMode,
  callback: (page: Page) => Promise<void>,
  reviewHasUnknown = false
): Promise<void> {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  try {
    await installScannerStateMock(page, { mode, reviewHasUnknown });
    await page.goto("/detect");
    await callback(page);
  } finally {
    await context.close();
  }
}

test.describe("C7-C2 automated accessibility closure", () => {
  test("audits empty, invalid, READY, loading, result, trace, and API-error states", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.goto("/");
    await expectNoWcagViolations(page, "root empty/incomplete");

    await loadSolvedExample(page);
    await expectNoWcagViolations(page, "READY cube");
    await page.getByRole("button", { name: /R face, row 1, column 1/ }).click();
    await expect(page.locator('[data-state="INVALID"]')).toBeVisible();
    await expectNoWcagViolations(page, "invalid cube");

    await page.goto("/");
    let releaseRequest: (() => void) | undefined;
    await page.route("**/api/evaluate", async (route) => {
      await new Promise<void>((resolve) => {
        releaseRequest = resolve;
      });
      await route.abort();
    });
    await loadSolvedExample(page);
    await page.getByRole("button", { name: "Run evaluation" }).click();
    await expect(page.getByTestId("request-status")).toBeVisible();
    await expectNoWcagViolations(page, "submitting/loading");
    await page.getByRole("button", { name: "Cancel request" }).click();
    releaseRequest?.();
    await page.unrouteAll({ behavior: "ignoreErrors" });

    let fixture = createC6SolvedFixture();
    await page.route("**/api/evaluate", async (route) => {
      await route.fulfill({ json: fixture, status: 200 });
    });

    await page.goto("/");
    await runFixtureEvaluation(page);
    await expectNoWcagViolations(page, "solved result and status-only Demand");

    fixture = createC6NonSolvedFixture();
    await page.goto("/");
    await runFixtureEvaluation(page);
    await expectNoWcagViolations(page, "non-solved result");

    fixture = createC6LargeTraceFixture();
    await page.goto("/");
    await runFixtureEvaluation(page);
    await page
      .getByRole("button", { name: "Show Trace Level 2 identifiers" })
      .click();
    await expectNoWcagViolations(page, "Trace Level 2");
    await page.getByRole("button", { name: /View technical details/ }).first().click();
    await expect(page.getByTestId("trace-level-3")).toBeVisible();
    await expectNoWcagViolations(page, "Trace Level 3");

    await page.unrouteAll({ behavior: "wait" });
    await installEvaluationFixture(page, createC6ErrorFixture(), 503);
    await page.goto("/");
    await loadSolvedExample(page);
    await page.getByRole("button", { name: "Run evaluation" }).click();
    await expect(page.getByTestId("error-summary")).toBeFocused();
    await expectNoWcagViolations(page, "API error");
  });

  test("audits the focused App Router error boundary", async ({ page }) => {
    let renderFaultInjected = false;
    await page.route("**/_next/static/chunks/**/*.js", async (route) => {
      const response = await route.fetch();
      let body = await response.text();
      if (!renderFaultInjected && body.includes("EvaluatorWorkbench")) {
        const productionName = body.match(
          /EvaluatorWorkbench:\(\)=>([A-Za-z_$][\w$]*)/
        )?.[1];
        const functionStart = productionName
          ? `function ${productionName}(){`
          : "function EvaluatorWorkbench() {";
        if (body.includes(functionStart)) {
          body = body.replace(
            functionStart,
            `${functionStart}if(globalThis.__c7c2RenderFault){throw new Error("bounded C7-C2 fault");}`
          );
          renderFaultInjected = true;
        }
      }
      await route.fulfill({ response, body });
    });

    await page.goto("/");
    await expect.poll(() => renderFaultInjected).toBe(true);
    await page.evaluate(() => {
      (
        globalThis as typeof globalThis & { __c7c2RenderFault: boolean }
      ).__c7c2RenderFault = true;
    });
    await page.getByRole("button", { name: "Load solved example" }).click();
    await expect(
      page.getByRole("heading", { name: "Evaluator unavailable" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry evaluator" })).toBeFocused();
    await expectNoWcagViolations(page, "App Router error boundary");
    for (const control of [
      page.getByRole("button", { name: "Retry evaluator" }),
      page.getByRole("link", { name: "Return to manual cube entry" }),
    ]) {
      const box = await control.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("audits scanner idle, permission, model, scanning, review, and recovery states", async ({
    browser,
  }) => {
    test.setTimeout(60_000);

    await withScannerState(browser, "READY", async (page) => {
      await expectNoWcagViolations(page, "scanner before Start");
    });
    await withScannerState(browser, "PERMISSION_PENDING", async (page) => {
      await page.getByRole("button", { name: "Start camera" }).click();
      await expect(page.locator('[data-scanner-state="PERMISSION"]')).toBeVisible();
      await expectNoWcagViolations(page, "scanner permission state");
    });
    await withScannerState(browser, "MODEL_PENDING", async (page) => {
      await page.getByRole("button", { name: "Start camera" }).click();
      await expect(page.locator('[data-scanner-state="MODEL_LOADING"]')).toBeVisible();
      await expectNoWcagViolations(page, "scanner model-loading state");
    });
    await withScannerState(browser, "INFERENCE_PENDING", async (page) => {
      await page.getByRole("button", { name: "Start camera" }).click();
      await page.getByRole("button", { name: "Capture pose 1" }).click();
      await expect(page.locator('[data-scanner-state="SCANNING_POSE_1"]')).toBeVisible();
      await expect(page.locator("[aria-live=off]")).toContainText("Stable samples");
      await expectNoWcagViolations(page, "scanner scanning state");
    });
    await withScannerState(
      browser,
      "READY",
      async (page) => {
        await completeTwoPoseScan(page);
        await expect(page.locator('[data-token="N"]')).not.toHaveCount(0);
        await expectNoWcagViolations(page, "scanner review with N");
      },
      true
    );
    await withScannerState(browser, "CAMERA_DENIED", async (page) => {
      await page.getByRole("button", { name: "Start camera" }).click();
      await expect(page.locator('[data-scanner-state="ERROR"]')).toBeVisible();
      await expect(page.getByRole("button", { name: "Try camera again" })).toBeFocused();
      await expectNoWcagViolations(page, "scanner error/retry/manual fallback");
    });
  });

  test("distinguishes insecure-context recovery from browser incompatibility", async ({
    browser,
  }) => {
    await withScannerState(browser, "INSECURE", async (page) => {
      await page.getByRole("button", { name: "Start camera" }).click();
      const alert = page.locator('[data-scanner-state="ERROR"] [role="alert"]');
      await expect(alert).toContainText("requires HTTPS or localhost");
      await expect(alert).toContainText("not in a secure context");
      await expect(page.getByRole("link", { name: "Use manual cube entry" })).toBeVisible();
    });
    await withScannerState(browser, "UNSUPPORTED_SECURE", async (page) => {
      await page.getByRole("button", { name: "Start camera" }).click();
      const alert = page.locator('[data-scanner-state="ERROR"] [role="alert"]');
      await expect(alert).toContainText(
        "This browser cannot run the local camera scanner"
      );
      await expect(alert).not.toContainText("not in a secure context");
    });
  });

  test("closes WATCH_SCANNER_360_OVERFLOW in three canonical-review repetitions", async ({
    browser,
  }) => {
    test.setTimeout(45_000);
    for (let repetition = 0; repetition < 3; repetition += 1) {
      await withScannerState(
        browser,
        "READY",
        async (page) => {
          await page.setViewportSize({ width: 360, height: 800 });
          await completeTwoPoseScan(page);
          const geometry = await page.evaluate(() => {
            const widest = Array.from(document.querySelectorAll<HTMLElement>("body *"))
              .map((element) => ({
                description:
                  element.getAttribute("data-testid") ??
                  element.getAttribute("aria-label") ??
                  element.tagName,
                right: element.getBoundingClientRect().right,
                width: element.getBoundingClientRect().width,
              }))
              .sort((left, right) => right.right - left.right)[0];
            return {
              clientWidth: document.documentElement.clientWidth,
              scrollWidth: document.documentElement.scrollWidth,
              widest,
            };
          });
          expect(
            geometry.scrollWidth,
            `repetition ${repetition + 1}; widest=${JSON.stringify(geometry.widest)}`
          ).toBe(geometry.clientWidth);
        },
        true
      );
    }
  });

  test("closes WATCH_FOCUS_VISIBLE with real keyboard focus in three repetitions", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    for (let repetition = 0; repetition < 3; repetition += 1) {
      await page.goto("/");
      await page.keyboard.press("Tab");
      const skipLink = page.getByRole("link", {
        name: "Skip to evaluator workbench",
      });
      await expect(skipLink).toBeFocused();
      await page.waitForTimeout(150);
      await expectKeyboardFocusVisible(skipLink);
      await page.keyboard.press("Enter");
      await expect(page.getByRole("main")).toBeFocused();

      const whitePalette = page.getByRole("radio", { name: /U White/ });
      const redPalette = page.getByRole("radio", { name: /R Red/ });
      await tabTo(page, whitePalette, 10);
      await page.keyboard.press("ArrowRight");
      await expect(redPalette).toBeFocused();
      await expect(redPalette).toBeChecked();
      const redFace = page.getByRole("button", { name: "R Red" });
      await tabTo(page, redFace, 10);
      await page.keyboard.press("Enter");
      await expect(redFace).toHaveAttribute("aria-pressed", "true");
      const firstSticker = page.locator('[data-sticker-index="9"]');
      await expect(firstSticker).toBeFocused();
      await expectKeyboardFocusVisible(firstSticker);
      await page.keyboard.press("Space");
      await expect(firstSticker).toHaveAttribute("data-token", "R");
      await page.keyboard.press("ArrowRight");
      await expect(page.locator('[data-sticker-index="10"]')).toBeFocused();
      await page.keyboard.press("?");
      await expect(page.locator('[data-sticker-index="10"]')).toHaveAttribute(
        "data-token",
        "N"
      );
      await page.keyboard.press("Shift+Tab");
      await expect(firstSticker).toBeFocused();
    }
  });

  test("uses keyboard paths for Run, error recovery, scanner Cancel, review, and trace", async ({
    browser,
    page,
  }) => {
    test.setTimeout(60_000);
    await installEvaluationFixture(page, createC6ErrorFixture(), 503);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    const loadExample = page.getByRole("button", { name: "Load solved example" });
    await tabTo(page, loadExample);
    await page.keyboard.press("Enter");
    const run = page.getByRole("button", { name: "Run evaluation" });
    await tabTo(page, run);
    await expectKeyboardFocusVisible(run);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("error-summary")).toBeFocused();
    const retry = page.getByRole("button", { name: "Try again" });
    await tabTo(page, retry);
    await expectKeyboardFocusVisible(retry);

    await withScannerState(browser, "MODEL_PENDING", async (scannerPage) => {
      await scannerPage.setViewportSize({ width: 360, height: 800 });
      await scannerPage.keyboard.press("Tab");
      await scannerPage.keyboard.press("Enter");
      await expect(scannerPage.getByRole("main")).toBeFocused();
      const start = scannerPage.getByRole("button", { name: "Start camera" });
      await tabTo(scannerPage, start);
      await scannerPage.keyboard.press("Space");
      const cancel = scannerPage.getByRole("button", { name: "Cancel scan" });
      await tabTo(scannerPage, cancel);
      await expectKeyboardFocusVisible(cancel);
      await scannerPage.keyboard.press("Enter");
      await expect(
        scannerPage.getByRole("button", { name: "Try camera again" })
      ).toBeFocused();
      await scannerPage.keyboard.press("Shift+Tab");
      await expect(
        scannerPage.getByRole("link", { name: "Use manual cube entry" })
      ).toBeFocused();
      await scannerPage.keyboard.press("Enter");
      await expect(scannerPage).toHaveURL(/\/$/);
    });

    await withScannerState(
      browser,
      "READY",
      async (scannerPage) => {
        await scannerPage.setViewportSize({ width: 360, height: 800 });
        await completeTwoPoseScan(scannerPage);
        const firstSticker = scannerPage.locator('[data-sticker-index="0"]');
        await tabTo(scannerPage, firstSticker, 30);
        await scannerPage.keyboard.press("?");
        await expect(firstSticker).toHaveAttribute("data-token", "N");
        const handoff = scannerPage.getByRole("button", {
          name: "Use reviewed draft in evaluator",
        });
        await tabTo(scannerPage, handoff, 90);
        await expectKeyboardFocusVisible(handoff);
        await scannerPage.keyboard.press("Enter");
        await expect(scannerPage).toHaveURL(/\/$/);
        await expect(scannerPage.getByRole("status")).toContainText(
          "Reviewed camera draft imported"
        );
      },
      true
    );

    const traceContext = await browser.newContext({ baseURL: BASE_URL });
    const tracePage = await traceContext.newPage();
    try {
      await installEvaluationFixture(tracePage, createC6LargeTraceFixture());
      await tracePage.goto("/");
      await runFixtureEvaluation(tracePage);
      const disclosure = tracePage.getByRole("button", {
        name: "Show Trace Level 2 identifiers",
      });
      await tabTo(tracePage, disclosure);
      await tracePage.keyboard.press("Enter");
      const firstDetail = tracePage
        .getByRole("button", { name: /View technical details/ })
        .first();
      await tabTo(tracePage, firstDetail);
      await tracePage.keyboard.press("Enter");
      await expect(tracePage.getByTestId("trace-level-3")).toBeVisible();
      const nextPage = tracePage.getByRole("button", {
        name: "Next trace page",
      });
      await tabTo(tracePage, nextPage, 60);
      await tracePage.keyboard.press("Space");
      await expect(tracePage.getByText("Page 2 of 11")).toBeVisible();
    } finally {
      await traceContext.close();
    }
  });

  test("verifies reflow, effective 200% zoom, long identifiers, and governed targets", async ({
    page,
  }) => {
    const fixture = createC6LargeTraceFixture();
    fixture.requestId = `request:${"long-id-".repeat(40)}`;
    await installEvaluationFixture(page, fixture);

    for (const viewport of [
      { width: 320, height: 800 },
      { width: 360, height: 800 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await runFixtureEvaluation(page);
      await page
        .getByRole("button", { name: "Show Trace Level 2 identifiers" })
        .click();
      await expectNoDocumentOverflow(page);
      const governedTargets = page.locator(
        "button:visible, a:visible, fieldset label:visible, [data-sticker-editable=true]:visible"
      );
      for (let index = 0; index < (await governedTargets.count()); index += 1) {
        const box = await governedTargets.nth(index).boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
    }

    await page.setViewportSize({ width: 640, height: 900 });
    await page.goto("/");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
    await expect
      .poll(() =>
        page.evaluate(() => ({
          scale: visualViewport?.scale,
          width: visualViewport?.width,
        }))
      )
      .toEqual({ scale: 2, width: 320 });
    await expectNoDocumentOverflow(page);
    await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
    await cdp.detach();

    await page.unrouteAll({ behavior: "wait" });
    const longError = createC6ErrorFixture();
    longError.requestId = `request:${"error-id-".repeat(40)}`;
    await installEvaluationFixture(page, longError, 503);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/");
    await loadSolvedExample(page);
    await page.getByRole("button", { name: "Run evaluation" }).click();
    await expect(page.getByTestId("error-summary")).toBeFocused();
    await expectNoDocumentOverflow(page);
  });

  test("removes nonessential motion and exposes every governed status without color", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const motion = await page.locator("*").evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          animationDuration: style.animationDuration,
          animationIterationCount: style.animationIterationCount,
          transitionDelay: style.transitionDelay,
          transitionDuration: style.transitionDuration,
        };
      })
    );
    expect(
      motion.every(
        (item) =>
          item.transitionDuration === "0s" &&
          item.transitionDelay === "0s" &&
          (item.animationDuration === "0s" ||
            item.animationDuration === "0.00001s" ||
            item.animationDuration === "1e-05s") &&
          (item.animationIterationCount === "1" ||
            item.animationIterationCount === "1.0")
      )
    ).toBe(true);

    await installEvaluationFixture(page, createC6ValidityVocabularyFixture());
    await page.goto("/");
    await runFixtureEvaluation(page);
    const governedDetails = page.getByRole("button", {
      name: /Show .* proposition .* technical details/,
    });
    while ((await governedDetails.count()) > 0) {
      await governedDetails.first().click();
    }
    for (const label of [
      "Observed",
      "Missing evidence",
      "Invalid evidence",
      "Censored",
      "Saturated",
      "Not observed",
      "Path unknown",
      "Quality unknown",
    ]) {
      const badges = page.getByLabel(`Validity: ${label}`);
      expect(await badges.count()).toBeGreaterThan(0);
      await expect(badges.first()).toContainText(label);
    }
    await expectNoWcagViolations(page, "non-color governed vocabulary");
  });
});
