/**
 * POST /api/save / GET|DELETE /api/algorithms の Integration テスト
 *
 * 問題点: 認証必須APIは getServerSession を正しく扱わないと
 *         実際のテストにならない（常に通過してしまう）。
 *
 * 解決方針:
 *   - getServerSession をテストごとに上書き
 *   - Prisma はセットアップで prismaMock に差し替え済み
 *   - 認証済み / 未認証の両ケースを必ず網羅
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as savePost } from '@/app/api/save/route'
import { GET as algorithmsGet, DELETE as algorithmsDelete } from '@/app/api/algorithms/[savedId]/route'
import { prismaMock, mockSession } from '../setup/integration.setup'
import * as nextAuth from 'next-auth/next'

// ── ヘルパー ────────────────────────────────────────────────────────────────
function makeRequest(body: unknown, method = 'POST'): NextRequest {
  return new NextRequest('http://localhost/api/save', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function loginAs(session: typeof mockSession.authenticated | null) {
  vi.mocked(nextAuth.getServerSession).mockResolvedValueOnce(session)
}

// ────────────────────────────────────────────────────────────
// POST /api/save
// ────────────────────────────────────────────────────────────
describe('POST /api/save', () => {
  beforeEach(() => {
    // DB モックのデフォルト挙動を設定
    prismaMock.algorithm.findUnique.mockResolvedValue({
      id: 'algo-1',
      cubeStateId: 'state-1',
      moves: ["R", "U", "R'", "U'"],
      movesString: "R U R' U'",
      htm: 4,
      qtm: 4,
      scoreTotal: 0.75,
      scoreHtm: 0.85,
      scoreFinger: 0.80,
      scoreFlow: 0.70,
      scoreRegrip: 0.90,
      scoreAxis: 0.60,
      source: 'generated',
      createdAt: new Date(),
    } as any)

    prismaMock.savedAlgorithm.create.mockResolvedValue({
      id: 'saved-1',
      userId: 'test-user-id',
      algorithmId: 'algo-1',
      nickname: 'My algo',
      tags: ['OLL'],
      isFavorite: false,
      savedAt: new Date(),
    } as any)
  })

  it('401: 未認証ユーザーは保存できない', async () => {
    loginAs(null)
    const req = makeRequest({ algorithmId: 'algo-1', nickname: 'test' })
    const res = await savePost(req)
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.error.code).toBe('UNAUTHORIZED')
  })

  it('200: 認証済みユーザーは保存できる', async () => {
    loginAs(mockSession.authenticated)
    const req = makeRequest({ algorithmId: 'algo-1', nickname: 'My algo', tags: ['OLL'] })
    const res = await savePost(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toHaveProperty('savedId')
    expect(json.data).toHaveProperty('savedAt')
  })

  it('404: 存在しない algorithmId の場合', async () => {
    loginAs(mockSession.authenticated)
    prismaMock.algorithm.findUnique.mockResolvedValueOnce(null)
    const req = makeRequest({ algorithmId: 'nonexistent', nickname: 'test' })
    const res = await savePost(req)
    const json = await res.json()

    expect(res.status).toBe(404)
    expect(json.error.code).toBe('NOT_FOUND')
  })

  it('422: nickname が欠落している場合', async () => {
    loginAs(mockSession.authenticated)
    const req = makeRequest({ algorithmId: 'algo-1' }) // nickname なし
    const res = await savePost(req)
    const json = await res.json()

    expect(res.status).toBe(422)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })

  it('保存成功時に prisma.savedAlgorithm.create が呼ばれる', async () => {
    loginAs(mockSession.authenticated)
    const req = makeRequest({ algorithmId: 'algo-1', nickname: 'test' })
    await savePost(req)

    expect(prismaMock.savedAlgorithm.create).toHaveBeenCalledOnce()
  })
})

// ────────────────────────────────────────────────────────────
// DELETE /api/algorithms/:savedId
// ────────────────────────────────────────────────────────────
describe('DELETE /api/algorithms/:savedId', () => {
  beforeEach(() => {
    prismaMock.savedAlgorithm.findUnique.mockResolvedValue({
      id: 'saved-1',
      userId: 'test-user-id',
      algorithmId: 'algo-1',
      nickname: 'test',
      tags: [],
      isFavorite: false,
      savedAt: new Date(),
    } as any)

    prismaMock.savedAlgorithm.delete.mockResolvedValue({} as any)
  })

  it('401: 未認証ユーザーは削除できない', async () => {
    loginAs(null)
    const req = new NextRequest('http://localhost/api/algorithms/saved-1', { method: 'DELETE' })
    const res = await algorithmsDelete(req, { params: { savedId: 'saved-1' } })
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.error.code).toBe('UNAUTHORIZED')
  })

  it('200: 自分の保存済みアルゴリズムは削除できる', async () => {
    loginAs(mockSession.authenticated)
    const req = new NextRequest('http://localhost/api/algorithms/saved-1', { method: 'DELETE' })
    const res = await algorithmsDelete(req, { params: { savedId: 'saved-1' } })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data).toMatchObject({ deleted: true })
  })

  it('404: 存在しない savedId の場合', async () => {
    loginAs(mockSession.authenticated)
    prismaMock.savedAlgorithm.findUnique.mockResolvedValueOnce(null)
    const req = new NextRequest('http://localhost/api/algorithms/nonexistent', { method: 'DELETE' })
    const res = await algorithmsDelete(req, { params: { savedId: 'nonexistent' } })
    const json = await res.json()

    expect(res.status).toBe(404)
    expect(json.error.code).toBe('NOT_FOUND')
  })

  it('他のユーザーの保存済みは削除できない（403相当）', async () => {
    loginAs(mockSession.authenticated)
    // 所有者が異なるレコードを返す
    prismaMock.savedAlgorithm.findUnique.mockResolvedValueOnce({
      id: 'saved-1',
      userId: 'OTHER-USER-ID', // 認証ユーザーとは別人
      algorithmId: 'algo-1',
      nickname: 'test',
      tags: [],
      isFavorite: false,
      savedAt: new Date(),
    } as any)

    const req = new NextRequest('http://localhost/api/algorithms/saved-1', { method: 'DELETE' })
    const res = await algorithmsDelete(req, { params: { savedId: 'saved-1' } })

    // 403 もしくは 404（存在しないものとして扱う）を許容
    expect([403, 404]).toContain(res.status)
  })
})
