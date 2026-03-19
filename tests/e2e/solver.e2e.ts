/**
 * Solver ページ E2E テスト
 *
 * 認証不要（/solver は公開ページ）
 */
import { test, expect } from '@playwright/test'

// Solved state の stateString（54文字、URFDLB 順）
const SOLVED_STATE_STRING = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB'

test.describe('Solver ページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/solver')
  })

  test('ページタイトルが表示される', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /solver/i })).toBeVisible()
  })

  test('CubeFaceEditor が表示される', async ({ page }) => {
    await expect(page.getByTestId('cube-face-editor')).toBeVisible()
  })

  test('Solve ボタンをクリックするとローディングが表示される', async ({ page }) => {
    // Solver ボタンを探してクリック
    const solveButton = page.getByRole('button', { name: /solve/i })
    await expect(solveButton).toBeVisible()
    await solveButton.click()

    // ローディングインジケータが表示されることを確認
    await expect(page.getByTestId('solver-loading')).toBeVisible({ timeout: 2_000 })
  })

  test('有効な状態を入力してソルブ結果が表示される', async ({ page }) => {
    // stateString を直接入力するフィールドがある場合
    const stateInput = page.getByTestId('state-string-input')
    if (await stateInput.isVisible()) {
      await stateInput.fill(SOLVED_STATE_STRING)
    }

    const solveButton = page.getByRole('button', { name: /solve/i })
    await solveButton.click()

    // ソルブ結果の表示を待つ（API レスポンス最大 10秒）
    await expect(page.getByTestId('solve-result')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('moves-display')).toBeVisible()
  })

  test('ステップ再生ボタンが機能する', async ({ page }) => {
    const stateInput = page.getByTestId('state-string-input')
    if (await stateInput.isVisible()) {
      await stateInput.fill(SOLVED_STATE_STRING)
    }

    await page.getByRole('button', { name: /solve/i }).click()
    await page.getByTestId('solve-result').waitFor({ timeout: 10_000 })

    // 次のステップへ
    const nextButton = page.getByTestId('next-step-button')
    await expect(nextButton).toBeVisible()
    const initialStep = await page.getByTestId('current-step').textContent()
    await nextButton.click()
    const newStep = await page.getByTestId('current-step').textContent()
    expect(newStep).not.toBe(initialStep)
  })
})
