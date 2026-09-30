import { expect, test, type Route } from "@playwright/test";

import { createC6SolvedFixture } from "../fixtures/c6PresentationFixtures";
import {
  expectNoDocumentOverflow,
  loadSolvedExample,
} from "./helpers/c7c2";

async function handleSignInRoute(route: Route): Promise<void> {
  const url = new URL(route.request().url());
  if (url.pathname === "/api/auth/providers") {
    await route.fulfill({
      json: {
        github: {
          id: "github",
          name: "GitHub",
          type: "oauth",
          signinUrl: "/api/auth/signin/github",
          callbackUrl: "/api/auth/callback/github",
        },
      },
    });
    return;
  }
  if (url.pathname === "/api/auth/csrf") {
    await route.fulfill({ json: { csrfToken: "bounded-csrf-token" } });
    return;
  }
  if (url.pathname === "/api/auth/signin/github") {
    await route.fulfill({ json: { url: "/?auth=github" } });
    return;
  }
  await route.fallback();
}

test.describe("Procedure Logger V1 UI", () => {
  test("offers verified-solution saving without anonymous storage writes", async ({ page }) => {
    let writes = 0;
    await page.route("**/api/evaluate", (route) =>
      route.fulfill({ json: createC6SolvedFixture(), status: 200 }));
    await page.route("**/api/procedure-logs", (route) => {
      if (route.request().method() === "POST") writes += 1;
      return route.abort();
    });
    await page.route("**/api/auth/**", handleSignInRoute);

    await page.goto("/");
    await loadSolvedExample(page);
    await page.getByRole("button", { name: "Run evaluation" }).click();
    const verified = page.getByRole("region", { name: "Verified solution" });
    const signIn = verified.getByRole("button", { name: "Sign in to save procedure" });
    await expect(signIn).toBeVisible();
    expect(writes).toBe(0);
    await signIn.click();
    await expect(page).toHaveURL(/\?auth=github$/);
    expect(writes).toBe(0);
  });

  test("exposes compact navigation and the signed-out procedure boundary", async ({ page }) => {
    await page.goto("/logs");
    await expect(page.getByRole("heading", { name: "Sign in to view saved procedures" })).toBeVisible();
    for (const [name, path] of [
      ["Evaluate", "/"],
      ["Scanner", "/detect"],
      ["Saved", "/saved"],
      ["Procedures", "/logs"],
    ] as const) {
      await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name }))
        .toHaveAttribute("href", path);
    }
    await expect(page.getByText("Account", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in to save", exact: true })).toBeVisible();
  });

  test("keeps input and navigation usable at the freeze viewports", async ({ page }) => {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1280, height: 800 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
      { width: 360, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
      await expect(page.getByTestId("cube-net-editor")).toBeVisible();
      await expect(page.getByRole("button", { name: "Run evaluation" })).toBeVisible();
      await expectNoDocumentOverflow(page);
    }
  });
});
