import { expect, test, type Route } from "@playwright/test";

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
    expect(route.request().method()).toBe("POST");
    expect(route.request().postData()).toContain("csrfToken=bounded-csrf-token");
    await route.fulfill({ json: { url: "/?auth=github" } });
    return;
  }
  await route.fallback();
}

test.describe("Auth V1 optional account control", () => {
  test("keeps the anonymous evaluator usable and starts only GitHub sign-in", async ({
    page,
  }) => {
    await page.route("**/api/auth/**", handleSignInRoute);
    await page.goto("/");

    const signIn = page.getByRole("button", { name: "Sign in to save analyses" });
    await expect(signIn).toBeVisible();
    await page.getByRole("button", { name: "Load solved example" }).click();
    await expect(page.getByRole("button", { name: "Run evaluation" })).toBeEnabled();

    await signIn.click();
    await expect(page).toHaveURL(/\?auth=github$/);
  });
});
