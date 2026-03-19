/**
 * Unit テスト用セットアップ
 *
 * 問題点: lib/solver/solver.ts は min2phase WASM を呼ぶが、
 *         Node.js テスト環境では WASM バイナリが存在しないためクラッシュする。
 *
 * 解決方針: vi.mock() でモジュールレベルで差し替え。
 *           テスト対象の純粋関数（evaluator / cube / generator）は
 *           WASM に依存しないため、モックだけ置ければ全 Unit テストが通る。
 */
import { vi, beforeAll, afterAll } from 'vitest'

// ── WASM モジュール全体を差し替え ──────────────────────────────────────────
// 実際の min2phase は server/worker 内で動くので Unit 層では不要。
// solver.ts が import する wasm ラッパーをスタブ化する。
vi.mock('@/lib/solver/wasmLoader', () => ({
  loadWasm: vi.fn().mockResolvedValue({
    solve: vi.fn().mockReturnValue("R U R' U'"),  // 有効な解の文字列を返す
    isLoaded: vi.fn().mockReturnValue(true),
  }),
}))

// ── Worker Pool を差し替え ─────────────────────────────────────────────────
// Unit テストでは Worker を起動しない。
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

// ── Prisma Client を差し替え ───────────────────────────────────────────────
// Unit テストは DB に触れない。
vi.mock('@/db/client', () => ({
  prisma: {
    algorithm: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    savedAlgorithm: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    cubeState: { findUnique: vi.fn(), create: vi.fn(), upsert: vi.fn() },
    user: { findUnique: vi.fn() },
    $disconnect: vi.fn(),
    $transaction: vi.fn(),
  },
}))

// ── コンソール抑制（ノイズ除去） ───────────────────────────────────────────
beforeAll(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterAll(() => {
  vi.restoreAllMocks()
})
