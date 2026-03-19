/**
 * Save / Saved ページ 認証済み E2E テスト
 *
 * storageState（.auth/user.json）を利用して認証済み状態でテストを実行する。
 */
import { test, expect } from '@playwright/test'

test.describe('認証済みユーザーの保存機能', () => {
  test('Generator ページでアルゴリズムを保存できる', async ({ page }) => {
    await page.goto('/generator')

    // Generate ボタンをクリック
    const generateButton = page.getByRole('button', { name: /generate/i })
    await expect(generateButton).toBeVisible()
    await generateButton.click()

    // 結果が表示されるまで待つ
    await expect(page.getByTestId('algorithm-card')).toBeVisible({ timeout: 15_000 })

    // 最初のカードの Save ボタンをクリック
    const firstCard = page.getByTestId('algorithm-card').first()
    await firstCard.getByRole('button', { name: /save/i }).click()

    // 保存モーダルが表示される
    await expect(page.getByTestId('save-modal')).toBeVisible()

    // ニックネームを入力
    await page.getByTestId('nickname-input').fill('E2E Test Algorithm')
    await page.getByRole('button', { name: /confirm|save/i }).click()

    // 成功トーストが表示される
    await expect(page.getByTestId('toast-success')).toBeVisible({ timeout: 5_000 })
  })

  test('Saved ページで保存済みアルゴリズムが表示される', async ({ page }) => {
    await page.goto('/saved')

    // ローディングが終わるまで待つ
    await expect(page.getByTestId('saved-list-loading')).toBeHidden({ timeout: 10_000 })

    // リストが存在することを確認（0件の場合はempty stateが表示）
    const isEmpty = await page.getByTestId('empty-saved').isVisible()
    if (!isEmpty) {
      await expect(page.getByTestId('saved-algorithm-item')).toBeVisible()
    } else {
      await expect(page.getByTestId('empty-saved')).toBeVisible()
    }
  })

  test('保存済みアルゴリズムを削除できる', async ({ page }) => {
    await page.goto('/saved')

    // ローディング完了を待つ
    await expect(page.getByTestId('saved-list-loading')).toBeHidden({ timeout: 10_000 })

    const items = await page.getByTestId('saved-algorithm-item').count()
    if (items === 0) {
      test.skip() // アイテムがなければスキップ
      return
    }

    // 最初のアイテムの削除ボタンをクリック
    await page.getByTestId('saved-algorithm-item').first()
      .getByRole('button', { name: /delete/i }).click()

    // 確認ダイアログ
    await expect(page.getByTestId('confirm-delete-modal')).toBeVisible()
    await page.getByRole('button', { name: /confirm|yes/i }).click()

    // アイテム数が1減る、または empty state が表示される
    if (items === 1) {
      await expect(page.getByTestId('empty-saved')).toBeVisible({ timeout: 5_000 })
    } else {
      await expect(page.getByTestId('saved-algorithm-item')).toHaveCount(items - 1, { timeout: 5_000 })
    }
  })

  test('未認証ユーザーは保存済みページにアクセスできない', async ({ browser }) => {
    // 認証なしのコンテキストを作成
    const unauthContext = await browser.newContext() // storageState なし
    const page = await unauthContext.newPage()
    await page.goto('/saved')

    // ログインページにリダイレクトされるか、認証エラーが表示される
    const url = page.url()
    const hasAuthError = await page.getByTestId('auth-required').isVisible()
    const isRedirectedToLogin = url.includes('/login') || url.includes('/auth')

    expect(hasAuthError || isRedirectedToLogin).toBe(true)
    await unauthContext.close()
  })
})
