/**
 * E2E 認証セットアップ
 *
 * 問題点: Google/GitHub OAuth は実際のプロバイダーが必要で
 *         自動テストには使えない。
 *
 * 解決方針:
 *   - テスト専用の credential API（/api/test/auth）を使う
 *   - このエンドポイントは NODE_ENV=test のときのみ有効
 *   - セッションを .auth/user.json に保存し、以降のテストで再利用
 *
 * 理由: storageState 方式は Playwright 公式推奨。
 *       毎回ログインすると 30秒以上かかるところを 0.1秒に短縮できる。
 */
import { test as setup, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const AUTH_FILE = path.resolve(__dirname, '.auth/user.json')

setup('認証セッションを確立する', async ({ page }) => {
  // .auth ディレクトリを作成
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true })

  // テスト用認証エンドポイントを呼び出す
  // このエンドポイントは NODE_ENV=test のときのみ有効
  await page.goto('/api/test/auth?action=login')
  await expect(page).toHaveURL(/.*/)

  // メイン画面に遷移できることを確認
  await page.goto('/')
  await expect(page.getByTestId('user-menu')).toBeVisible({ timeout: 10_000 })

  // セッション状態を保存
  await page.context().storageState({ path: AUTH_FILE })
})
