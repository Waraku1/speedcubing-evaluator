/**
 * POST /api/solve の Integration テスト
 *
 * 問題点: Route Handler は Next.js の Request/Response ラッパーを使うため、
 *         通常の fetch テストでは動かない。
 *
 * 解決方針:
 *   - Next.js の NextRequest をインポートしてハンドラを直接呼び出す
 *   - Worker Pool はセットアップで vi.mock 済み
 *   - 各ケース（正常・バリデーションエラー・タイムアウト）を網羅
 */
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/solve/route'
import { serializeCubeState, SOLVED_STATE } from '@/lib/cube/cube'

// ── ヘルパー: テスト用リクエスト生成 ─────────────────────────────────────
function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/solve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const VALID_STATE_STRING = serializeCubeState(SOLVED_STATE)

// ────────────────────────────────────────────────────────────
// 正常系
// ────────────────────────────────────────────────────────────
describe('POST /api/solve', () => {
  it('200: 有効な stateString でソルブ結果を返す', async () => {
    const req = makeRequest({ stateString: VALID_STATE_STRING })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toHaveProperty('moves')
    expect(json.data).toHaveProperty('movesString')
    expect(json.data).toHaveProperty('htm')
    expect(json.data).toHaveProperty('qtm')
    expect(json.data).toHaveProperty('timeMs')
    expect(Array.isArray(json.data.steps)).toBe(true)
  })

  // ────────────────────────────────────────────────────────────
  // バリデーションエラー
  // ────────────────────────────────────────────────────────────
  it('422: stateString が 54文字未満の場合', async () => {
    const req = makeRequest({ stateString: 'short' })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(422)
    expect(json.success).toBe(false)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })

  it('422: stateString が欠落している場合', async () => {
    const req = makeRequest({})
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(422)
    expect(json.success).toBe(false)
  })

  it('422: stateString に無効な文字が含まれる場合', async () => {
    const req = makeRequest({ stateString: '?'.repeat(54) })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(422)
    expect(json.success).toBe(false)
  })

  // ────────────────────────────────────────────────────────────
  // ソルバーエラー
  // ────────────────────────────────────────────────────────────
  it('500: Worker が SOLVER_FAILED エラーをスローした場合', async () => {
    const { solverPool } = await import('@/server/worker/solverPool')
    vi.mocked(solverPool.solve).mockRejectedValueOnce(
      Object.assign(new Error('solver failed'), { code: 'SOLVER_FAILED' })
    )

    const req = makeRequest({ stateString: VALID_STATE_STRING })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error.code).toBe('SOLVER_FAILED')
  })

  it('504: Worker がタイムアウトした場合', async () => {
    const { solverPool } = await import('@/server/worker/solverPool')
    vi.mocked(solverPool.solve).mockRejectedValueOnce(
      Object.assign(new Error('timeout'), { code: 'SOLVER_TIMEOUT' })
    )

    const req = makeRequest({ stateString: VALID_STATE_STRING })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(504)
    expect(json.error.code).toBe('SOLVER_TIMEOUT')
  })

  // ────────────────────────────────────────────────────────────
  // レスポンス形式
  // ────────────────────────────────────────────────────────────
  it('成功レスポンスは ApiSuccess<T> 形式に準拠する', async () => {
    const req = makeRequest({ stateString: VALID_STATE_STRING })
    const res = await POST(req)
    const json = await res.json()

    // ApiSuccess<T> = { success: true, data: T }
    expect(json).toMatchObject({ success: true })
    expect(json).toHaveProperty('data')
    expect(json).not.toHaveProperty('error')
  })

  it('エラーレスポンスは ApiError 形式に準拠する', async () => {
    const req = makeRequest({ stateString: 'bad' })
    const res = await POST(req)
    const json = await res.json()

    // ApiError = { success: false, error: { code, message } }
    expect(json).toMatchObject({ success: false })
    expect(json.error).toHaveProperty('code')
    expect(json.error).toHaveProperty('message')
    expect(json).not.toHaveProperty('data')
  })
})
