import { defineConfig, devices } from '@playwright/test'
import path from 'path'

/**
 * Playwright E2E テスト設定
 *
 * 問題点: 認証フローを毎回テストするのは遅く不安定。
 *
 * 解決方針:
 *   - storageState でセッションを保存・再利用
 *   - グローバルセットアップで1回だけログインしてセッションを保存
 *   - 認証済みテストはセッションを読み込んで即利用
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // E2E は逐次実行（DBの状態を共有するため）

  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // ── 認証セットアップ（他テストの前に実行） ──────────────────────────
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },

    // ── 認証不要テスト ─────────────────────────────────────────────────
    {
      name: 'unauthenticated',
      testMatch: /.*\.e2e\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // ── 認証済みテスト ─────────────────────────────────────────────────
    {
      name: 'authenticated',
      testMatch: /.*\.auth\.e2e\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        // グローバルセットアップで保存したセッションを利用
        storageState: path.resolve(__dirname, 'tests/e2e/.auth/user.json'),
      },
    },
  ],

  // CI では自動起動、ローカルでは手動起動を前提
  webServer: process.env.CI
    ? {
        command: 'npm run start',
        url: 'http://localhost:3000',
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
})
