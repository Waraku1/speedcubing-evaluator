import { expect, test, type Page } from "@playwright/test";

const COMMIT = "b".repeat(40);
const SOLVED_FACELETS =
  "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

function provenance() {
  return {
    sourceVersionId: "source:e2e",
    transitionId: null,
    beforeHumanStateRef: null,
    afterHumanStateRef: null,
    eventId: null,
    observationId: null,
    windowId: null,
  };
}

function statusOnly(scope: string) {
  return {
    statusRecordId: `status:${scope}`,
    scope,
    status: "NOT_OBSERVED",
    reason: "HUMAN_STATE_SOURCE_NOT_PROVIDED",
    provenance: provenance(),
  };
}

function closedSuccessFixture() {
  const executionId = "execution:e2e";
  const solutionId = "solution:e2e";
  const artifactId = "demand:e2e";

  return {
    schemaVersion: "1.0",
    requestId: "request:e2e",
    result: {
      cubeState: {
        stateId: "cube:e2e",
        format: "URFDLB_FACELETS_V1",
      },
      solution: {
        solutionId,
        moves: [],
        htm: 0,
        qtm: 0,
        verified: true,
        solver: {
          solverRunId: "solver:e2e",
          id: "cubejs",
          version: "1.3.2",
          adapterVersion: "1.0",
          cacheHit: false,
          cacheKeyVersion: "1",
        },
      },
      transitionTrace: {
        schemaId: "TransitionTraceV1",
        schemaVersion: "1.0",
        executionId,
        solutionId,
        cubeStateBoundaries: [
          {
            boundaryId: "boundary:e2e",
            ordinal: 0,
            stateId: "cube:e2e",
            format: "URFDLB_FACELETS_V1",
          },
        ],
        solutionTransitions: [],
        humanStateObservationBoundaries: [
          {
            boundaryId: "human:e2e",
            ordinal: 0,
            status: "NOT_OBSERVED",
            reason: "HUMAN_STATE_SOURCE_NOT_PROVIDED",
            sourceVersionId: "source:e2e",
          },
        ],
      },
      domainDemand: {
        artifactId,
        schemaId: "SPEC-DM-001",
        schemaVersion: "1.0",
        architecture: "P-C",
        claimClass: "T3_BOUNDED_DOMAIN_DEMAND",
        executionEpisode: {
          executionId,
          transitionRefs: [],
          eventRecords: [],
          observationRecords: [],
          windowRecords: [],
          evidenceEdges: [],
          t3Consequences: {
            grip: {
              semanticOwner: "G-H-GR1",
              propositionRecords: [],
              statusOnlyRecord: statusOnly("grip"),
            },
            finger: {
              semanticOwner: "F-H-FR1",
              propositionRecords: [],
              statusOnlyRecord: statusOnly("finger"),
            },
            orientation: {
              semanticOwner: "O-H-OR1",
              propositionRecords: [],
              statusOnlyRecord: statusOnly("orientation"),
            },
            continuity: {
              semanticOwner: "C-H-CR1",
              propositionRecords: [],
              statusOnlyRecord: statusOnly("continuity"),
            },
          },
          sourceVersionManifest: [],
        },
        t1Plane: {
          planeId: "plane:t1",
          plane: "T1",
          status: "NOT_OBSERVED",
          reason: "HUMAN_STATE_SOURCE_NOT_PROVIDED",
          provenance: provenance(),
        },
        t2Plane: {
          planeId: "plane:t2",
          plane: "T2",
          status: "NOT_OBSERVED",
          reason: "HUMAN_STATE_SOURCE_NOT_PROVIDED",
          provenance: provenance(),
        },
      },
      downstreamAvailability: {
        schemaId: "DownstreamAvailabilityV1",
        schemaVersion: "1.0",
        demandArtifactId: artifactId,
        demandSchemaId: "SPEC-DM-001",
        demandSchemaVersion: "1.0",
        provenance: {
          executionId,
          release: "2026-09-10-rc",
          buildCommit: COMMIT,
        },
        entropy: {
          status: "NOT_SEMANTICALLY_AVAILABLE",
          reason: "ENTROPY_SEMANTICS_UNCLOSED",
        },
        interpretation: {
          status: "NOT_SEMANTICALLY_AVAILABLE",
          reason: "ENTROPY_SEMANTICS_UNCLOSED",
        },
        evaluation: {
          status: "NOT_SEMANTICALLY_AVAILABLE",
          reason: "ENTROPY_SEMANTICS_UNCLOSED",
        },
      },
      warnings: [
        {
          code: "HUMAN_STATE_NOT_OBSERVED",
          executionId,
          transitionIds: [],
        },
      ],
      timings: { solverDurationMs: 3 },
      build: { release: "2026-09-10-rc", commit: COMMIT },
    },
  };
}

async function loadSolvedExample(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Load solved example" }).click();
  await expect(
    page
      .getByRole("region", { name: "Enter the cube state" })
      .getByText("Ready for server validation", { exact: true })
  ).toBeVisible();
}

test.describe("C4 manual evaluator workbench", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("C4-11..13 replaces starter UI with 48 explicit editable unknowns", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "HCA Speedcubing Evaluator", level: 1 })
    ).toBeVisible();
    await expect(page.getByText("Create Next App")).toHaveCount(0);
    await expect(page.getByText("Deploy Now")).toHaveCount(0);
    await expect(page.locator('[data-sticker-editable="true"]')).toHaveCount(48);
    await expect(page.locator('[data-sticker-fixed="true"]')).toHaveCount(6);
    await expect(
      page.locator('[data-sticker-editable="true"][data-token="N"]')
    ).toHaveCount(48);
    await expect(page.getByText("48 unknown", { exact: true })).toBeVisible();
  });

  test("C4-14 supports palette, direct token, and spatial keyboard editing", async ({ page }) => {
    const first = page.locator('[data-sticker-index="0"]');
    await expect(first).toHaveAccessibleName(
      "U face, row 1, column 1, token N, Unknown, editable"
    );
    await page.getByRole("radio", { name: /R Red/ }).check();
    await first.click();
    await expect(first).toHaveAttribute("data-token", "R");

    await first.focus();
    await page.keyboard.press("b");
    await expect(first).toHaveAttribute("data-token", "B");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("button", { name: /U face, row 1, column 2/ })).toBeFocused();
    await page.keyboard.press("?");
    await expect(page.getByRole("button", { name: /U face, row 1, column 2/ })).toHaveAttribute(
      "data-token",
      "N"
    );
    await page.keyboard.press("PageDown");
    await expect(page.getByRole("button", { name: /R face, row 1, column 2/ })).toBeFocused();
  });

  test("C4-15..16 keeps Run disabled until the solved example is READY", async ({ page }) => {
    const run = page.getByRole("button", { name: "Run evaluation" });
    await expect(run).toBeDisabled();
    await loadSolvedExample(page);
    await expect(run).toBeEnabled();
    await expect(page.locator('[data-sticker-editable="true"][data-token="N"]')).toHaveCount(0);
  });

  test("C4-17..18 reflows at 360px with landmarks, target size, and visible focus", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.reload();

    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(1);
    await expect(page.getByRole("group", { name: "Cube face selector" })).toBeVisible();

    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
    );
    expect(noOverflow).toBe(true);

    const firstSticker = page.locator('[data-sticker-editable="true"]:visible').first();
    const box = await firstSticker.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await firstSticker.focus();
    const outline = await firstSticker.evaluate(
      (element) => getComputedStyle(element).outlineWidth
    );
    expect(outline).toBe("2px");

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload();
    await expect(page.locator("[data-face]:visible")).toHaveCount(6);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
      )
    ).toBe(true);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    const mainBox = await page.getByRole("main").boundingBox();
    expect(mainBox?.width).toBeLessThanOrEqual(1280);
    expect(mainBox?.x).toBeGreaterThanOrEqual(32);
  });

  test("C4-19 sends exactly one closed request and commits only a full response", async ({ page }) => {
    let requestCount = 0;
    await page.route("**/api/evaluate", async (route) => {
      requestCount += 1;
      expect(route.request().method()).toBe("POST");
      expect(route.request().postDataJSON()).toEqual({
        schemaVersion: "1.0",
        cubeState: {
          format: "URFDLB_FACELETS_V1",
          facelets: SOLVED_FACELETS,
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.fulfill({ json: closedSuccessFixture(), status: 200 });
    });

    await loadSolvedExample(page);
    const run = page.getByRole("button", { name: "Run evaluation" });
    await run.click();
    await expect(run).toBeDisabled();
    await expect(page.getByTestId("request-status")).toContainText(
      "Solving and generating Demand"
    );
    await run.evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.getByRole("heading", { name: "Analysis received" })).toBeFocused();
    expect(requestCount).toBe(1);
    await expect(page.getByTestId("result-shell")).not.toContainText("{");
  });

  test("C4-20 cancels, preserves the draft, and ignores the late response", async ({ page }) => {
    await page.route("**/api/evaluate", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fulfill({ json: closedSuccessFixture(), status: 200 }).catch(() => undefined);
    });

    await loadSolvedExample(page);
    const before = await page.locator('[data-sticker-editable="true"]').evaluateAll(
      (stickers) => stickers.map((sticker) => sticker.getAttribute("data-token")).join("")
    );
    await page.getByRole("button", { name: "Run evaluation" }).click();
    await page.getByRole("button", { name: "Cancel request" }).click();
    await expect(page.getByTestId("cancelled-status")).toContainText("Request cancelled");
    await expect(page.getByRole("button", { name: "Run evaluation" })).toBeFocused();

    await page.waitForTimeout(400);
    const after = await page.locator('[data-sticker-editable="true"]').evaluateAll(
      (stickers) => stickers.map((sticker) => sticker.getAttribute("data-token")).join("")
    );
    expect(after).toBe(before);
    await expect(page.getByTestId("result-shell")).toHaveCount(0);
  });

  test("PUI-11 focuses a safe recoverable error and preserves the draft", async ({ page }) => {
    await page.route("**/api/evaluate", async (route) => {
      await route.fulfill({
        json: {
          schemaVersion: "1.0",
          requestId: "request:error-e2e",
          error: {
            code: "SOLVER_UNAVAILABLE",
            message: "/private/worker.ts stderr",
            stage: "SOLVER",
            retryable: true,
          },
        },
        status: 503,
      });
    });

    await loadSolvedExample(page);
    await page.getByRole("button", { name: "Run evaluation" }).click();

    const summary = page.getByTestId("error-summary");
    await expect(summary).toBeFocused();
    await expect(summary).toContainText("SOLVER_UNAVAILABLE");
    await expect(summary).toContainText("temporarily unavailable");
    await expect(summary).not.toContainText("worker.ts");
    await expect(summary.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.locator('[data-sticker-editable="true"][data-token="N"]')).toHaveCount(0);
  });

  test("PUI-17 keeps scanner, camera, solver, and evaluator runtimes out of root resources", async ({ page }) => {
    const resources = await page.evaluate(() =>
      performance.getEntriesByType("resource").map((entry) => {
        const resource = entry as PerformanceResourceTiming;
        return {
          name: resource.name,
          initiatorType: resource.initiatorType,
          encodedBodySize: resource.encodedBodySize,
          decodedBodySize: resource.decodedBodySize,
        };
      })
    );
    const names = resources.map((resource) => resource.name).join("\n");
    const scripts = resources.filter(
      (resource) =>
        resource.initiatorType === "script" &&
        resource.name.includes("/_next/static/chunks/")
    );

    expect(names).not.toMatch(
      /onnxruntime|cube_pose\.onnx|\.wasm(?:\?|$)|\/detect(?:\?|$)/i
    );
    await expect(page.locator('a[href="/detect"]')).toHaveCount(0);
    expect(
      scripts.reduce((total, resource) => total + resource.encodedBodySize, 0)
    ).toBeLessThanOrEqual(250 * 1024);
    expect(
      scripts.reduce((total, resource) => total + resource.decodedBodySize, 0)
    ).toBeLessThanOrEqual(800 * 1024);
  });
});
