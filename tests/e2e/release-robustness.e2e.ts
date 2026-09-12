import { expect, test, type Page } from "@playwright/test";

import { applyMoves } from "../../src/lib/cube/moves";
import {
  createC6SolvedFixture,
  createC6StatusOnlyFixture,
} from "../fixtures/c6PresentationFixtures";

const SOLVED_FACELETS =
  "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
const R_TURN_FACELETS = applyMoves(SOLVED_FACELETS, ["R"]);
const FACE_NAMES = {
  U: "White",
  R: "Red",
  F: "Green",
  D: "Yellow",
  L: "Orange",
  B: "Blue",
} as const;

async function loadSolvedExample(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Load solved example" }).click();
  await expect(
    page
      .getByRole("region", { name: "Enter the cube state" })
      .getByText("Ready for server validation", { exact: true })
  ).toBeVisible();
}

async function runEvaluation(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Run evaluation" }).click();
}

async function replaceSolvedDraftWith(
  page: Page,
  targetFacelets: string
): Promise<void> {
  for (const token of Object.keys(FACE_NAMES) as Array<keyof typeof FACE_NAMES>) {
    const changedIndexes = [...targetFacelets]
      .map((target, index) => ({ index, target }))
      .filter(
        ({ index, target }) =>
          target === token && target !== SOLVED_FACELETS[index]
      )
      .map(({ index }) => index);

    if (changedIndexes.length === 0) continue;

    await page
      .getByRole("radio", { name: `${token} ${FACE_NAMES[token]}` })
      .check();
    for (const index of changedIndexes) {
      await page.locator(`[data-sticker-index="${index}"]`).click();
    }
  }

  await expect(
    page
      .getByRole("region", { name: "Enter the cube state" })
      .getByText("Ready for server validation", { exact: true })
  ).toBeVisible();
}

const atomicBrowserFaults = [
  {
    code: "SOLUTION_VERIFICATION_FAILED",
    status: 502,
    stage: "VERIFICATION",
    title: "Solution verification failed",
    explanation: "The returned solution could not be independently verified.",
    retryable: true,
  },
  {
    code: "TRANSITION_GENERATION_FAILED",
    status: 500,
    stage: "TRANSITION",
    title: "Transition generation failed",
    explanation:
      "The verified solution could not be converted into a transition trace.",
    retryable: false,
  },
  {
    code: "DEMAND_CONTRACT_FAILED",
    status: 500,
    stage: "DEMAND",
    title: "Demand generation failed",
    explanation: "A valid Domain Demand artifact could not be produced.",
    retryable: false,
  },
] as const;

test.describe("C7-B release robustness", () => {
  for (const fault of atomicBrowserFaults) {
    test(`B-04 presents ${fault.code} safely and invalidates prior success`, async ({
      page,
    }) => {
      const rawDiagnostic =
        "/private/server/fault.ts: raw stack; UUUUUUUUURRRRRRRRR";
      let requestCount = 0;

      await page.route("**/api/evaluate", async (route) => {
        requestCount += 1;
        if (requestCount === 1) {
          await route.fulfill({ json: createC6SolvedFixture(), status: 200 });
          return;
        }
        await route.fulfill({
          json: {
            schemaVersion: "1.0",
            requestId: `request:b04:${fault.code.toLowerCase()}`,
            error: {
              code: fault.code,
              message: rawDiagnostic,
              stage: fault.stage,
              retryable: fault.retryable,
            },
          },
          status: fault.status,
        });
      });

      await page.goto("/");
      await loadSolvedExample(page);
      await runEvaluation(page);
      await expect(page.getByTestId("result-shell")).toBeVisible();

      await runEvaluation(page);

      const summary = page.getByTestId("error-summary");
      await expect(page.getByTestId("result-shell")).toHaveCount(0);
      await expect(summary).toBeFocused();
      await expect(summary).toContainText(fault.code);
      await expect(summary).toContainText(fault.title);
      await expect(summary).toContainText(fault.explanation);
      await expect(summary).toContainText("Your cube draft has been preserved.");
      await expect(summary).not.toContainText(rawDiagnostic);
      await expect(page.locator("body")).not.toContainText("fault.ts");
      await expect(
        page.locator('[data-sticker-editable="true"][data-token="N"]')
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Run evaluation" })
      ).toBeEnabled();
      await expect(
        summary.getByRole("button", { name: "Try again" })
      ).toHaveCount(fault.retryable ? 1 : 0);
    });
  }

  test("B-05 commits only B when cancelled A completes after a rapid resubmit", async ({
    page,
  }) => {
    let requestCount = 0;
    let releaseA: () => void = () => undefined;
    const aResponseGate = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const submittedFacelets: string[] = [];

    await page.goto("/");
    await page.evaluate(() => {
      const nativeFetch = window.fetch.bind(window);
      const observedWindow = window as typeof window & {
        __c7bAbortCount: number;
      };
      observedWindow.__c7bAbortCount = 0;
      window.fetch = (input, init) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;

        if (url.endsWith("/api/evaluate") && init?.signal != null) {
          init.signal.addEventListener(
            "abort",
            () => {
              observedWindow.__c7bAbortCount += 1;
            },
            { once: true }
          );
        }
        return nativeFetch(input, init);
      };
    });
    await page.route("**/api/evaluate", async (route) => {
      requestCount += 1;
      const body = route.request().postDataJSON() as {
        cubeState: { facelets: string };
      };
      submittedFacelets.push(body.cubeState.facelets);

      if (requestCount === 1) {
        await aResponseGate;
        await route
          .fulfill({
            json: createC6StatusOnlyFixture({ requestId: "request:b05:a" }),
            status: 200,
          })
          .catch(() => undefined);
        return;
      }

      await route.fulfill({
        json: createC6StatusOnlyFixture({ requestId: "request:b05:b" }),
        status: 200,
      });
    });

    await loadSolvedExample(page);
    await runEvaluation(page);
    await expect(page.getByTestId("request-status")).toBeVisible();
    await page.getByRole("button", { name: "Cancel request" }).click();
    await replaceSolvedDraftWith(page, R_TURN_FACELETS);
    await expect(
      page.getByRole("button", { name: "Run evaluation" })
    ).toBeEnabled();
    await runEvaluation(page);

    await expect(
      page.getByRole("heading", { name: "Evaluation result", level: 2 })
    ).toBeFocused();
    await expect(page.getByTestId("result-shell")).toContainText(
      "request:b05:b"
    );
    releaseA();
    await page.waitForTimeout(300);

    expect(requestCount).toBe(2);
    expect(submittedFacelets).toEqual([SOLVED_FACELETS, R_TURN_FACELETS]);
    expect(
      await page.evaluate(
        () =>
          (window as typeof window & { __c7bAbortCount: number })
            .__c7bAbortCount
      )
    ).toBe(1);
    await expect(page.getByTestId("result-shell")).toHaveCount(1);
    await expect(page.getByTestId("result-shell")).toContainText(
      "request:b05:b"
    );
    await expect(page.getByTestId("result-shell")).not.toContainText(
      "request:b05:a"
    );
    await expect(page.getByTestId("error-summary")).toHaveCount(0);
    await expect(page.getByTestId("cancelled-status")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Run evaluation" })
    ).toBeEnabled();
  });

  test("B-06 renders, focuses, and resets the App Router error boundary", async ({
    page,
  }) => {
    const rawDiagnostic =
      "/Users/private/workbench.tsx:77 digest=unsafe raw-facelets";
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
          const injectedStart = `${functionStart}if(globalThis.__c7bRenderFaultArmed){globalThis.__c7bRenderFaultConsumed=true;throw new Error(${JSON.stringify(rawDiagnostic)});}`;
          body = body.replace(functionStart, injectedStart);
          renderFaultInjected = true;
        }
      }

      await route.fulfill({ response, body });
    });

    await page.goto("/");

    await expect.poll(() => renderFaultInjected).toBe(true);
    await page.evaluate(() => {
      (globalThis as typeof globalThis & { __c7bRenderFaultArmed: boolean })
        .__c7bRenderFaultArmed = true;
    });
    await page.getByRole("button", { name: "Load solved example" }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            Boolean(
              (globalThis as typeof globalThis & {
                __c7bRenderFaultConsumed?: boolean;
              }).__c7bRenderFaultConsumed
            )
        )
      )
      .toBe(true);
    await expect(
      page.getByRole("heading", { name: "Evaluator unavailable", level: 1 })
    ).toBeVisible();
    const retry = page.getByRole("button", { name: "Retry evaluator" });
    await expect(retry).toBeFocused();
    await expect(
      page.getByRole("alert", { name: "Evaluator unavailable" })
    ).toContainText("No result was committed.");
    await expect(
      page.getByRole("link", { name: "Return to manual cube entry" })
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(rawDiagnostic);
    await expect(page.locator("body")).not.toContainText("digest=unsafe");
    await expect(page.locator("body")).not.toContainText("raw-facelets");

    await page.evaluate(() => {
      (globalThis as typeof globalThis & { __c7bRenderFaultArmed: boolean })
        .__c7bRenderFaultArmed = false;
    });
    await retry.click();
    await expect(
      page.getByRole("heading", {
        name: "HCA Speedcubing Evaluator",
        level: 1,
      })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Evaluator unavailable" })
    ).toHaveCount(0);
    await page.waitForTimeout(200);
    await expect(
      page.getByRole("heading", { name: "Evaluator unavailable" })
    ).toHaveCount(0);
  });

  test("B-07 keeps test-auth variants and internal control routes absent", async ({
    request,
  }) => {
    const initialCookies = (await request.storageState()).cookies;
    const absentRoutes = [
      "/api/test/auth",
      "/api/test/auth/",
      "/api/test/auth?x=1",
      "/api/fault",
      "/api/solve",
      "/api/save",
      "/api/auth",
      "/api/debug/solver",
    ];

    for (const path of absentRoutes) {
      const response = await request.get(path, { maxRedirects: 0 });
      const body = await response.text();

      expect([404, 308], path).toContain(response.status());
      expect(response.ok(), path).toBe(false);
      expect(response.headers()["set-cookie"], path).toBeUndefined();
      expect(body, path).not.toMatch(
        /authenticated\s*[:=]|session(?:Id|Token)\s*[:=]|test[-_ ]payload|fault[-_ ]enabled/i
      );
    }

    expect((await request.storageState()).cookies).toEqual(initialCookies);
  });

  test("B-08 serves root, scanner shell, and two real API solves from one artifact", async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000);

    const root = await page.goto("/");
    const detect = await request.get("/detect");
    expect(root?.status()).toBe(200);
    await expect(
      page.getByRole("heading", {
        name: "HCA Speedcubing Evaluator",
        level: 1,
      })
    ).toBeVisible();

    const rootResources = await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
    );
    expect(rootResources.join("\n")).not.toMatch(
      /onnxruntime|cube_pose\.onnx|\.wasm(?:\?|$)|\/detect(?:\?|$)/i
    );

    const rootClientSource = (
      await Promise.all(
        rootResources
          .filter((url) => /\/_next\/static\/chunks\/.*\.js(?:\?|$)/.test(url))
          .map(async (url) => (await page.request.get(url)).text())
      )
    ).join("\n");
    expect(rootClientSource).not.toMatch(
      /scannerWorkerV1|onnxruntime|cube_pose|CubeJsWorkerPoolV1|CubeJsSolverV1|EvaluatorPipeline|StatusOnlyDomainDemandProducerV1/
    );

    expect(detect.status()).toBe(200);
    expect(await detect.text()).toContain("Reviewable cube camera draft");

    for (const [label, facelets] of [
      ["solved", SOLVED_FACELETS],
      ["non-solved", R_TURN_FACELETS],
    ] as const) {
      const response = await request.post("/api/evaluate", {
        data: {
          schemaVersion: "1.0",
          cubeState: {
            format: "URFDLB_FACELETS_V1",
            facelets,
          },
        },
      });
      const payload = (await response.json()) as {
        requestId: string;
        result: {
          solution: { moves: string[]; verified: boolean };
          domainDemand: { schemaId: string };
        };
      };

      expect(response.status(), label).toBe(200);
      expect(payload.requestId, label).toMatch(/^request:/);
      expect(payload.result.solution.verified, label).toBe(true);
      if (label === "solved") {
        expect(payload.result.solution.moves).toEqual([]);
      } else {
        expect(payload.result.solution.moves.length).toBeGreaterThan(0);
      }
      expect(
        applyMoves(facelets, payload.result.solution.moves),
        label
      ).toBe(SOLVED_FACELETS);
      expect(payload.result.domainDemand.schemaId, label).toBe("SPEC-DM-001");
    }
  });
});
