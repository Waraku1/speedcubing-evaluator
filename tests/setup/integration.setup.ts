/**
 * Integration テスト用セットアップ
 *
 * 問題点: API routes は Prisma / NextAuth / Worker に依存するため、
 *         そのままでは CI 環境で実行不可。
 *
 * 解決方針:
 *   - Prisma は jest-mock-extended ベースの型安全モックに差し替え
 *   - NextAuth の getServerSession を差し替えて認証済み/未認証を制御
 *   - Worker Pool は Unit と同じモックを流用（Solver 動作は別途確認済み前提）
 *   - DB トランザクションは each テスト後にロールバック相当のリセット
 */
import { vi, beforeEach, afterAll } from 'vitest'
import { mockDeep, mockReset } from 'vitest-mock-extended'
import type { PrismaClient } from '@prisma/client'

// ── Prisma型安全モック ──────────────────────────────────────────────────────
export const prismaMock = mockDeep<PrismaClient>()

vi.mock('@/db/client', () => ({
  prisma: prismaMock,
}))

// ── NextAuth セッションモック ──────────────────────────────────────────────
// デフォルトは「未認証」。必要なテストで override する。
export const mockSession = {
  authenticated: {
    user: { id: 'test-user-id', email: 'test@example.com', name: 'Test User' },
    expires: new Date(Date.now() + 86400 * 1000).toISOString(),
  },
  unauthenticated: null,
}

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn().mockResolvedValue(null), // デフォルト未認証
}))

// ── Worker Pool モック（Unit と共通） ──────────────────────────────────────
vi.mock('@/server/worker/solverPool', () => ({
  solverPool: {
    solve: vi.fn().mockResolvedValue({
      moves: ["R", "U", "R'", "U'"],
      movesString: "R U R' U'",
      htm: 4,
      qtm: 4,
      timeMs: 1,
      steps: [],
    }),
    shutdown: vi.fn().mockResolvedValue(undefined),
  },
}))

// ── Next.js headers / cookies モック ──────────────────────────────────────
// Route Handler 内で headers() / cookies() を呼ぶ実装に対応
vi.mock('next/headers', () => ({
  headers: vi.fn().mockReturnValue(new Map()),
  cookies: vi.fn().mockReturnValue({
    get: vi.fn().mockReturnValue(undefined),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}))

// ── 各テスト前にモックをリセット ──────────────────────────────────────────
beforeEach(() => {
  mockReset(prismaMock)
})

afterAll(() => {
  vi.restoreAllMocks()
})
