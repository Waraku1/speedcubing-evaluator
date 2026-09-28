import { test, expect } from "@playwright/test";

test.use({ channel: "chrome", video: "off" });

const SOLVED = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

test("edited six-face detect state validates and transfers to solver", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/detect");
  await expect(page.getByRole("heading", { name: "Cube Detection System" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Net View" })).toBeVisible();
  await expect(page.getByRole("button", { name: "3D View" })).toBeVisible();

  async function setSticker(face: string, index: number, color: string) {
    const cell = page.locator(`[data-face="${face}"] [data-sticker-index="${index}"]`);
    await cell.click();
    await cell.locator(`[data-color="${color}"]`).click();
  }

  for (const face of "URFDLB") {
    for (let index = 0; index < 9; index++) {
      if (index !== 4) await setSticker(face, index, face);
    }
  }
  const transfer = page.getByRole("button", { name: "Solverで解く" });
  await expect(transfer).toBeEnabled();

  await setSticker("U", 0, "R");
  await transfer.click();
  await expect(page).toHaveURL(/\/detect$/);
  await expect(page.locator("p[role=alert]")).toContainText("キューブ状態が成立しません");

  await setSticker("U", 0, "U");
  await transfer.click();
  await expect(page).toHaveURL(/\/solver$/);
  await expect(page.getByTestId("state-string-input")).toHaveValue(SOLVED);
  await expect(page.locator(".state-code")).toHaveText(SOLVED);
  await page.getByLabel("部分解").check();
  await expect(page.getByLabel("部分解")).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("detect's camera, net, and mode tabs fit a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/detect");
  await expect(page.getByRole("heading", { name: "Cube Detection System" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start first attempt" })).toBeVisible();
  await expect(page.getByText("Centre: BLUE")).toBeVisible();
  await expect(page.getByText("Centre: RED")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Net of a Cube" })).toBeVisible();
  await page.getByRole("button", { name: "3D View" }).click();
  await expect(page.getByRole("heading", { name: "3D Interactive View" })).toBeVisible();
  await page.getByRole("button", { name: "Net View" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
