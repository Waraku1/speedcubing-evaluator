import { expect, test, type Page } from "@playwright/test";

import {
  C6_LONG_SOLUTION_MOVES,
  createC6LargeTraceFixture,
  createC6LongSolutionFixture,
  createC6NonSolvedFixture,
  createC6SolvedFixture,
} from "../fixtures/c6PresentationFixtures";

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
          sourceVersionManifest: [
            {
              sourceVersionId: "source:e2e",
              sourceName: "C4 E2E Human-State source",
              sourceVersion: "1.0",
              role: "HUMAN_STATE_SOURCE",
            },
          ],
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

async function routeEvaluationFixture(
  page: Page,
  fixture: Record<string, unknown>
): Promise<{ count: number }> {
  const requests = { count: 0 };

  await page.route("**/api/evaluate", async (route) => {
    requests.count += 1;
    await route.fulfill({ json: fixture, status: 200 });
  });

  return requests;
}

async function runFixtureEvaluation(page: Page): Promise<void> {
  await loadSolvedExample(page);
  await page.getByRole("button", { name: "Run evaluation" }).click();
  await expect(
    page.getByRole("heading", { name: "Evaluation result", level: 2 })
  ).toBeFocused();
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
    await expect(page.getByRole("heading", { name: "Evaluation result" })).toBeFocused();
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
    await expect(summary).toContainText("request:error-e2e");
    await expect(summary).not.toContainText("worker.ts");
    await expect(summary.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.locator('[data-sticker-editable="true"][data-token="N"]')).toHaveCount(0);
  });

  test("C4R-03 focuses validation for a server-rejected cube without changing local status", async ({ page }) => {
    await page.route("**/api/evaluate", async (route) => {
      await route.fulfill({
        json: {
          schemaVersion: "1.0",
          requestId: "request:invalid-cube-e2e",
          error: {
            code: "INVALID_CUBE_STATE",
            message: "raw physical validation detail",
            stage: "VALIDATION",
            retryable: false,
          },
        },
        status: 422,
      });
    });

    await loadSolvedExample(page);
    await page.getByRole("button", { name: "Run evaluation" }).click();

    const validation = page.locator('[data-state="READY"]');
    await expect(validation).toBeFocused();
    await expect(validation).toContainText("Ready for server validation");
    await expect(validation).toContainText(
      "Physical solvability is checked only after submission by the server."
    );
    await expect(page.getByTestId("error-summary")).not.toContainText(
      "raw physical validation detail"
    );
  });

  test("C4R-10 cancels and invalidates one active operation when the workbench unmounts", async ({ page }) => {
    let requestCount = 0;
    let releaseResponse: () => void = () => undefined;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });

    await page.evaluate(() => {
      const nativeFetch = window.fetch.bind(window);
      const observedWindow = window as typeof window & {
        __c4rAbortCount: number;
      };
      observedWindow.__c4rAbortCount = 0;

      window.fetch = (input, init) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        const signal = init?.signal;

        if (url.endsWith("/api/evaluate") && signal != null) {
          signal.addEventListener(
            "abort",
            () => {
              observedWindow.__c4rAbortCount += 1;
            },
            { once: true }
          );
        }

        return nativeFetch(input, init);
      };
    });
    await page.route("**/api/evaluate", async (route) => {
      requestCount += 1;
      await responseGate;
      await route
        .fulfill({ json: closedSuccessFixture(), status: 200 })
        .catch(() => undefined);
    });

    await loadSolvedExample(page);
    await page.getByRole("button", { name: "Run evaluation" }).click();
    await expect(page.getByTestId("request-status")).toBeVisible();
    expect(requestCount).toBe(1);

    await page.evaluate(() => {
      const routedWindow = window as typeof window & {
        next: { router: { push(href: string): void } };
      };
      routedWindow.next.router.push("/detect");
    });

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as typeof window & { __c4rAbortCount: number })
              .__c4rAbortCount
        )
      )
      .toBe(1);
    releaseResponse();
    await page.waitForTimeout(200);
    expect(
      await page.evaluate(
        () =>
          (window as typeof window & { __c4rAbortCount: number })
            .__c4rAbortCount
      )
    ).toBe(1);
    await expect(page.getByTestId("request-status")).toHaveCount(0);
    await expect(page.getByTestId("result-shell")).toHaveCount(0);
  });

  test("C6-01 renders one complete verified result from one response", async ({ page }) => {
    const requests = await routeEvaluationFixture(
      page,
      createC6NonSolvedFixture()
    );

    await runFixtureEvaluation(page);

    expect(requests.count).toBe(1);
    await expect(
      page.getByRole("heading", { name: "Verified solution", level: 3 })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Domain Demand", level: 3 })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Downstream availability", level: 3 })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Trace and provenance", level: 3 })
    ).toBeVisible();
  });

  test("C6-02 renders the solved case without inventing Demand values", async ({ page }) => {
    await routeEvaluationFixture(page, createC6SolvedFixture());
    await runFixtureEvaluation(page);

    const solution = page.getByRole("region", { name: "Verified solution" });
    await expect(solution.getByText("No moves required", { exact: true })).toBeVisible();
    await expect(solution.getByText("HTM", { exact: true })).toBeVisible();
    await expect(solution.getByText("QTM", { exact: true })).toBeVisible();
    await expect(solution.locator("dd")).toHaveText(["0", "0"]);

    const channels = page.getByTestId("demand-channel-sequence");
    await expect(channels.getByTestId("status-only-channel")).toHaveCount(4);
    await expect(channels.getByText(/^0$/)).toHaveCount(0);
  });

  test("C6-03 preserves the canonical vertical channel order and status-only treatment", async ({ page }) => {
    await routeEvaluationFixture(page, createC6SolvedFixture());
    await runFixtureEvaluation(page);

    const channels = page.getByTestId("demand-channel-sequence");
    await expect(channels.locator("h4")).toHaveText([
      "Grip",
      "Finger",
      "Orientation",
      "Continuity",
    ]);
    await expect(channels.locator('[data-status="NOT_OBSERVED"]')).toHaveCount(4);
    await expect(
      channels.getByText("No Human-State source was provided for this execution.", {
        exact: true,
      })
    ).toHaveCount(4);
  });

  test("C6-04 excludes prohibited aggregate, ranking, and human-evidence claims", async ({ page }) => {
    await routeEvaluationFixture(page, createC6NonSolvedFixture());
    await runFixtureEvaluation(page);

    const resultText = await page.getByTestId("result-shell").innerText();
    expect(resultText).not.toMatch(
      /total Demand|Demand score|overall score|percentage|normalized percentage|rank(?:ing)?|best solution|quality score|weighted average|common scale|common progress bar|radar chart|four comparable magnitude cards|Entropy value|Interpretation value|Evaluation value|H-OR2|certainty as Orientation Demand|Move evaluation|Move difficulty|DemandVector|fingerDemand|gripDemand|orientationDemand|continuityDemand/i
    );
    expect(resultText).toContain(
      "Verified moves are solution provenance and do not constitute observed human execution."
    );
  });

  test("C6-05 reports the exact downstream semantic availability boundary", async ({ page }) => {
    await routeEvaluationFixture(page, createC6SolvedFixture());
    await runFixtureEvaluation(page);

    const availability = page.getByRole("region", {
      name: "Downstream availability",
    });
    await expect(availability.getByText("Demand analysis", { exact: true })).toBeVisible();
    await expect(availability.locator("dd")).toHaveText([
      "✓ Available",
      "— Not semantically available",
      "— Not semantically available",
      "— Not semantically available",
    ]);
    await expect(availability).toContainText("ENTROPY_SEMANTICS_UNCLOSED");
    await expect(availability).toContainText("No score has been substituted.");
  });

  test("C6-06 renders all 80 verified moves in exact server order", async ({ page }) => {
    await routeEvaluationFixture(page, createC6LongSolutionFixture());
    await runFixtureEvaluation(page);

    const rendered = await page.locator("[data-move-token]").evaluateAll((moves) =>
      moves.map((move) => ({
        index: Number(move.getAttribute("data-move-index")),
        token: move.getAttribute("data-move-token"),
      }))
    );
    expect(rendered).toEqual(
      C6_LONG_SOLUTION_MOVES.map((token, index) => ({ index, token }))
    );
  });

  test("C6-07 separates cube, verified-solution, Human-State, and Demand trace planes", async ({ page }) => {
    await routeEvaluationFixture(page, createC6NonSolvedFixture());
    await runFixtureEvaluation(page);

    const trace = page.getByRole("region", { name: "Trace and provenance" });
    await expect(trace).toContainText(
      "Cube-state transitions and verified solution moves do not prove human execution."
    );
    await expect(trace.getByText("Trace Level 1 · Summary", { exact: true })).toBeVisible();
    await trace.getByRole("button", { name: "Show Trace Level 2 identifiers" }).click();
    await expect(trace.getByText("Cube-state boundary", { exact: true }).first()).toBeVisible();
    await expect(
      trace.getByText("Verified solution transition", { exact: true }).first()
    ).toBeVisible();
    await expect(
      trace.getByText("Human-State observation boundary", { exact: true }).first()
    ).toBeVisible();
    await expect(
      trace.getByText("Domain Demand provenance", { exact: true }).first()
    ).toBeVisible();
    await expect(trace.getByText("Human-State Transition", { exact: true })).toHaveCount(0);
  });

  test("C6-08 paginates a 501-source trace in bounded 50-row pages", async ({ page }) => {
    await routeEvaluationFixture(page, createC6LargeTraceFixture());
    await runFixtureEvaluation(page);

    const trace = page.getByRole("region", { name: "Trace and provenance" });
    await trace.getByRole("button", { name: "Show Trace Level 2 identifiers" }).click();
    await expect(trace.getByText("509 records", { exact: true })).toBeVisible();
    await expect(trace.getByTestId("trace-row")).toHaveCount(50);
    await expect(trace.getByText("Page 1 of 11", { exact: true })).toBeVisible();
    await trace.getByRole("button", { name: "Next trace page" }).click();
    await expect(trace.getByText("Page 2 of 11", { exact: true })).toBeVisible();
    await expect(trace.getByTestId("trace-row")).toHaveCount(50);
  });

  test("C6-09 exposes one selected structured Level 3 record at a time", async ({ page }) => {
    await routeEvaluationFixture(page, createC6SolvedFixture());
    await runFixtureEvaluation(page);

    const trace = page.getByRole("region", { name: "Trace and provenance" });
    await trace.getByRole("button", { name: "Show Trace Level 2 identifiers" }).click();
    const details = trace.getByRole("button", {
      name: /^View technical details for/,
    });
    await details.first().click();
    await expect(trace.getByTestId("trace-level-3")).toHaveCount(1);
    await expect(trace.getByTestId("trace-level-3")).toContainText("Request ID");
    await expect(trace.getByTestId("trace-level-3")).toContainText("Build commit");
    await details.nth(1).click();
    await expect(trace.getByTestId("trace-level-3")).toHaveCount(1);
  });

  test("C6-10 preserves semantic reading order and reflows at 360px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await routeEvaluationFixture(page, createC6SolvedFixture());
    await runFixtureEvaluation(page);

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
      )
    ).toBe(true);

    const headings = await page
      .getByTestId("demand-channel-sequence")
      .locator("h4")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          return { x: box.x, y: box.y };
        })
      );
    expect(headings.map(({ y }) => y)).toEqual(
      [...headings.map(({ y }) => y)].sort((left, right) => left - right)
    );
    expect(Math.max(...headings.map(({ x }) => x)) - Math.min(...headings.map(({ x }) => x))).toBeLessThan(8);

    const sectionOrder = await Promise.all(
      ["Verified solution", "Domain Demand", "Downstream availability", "Trace and provenance"].map(
        async (name) =>
          (await page.getByRole("region", { name }).boundingBox())?.y ?? -1
      )
    );
    expect(sectionOrder).toEqual(
      [...sectionOrder].sort((left, right) => left - right)
    );
  });

  test("C6-11 supports keyboard disclosure, selection, and trace pagination", async ({ page }) => {
    await routeEvaluationFixture(page, createC6LargeTraceFixture());
    await runFixtureEvaluation(page);

    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("button", { name: "Show solution technical details" })
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Show T1 provenance" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Show T2 provenance" })).toBeFocused();
    await page.keyboard.press("Tab");
    const traceToggle = page.locator('button[aria-controls="trace-level-2"]');
    await expect(traceToggle).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(traceToggle).toHaveAttribute("aria-expanded", "true");

    for (let index = 0; index < 51; index += 1) {
      await page.keyboard.press("Tab");
    }
    const nextPage = page.getByRole("button", { name: "Next trace page" });
    await expect(nextPage).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Page 2 of 11", { exact: true })).toBeVisible();
  });

  test("C6-12 invalidates the committed result after any draft edit", async ({ page }) => {
    await routeEvaluationFixture(page, createC6SolvedFixture());
    await runFixtureEvaluation(page);
    await expect(page.getByTestId("result-shell")).toBeVisible();

    await page.getByRole("radio", { name: /R Red/ }).check();
    await page.locator('[data-sticker-index="0"]').click();
    await expect(page.getByTestId("result-shell")).toHaveCount(0);
  });

  test("C6 real local API renders a solved evaluation response", async ({ page }) => {
    test.setTimeout(60_000);

    await runFixtureEvaluation(page);

    await expect(page.getByText("No moves required", { exact: true })).toBeVisible();
    await expect(page.getByTestId("status-only-channel")).toHaveCount(4);
    await expect(page.locator('[data-status="NOT_OBSERVED"]')).toHaveCount(7);
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
    const encodedRootJs = scripts.reduce(
      (total, resource) => total + resource.encodedBodySize,
      0
    );
    const decodedRootJs = scripts.reduce(
      (total, resource) => total + resource.decodedBodySize,
      0
    );

    expect(names).not.toMatch(
      /onnxruntime|cube_pose\.onnx|\.wasm(?:\?|$)|\/detect(?:\?|$)/i
    );
    await expect(page.locator('a[href="/detect"]')).toHaveCount(1);
    expect(encodedRootJs).toBeLessThanOrEqual(250 * 1024);
    expect(decodedRootJs).toBeLessThanOrEqual(800 * 1024);
  });
});
