import { expect, test } from "@playwright/test";

import { createC6SolvedFixture } from "../fixtures/c6PresentationFixtures";
import { loadSolvedExample } from "./helpers/c7c2";

test.describe("Saved Analysis V1 anonymous boundary", () => {
  test("keeps anonymous evaluation usable and offers sign-in after success", async ({ page }) => {
    await page.route("**/api/evaluate", (route) =>
      route.fulfill({ json: createC6SolvedFixture(), status: 200 })
    );
    await page.goto("/");
    await loadSolvedExample(page);
    await page.getByRole("button", { name: "Run evaluation" }).click();
    await expect(page.getByRole("heading", { name: "Evaluation result" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Save this analysis" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in to save analyses" }).last()
    ).toBeVisible();
  });

  test("protects saved pages without adding a root login wall", async ({ page }) => {
    await page.goto("/saved");
    await expect(page.getByRole("heading", { name: "Sign in to view saved analyses" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in to save analyses" })).toBeVisible();

    await page.goto("/");
    await expect(page.getByRole("button", { name: "Run evaluation" })).toBeVisible();
    await page.goto("/detect");
    await expect(page.getByRole("button", { name: "Start camera" })).toBeVisible();
  });

  test("saved-analysis APIs fail unauthenticated before storage", async ({ request }) => {
    const responses = await Promise.all([
      request.get("/api/saved-analyses"),
      request.post("/api/saved-analyses", {
        data: {
          schemaVersion: "1.0",
          cubeState: {
            format: "URFDLB_FACELETS_V1",
            facelets: "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB",
          },
          includeCfop: false,
        },
      }),
      request.get("/api/saved-analyses/11111111-1111-4111-8111-111111111111"),
      request.delete("/api/saved-analyses/11111111-1111-4111-8111-111111111111"),
    ]);
    for (const response of responses) {
      expect(response.status()).toBe(401);
      expect(await response.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
      expect(response.headers()["cache-control"]).toBe("no-store");
    }
  });
});
