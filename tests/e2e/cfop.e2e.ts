import { expect, test, type Page } from "@playwright/test";

import { applyMoves } from "../../src/lib/cube/moves";
import { createC6SolvedFixture } from "../fixtures/c6PresentationFixtures";
import {
  expectNoWcagViolations,
  loadSolvedExample,
} from "./helpers/c7c2";

const SOLVED_FACELETS =
  "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

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

async function showEvaluation(page: Page): Promise<void> {
  await page.route("**/api/evaluate", async (route) => {
    await route.fulfill({ json: createC6SolvedFixture(), status: 200 });
  });
  await page.goto("/");
  await loadSolvedExample(page);
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
