import { test, expect } from "@playwright/test";
import { applyMoves, SOLVED_STATE } from "../../src/lib/cube/moves";

const SCRAMBLED = applyMoves(SOLVED_STATE, ["R", "U", "F2", "L"]);

test.describe("CFOP Solver", () => {
  test.beforeEach(async ({ page }) => { await page.goto("/solver"); });

  test("complete solve displays four phases and synchronized cube states", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "CFOP Solver" })).toBeVisible();
    await page.getByTestId("state-string-input").fill(SCRAMBLED);
    await page.getByRole("button", { name: /Solve/ }).click();
    await expect(page.getByTestId("solve-result")).toBeVisible();
    await expect(page.getByText("完成を検証済み")).toBeVisible();
    for (const phase of ["CROSS", "F2L", "OLL", "PLL"]) await expect(page.getByText(phase, { exact: true })).toBeVisible();
    const start = await page.locator(".state-code").textContent();
    await page.getByTestId("next-step-button").click();
    await expect(page.getByTestId("current-step")).not.toHaveText("開始状態");
    expect(await page.locator(".state-code").textContent()).not.toBe(start);
    await page.getByTestId("previous-step-button").click();
    await expect(page.locator(".state-code")).toHaveText(SCRAMBLED);
  });

  test("partial solve stops at Cross and shows the exact evaluator input", async ({ page }) => {
    await page.getByTestId("state-string-input").fill(SCRAMBLED);
    await page.getByLabel("部分解").check();
    await page.getByRole("button", { name: /Solve/ }).click();
    await expect(page.getByTestId("solve-result")).toBeVisible();
    await expect(page.getByText(/CROSS に到達/)).toBeVisible();
    await expect(page.getByText("PLL", { exact: true })).toHaveCount(0);
    const moves = await page.getByTestId("moves-display").textContent();
    await expect(page.locator(".evaluated-moves")).toHaveText(`評価対象: ${moves}`);
  });

  test("solved and invalid input are distinct", async ({ page }) => {
    await page.getByRole("button", { name: /Solve/ }).click();
    await expect(page.getByText("目標達成済み · 手順なし").first()).toBeVisible();
    await page.getByTestId("state-string-input").fill("short");
    await page.getByRole("button", { name: /Solve/ }).click();
    await expect(page.getByRole("alert")).toContainText("入力形式または色数");
  });

  test("mobile layout has no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId("state-string-input").fill(SCRAMBLED);
    await page.getByRole("button", { name: /Solve/ }).click();
    await expect(page.getByTestId("solve-result")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.getByTestId("next-step-button")).toBeVisible();
  });
});
