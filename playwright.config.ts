import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E テスト設定
 *
 * 現在サポートされている公開ワークベンチを認証なしで検証する。
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
    // ── 認証不要テスト ─────────────────────────────────────────────────
    {
      name: 'unauthenticated',
      testMatch: /.*\.e2e\.ts/,
      use: { ...devices['Desktop Chrome'] },
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
