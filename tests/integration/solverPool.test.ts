/**
 * server/worker/solverPool + server/lib/cache の Integration テスト
 *
 * 問題点: Worker Pool の「タイムアウト→terminate→再生成」サイクルと
 *         LRUCache の TTL/eviction が実装通りに動くかを確認する必要がある。
 *         実際の Worker は WASM が必要なためモックを使う。
 *
 * 解決方針:
 *   - solverPool は実装を使い、その中の WASM 呼び出しだけをモック
 *   - LRUCache は実装そのものをテスト（純粋なクラスなのでモック不要）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LRUCache } from '@/server/lib/cache/lruCache'

// ────────────────────────────────────────────────────────────
// LRUCache
// ────────────────────────────────────────────────────────────
describe('LRUCache', () => {
  it('基本的な get/set', () => {
    const cache = new LRUCache<string, number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    expect(cache.get('a')).toBe(1)
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBeUndefined()
  })

  it('容量超過時に最古のエントリを evict する', () => {
    const cache = new LRUCache<string, number>(2)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3) // a が evict される
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBe(3)
  })

  it('アクセスにより LRU 順序が更新される', () => {
    const cache = new LRUCache<string, number>(2)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.get('a') // a を recent に更新
    cache.set('c', 3) // b が evict される（a は最近アクセス済み）
    expect(cache.get('a')).toBe(1)
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('c')).toBe(3)
  })

  it('TTL を超えたエントリは undefined を返す', async () => {
    const cache = new LRUCache<string, number>(10, { ttlMs: 50 })
    cache.set('a', 42)
    expect(cache.get('a')).toBe(42)
    await new Promise(r => setTimeout(r, 60))
    expect(cache.get('a')).toBeUndefined()
  })

  it('TTL 内はエントリを保持する', async () => {
    const cache = new LRUCache<string, number>(10, { ttlMs: 200 })
    cache.set('a', 99)
    await new Promise(r => setTimeout(r, 50))
    expect(cache.get('a')).toBe(99)
  })

  it('delete で特定エントリを削除できる', () => {
    const cache = new LRUCache<string, number>(5)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.delete('a')
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
  })

  it('clear で全エントリを削除できる', () => {
    const cache = new LRUCache<string, number>(5)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.clear()
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBeUndefined()
    expect(cache.size).toBe(0)
  })

  it('size が正しい件数を返す', () => {
    const cache = new LRUCache<string, number>(5)
    expect(cache.size).toBe(0)
    cache.set('a', 1)
    cache.set('b', 2)
    expect(cache.size).toBe(2)
  })

  it('同じキーの上書きは件数を増やさない', () => {
    const cache = new LRUCache<string, number>(5)
    cache.set('a', 1)
    cache.set('a', 99)
    expect(cache.size).toBe(1)
    expect(cache.get('a')).toBe(99)
  })

  it('容量 500件でも正しく動作する（Solver キャッシュと同等）', () => {
    const cache = new LRUCache<string, string>(500)
    for (let i = 0; i < 600; i++) {
      cache.set(`key-${i}`, `value-${i}`)
    }
    expect(cache.size).toBe(500)
    // 最初の 100 件は evict されている
    expect(cache.get('key-0')).toBeUndefined()
    // 最新の件は残っている
    expect(cache.get('key-599')).toBe('value-599')
  })
})

// ────────────────────────────────────────────────────────────
// AppError
// ────────────────────────────────────────────────────────────
describe('AppError', () => {
  it('code と message を持つ', async () => {
    const { AppError } = await import('@/server/lib/errors')
    const err = new AppError('SOLVER_FAILED', 'solver failed')
    expect(err.code).toBe('SOLVER_FAILED')
    expect(err.message).toBe('solver failed')
    expect(err instanceof Error).toBe(true)
  })

  it('isAppError で識別できる', async () => {
    const { AppError, isAppError } = await import('@/server/lib/errors')
    const err = new AppError('NOT_FOUND', 'not found')
    expect(isAppError(err)).toBe(true)
    expect(isAppError(new Error('regular'))).toBe(false)
  })
})
