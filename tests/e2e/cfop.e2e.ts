import { expect, test, type Page } from "@playwright/test";

import { applyMoves } from "../../src/lib/cube/moves";
import { CFOPAlternativesServiceV1 } from "../../src/lib/integration/CFOPAlternativesServiceV1";
import { createC6SolvedFixture } from "../fixtures/c6PresentationFixtures";
import {
  expectNoWcagViolations,
  loadSolvedExample,
} from "./helpers/c7c2";

const SOLVED_FACELETS =
  "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

const FACE_NAMES = {
  U: "White",
  R: "Red",
  F: "Green",
  D: "Yellow",
  L: "Orange",
  B: "Blue",
} as const;

async function enterCubeState(page: Page, targetFacelets: string): Promise<void> {
  for (const token of Object.keys(FACE_NAMES) as Array<keyof typeof FACE_NAMES>) {
    const changedIndexes = [...targetFacelets]
      .map((target, index) => ({ index, target }))
      .filter(({ index, target }) =>
        target === token && target !== SOLVED_FACELETS[index])
      .map(({ index }) => index);
    if (changedIndexes.length === 0) continue;

    await page.getByRole("radio", { name: `${token} ${FACE_NAMES[token]}` }).check();
    for (const index of changedIndexes) {
      await page.locator(`[data-sticker-index="${index}"]`).click();
    }
  }
}

function cfopSuccessFixture(moves: readonly string[] = []) {
  const qtm = moves.reduce(
    (total, move) => total + (move.endsWith("2") ? 2 : 1),
    0
  );
  const phase = (name: "CROSS" | "F2L" | "OLL" | "PLL", phaseMoves: readonly string[]) => ({
    phase: name,
    moves: phaseMoves,
    htm: phaseMoves.length,
    qtm: phaseMoves.reduce(
      (total, move) => total + (move.endsWith("2") ? 2 : 1),
      0
    ),
    verified: true,
  });

  return {
    schemaVersion: "1.0",
    requestId: "cfop-request:e2e",
    result: {
      schemaId: "CFOPSolutionV1",
      schemaVersion: "1.0",
      input: {
        stateId: "cube-state:e2e",
        format: "URFDLB_FACELETS_V1",
        inputMode: "FACELET_STATE",
      },
      method: {
        id: "CFOP",
        version: "1.0",
        orientation: "D_CROSS_U_LAST_LAYER",
        historyUsage: "NONE",
      },
      phases: {
        cross: phase("CROSS", moves),
        f2l: {
          ...phase("F2L", []),
          slots: ["FR", "FL", "BR", "BL"].map((slot) => ({
            slot,
            moves: [],
            htm: 0,
            qtm: 0,
          })),
          solvedOrder: [],
        },
        oll: phase("OLL", []),
        pll: phase("PLL", []),
      },
      solution: { moves, htm: moves.length, qtm, verified: true },
      timings: { durationMs: 4 },
    },
  };
}

async function showEvaluation(
  page: Page,
  facelets = SOLVED_FACELETS,
): Promise<void> {
  await page.route("**/api/evaluate", async (route) => {
    await route.fulfill({ json: createC6SolvedFixture(), status: 200 });
  });
  await page.goto("/");
  await loadSolvedExample(page);
  if (facelets !== SOLVED_FACELETS) await enterCubeState(page, facelets);
  await page.getByRole("button", { name: "Run evaluation" }).click();
  await expect(page.getByRole("heading", { name: "Evaluation result" })).toBeFocused();
}

test.describe("public facelet-native CFOP workflow", () => {
  test("sends one closed request and renders a semantically separate solved result", async ({
    page,
  }) => {
    let requestCount = 0;
    await page.route("**/api/cfop", async (route) => {
      requestCount += 1;
      expect(route.request().method()).toBe("POST");
      expect(route.request().postDataJSON()).toEqual({
        schemaVersion: "1.0",
        inputMode: "FACELET_STATE",
        cubeState: {
          format: "URFDLB_FACELETS_V1",
          facelets: SOLVED_FACELETS,
        },
      });
      await route.fulfill({ json: cfopSuccessFixture(), status: 200 });
    });

    await showEvaluation(page);
    await expect(page.getByText("No scramble or observed cube history is reconstructed.")).toBeVisible();
    await page.getByRole("button", { name: "Generate CFOP solution" }).click();

    await expect(page.getByRole("heading", { name: "Verified CFOP phase solution" })).toBeFocused();
    await expect(page.getByTestId("cfop-result")).toContainText("Total HTM");
    await expect(page.getByTestId("cfop-result")).toContainText("No moves required");
    await expect(page.getByTestId("cfop-result")).not.toContainText("Demand");
    expect(requestCount).toBe(1);
    await expectNoWcagViolations(page, "solved facelet-native CFOP result");
  });

  test("cancels one active CFOP request and preserves the evaluation", async ({ page }) => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/cfop", async (route) => {
      await gate;
      await route.fulfill({ json: cfopSuccessFixture(), status: 200 }).catch(() => undefined);
    });

    await showEvaluation(page);
    await page.getByRole("button", { name: "Generate CFOP solution" }).click();
    await expect(page.getByTestId("cfop-request-status")).toBeVisible();
    await page.getByRole("button", { name: "Cancel CFOP request" }).click();
    await expect(page.getByTestId("cfop-cancelled-status")).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate CFOP solution" })).toBeFocused();
    await expect(page.getByTestId("result-shell")).toBeVisible();
    release();
  });

  test("requests verified alternatives only on demand and compares every phase", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const facelets = applyMoves(SOLVED_FACELETS, ["R", "U"]);
    const service = new CFOPAlternativesServiceV1({ now: () => 25 });
    let alternativesRequestCount = 0;

    await page.route("**/api/cfop", async (route) => {
      await route.fulfill({ json: cfopSuccessFixture(), status: 200 });
    });
    await page.route("**/api/cfop/alternatives", async (route) => {
      alternativesRequestCount += 1;
      expect(route.request().method()).toBe("POST");
      expect(route.request().postDataJSON()).toEqual({
        schemaVersion: "1.0",
        inputMode: "FACELET_STATE",
        cubeState: { format: "URFDLB_FACELETS_V1", facelets },
        maxAlternatives: 3,
      });
      await route.fulfill({
        json: service.execute(route.request().postDataJSON()),
        status: 200,
      });
    });

    await showEvaluation(page, facelets);
    await page.getByRole("button", { name: "Generate CFOP solution" }).click();
    await expect(page.getByRole("heading", { name: "Verified CFOP phase solution" }))
      .toBeFocused();
    expect(alternativesRequestCount).toBe(0);

    await page.getByRole("button", { name: "Compare verified alternatives" }).click();
    await expect(page.getByRole("heading", { name: "Verified solution alternatives" }))
      .toBeVisible();
    expect(alternativesRequestCount).toBe(1);

    const comparison = page.getByTestId("cfop-alternatives-result");
    await expect(comparison).toContainText("Current solver result");
    await expect(comparison).toContainText("Alternative 2");
    await expect(comparison).toContainText("Complete move sequence");
    await expect(page.getByText(
      "These alternatives compare verified cube-solution paths only. They are not Human-State or Domain-Demand evaluations.",
    )).toBeVisible();

    await page.getByRole("button", { name: "Cross", exact: true }).click();
    await expect(comparison).toContainText("HTM");
    await page.getByRole("button", { name: "F2L", exact: true }).click();
    await expect(comparison).toContainText("Solved order:");
    await expect(comparison).toContainText("Macro IDs:");
    await page.getByRole("button", { name: "OLL", exact: true }).click();
    await expect(comparison).toContainText("Case ID");
    await expect(comparison).toContainText("Algorithm IDs");
    await page.getByRole("button", { name: "PLL", exact: true }).click();
    await expect(comparison).toContainText("Case ID");
    await page.getByRole("button", { name: "Full", exact: true }).click();
    await expect(comparison).toContainText("Total QTM");

    await expect(comparison).not.toContainText(/Best|Recommended|Optimal for humans|Easiest|Fastest for humans/);
    await expectNoWcagViolations(page, "verified CFOP alternatives comparison");
  });

  test("maps backend and verification failures without exposing server details", async ({ page }) => {
    const cases = [
      ["CFOP_UNAVAILABLE", "CFOP", 503, "CFOP solver unavailable"],
      ["CFOP_VERIFICATION_FAILED", "VERIFICATION", 502, "CFOP verification failed"],
    ] as const;

    for (const [code, stage, status, title] of cases) {
      await page.unroute("**/api/cfop").catch(() => undefined);
      await page.route("**/api/cfop", async (route) => {
        await route.fulfill({
          json: {
            schemaVersion: "1.0",
            requestId: `cfop-request:${code}`,
            error: {
              code,
              message: "/private/backend stack detail",
              stage,
              retryable: true,
            },
          },
          status,
        });
      });

      await showEvaluation(page);
      await page.getByRole("button", { name: "Generate CFOP solution" }).click();
      const summary = page.getByTestId("cfop-error-summary");
      await expect(summary).toBeFocused();
      await expect(summary).toContainText(title);
      await expect(summary).not.toContainText("backend stack detail");
      await expect(summary.getByRole("button", { name: "Try CFOP again" })).toBeVisible();
    }
  });

  test("real production route handles solved, non-solved, invalid, and unsupported input", async ({
    request,
  }) => {
    test.setTimeout(60_000);
    const nonSolved = applyMoves(SOLVED_FACELETS, ["R", "U"]);

    for (const facelets of [SOLVED_FACELETS, nonSolved]) {
      const response = await request.post("/api/cfop", {
        data: {
          schemaVersion: "1.0",
          inputMode: "FACELET_STATE",
          cubeState: { format: "URFDLB_FACELETS_V1", facelets },
        },
      });
      expect(response.status()).toBe(200);
      const payload = await response.json();
      expect(payload.result.solution.verified).toBe(true);
      expect(applyMoves(facelets, payload.result.solution.moves)).toBe(SOLVED_FACELETS);
    }

    const invalid = await request.post("/api/cfop", {
      data: {
        schemaVersion: "1.0",
        inputMode: "FACELET_STATE",
        cubeState: { format: "URFDLB_FACELETS_V1", facelets: "U".repeat(54) },
      },
    });
    expect(invalid.status()).toBe(422);
    expect((await invalid.json()).error.code).toBe("INVALID_CUBE_STATE");

    const unsupported = await request.post("/api/cfop", {
      data: {
        schemaVersion: "1.0",
        inputMode: "SCRAMBLE_HISTORY",
        cubeState: { format: "URFDLB_FACELETS_V1", facelets: SOLVED_FACELETS },
      },
    });
    expect(unsupported.status()).toBe(422);
    expect((await unsupported.json()).error.code).toBe("UNSUPPORTED_INPUT_MODE");
  });
});
