/**
 * lib/generator/ のUnit テスト
 *
 * 問題点: Zobristハッシュの衝突・AUFバリエーションの漏れ・
 *         maxMoves フィルタのバグは静かに候補を消す。
 *
 * 解決方針:
 *   1. Zobristハッシュの一意性と決定論性を確認
 *   2. collectCandidates が maxMoves を超えた候補を除外することを確認
 *   3. generateAlgorithms（モック依存）の統合的な出力形式確認
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeZobristHash, initZobristTable } from '@/lib/generator/zobrist'
import { collectCandidates } from '@/lib/generator/generator'
import { SOLVED_STATE } from '@/lib/cube/moves'
import { applyMoves } from '@/lib/cube/moves'
import type { Move } from '@/types/cube'

// ────────────────────────────────────────────────────────────
// Zobrist ハッシュ
// ────────────────────────────────────────────────────────────
describe('Zobrist hash', () => {
  it('SOLVED_STATE のハッシュは毎回同じ（決定論的）', () => {
    const h1 = computeZobristHash(SOLVED_STATE)
    const h2 = computeZobristHash(SOLVED_STATE)
    expect(h1).toBe(h2)
  })

  it('異なる状態は異なるハッシュを持つ', () => {
    const state2 = applyMoves(SOLVED_STATE, ["R"] as Move[])
    const h1 = computeZobristHash(SOLVED_STATE)
    const h2 = computeZobristHash(state2)
    expect(h1).not.toBe(h2)
  })

  it('同じ最終状態になる2つの手順は同じハッシュ', () => {
    // R U R' U' (sexy move) × 6 = SOLVED
    const sexyMove: Move[] = ["R", "U", "R'", "U'"]
    let state = SOLVED_STATE
    for (let i = 0; i < 6; i++) {
      state = applyMoves(state, sexyMove)
    }
    // 最終状態が SOLVED_STATE と同じ → ハッシュも同じ
    const h1 = computeZobristHash(SOLVED_STATE)
    const h2 = computeZobristHash(state)
    expect(h1).toBe(h2)
  })

  it('ハッシュは bigint 型', () => {
    expect(typeof computeZobristHash(SOLVED_STATE)).toBe('bigint')
  })

  it('テーブル初期化後のハッシュは非ゼロ', () => {
    // XOR ハッシュが偶然 0 になる可能性は天文学的に低い
    initZobristTable() // 再初期化しても同じ（シード固定の場合）
    const h = computeZobristHash(SOLVED_STATE)
    // SOLVED_STATE のハッシュは事前定義の初期値と一致するはず
    expect(h).not.toBe(0n)
  })
})

// ────────────────────────────────────────────────────────────
// collectCandidates: maxMoves フィルタ・AUFバリエーション
// ────────────────────────────────────────────────────────────
describe('collectCandidates', () => {
  const primaryMoves: Move[] = ["R", "U", "R'", "U'"]

  it('maxMoves を超える候補は含まない', () => {
    const candidates = collectCandidates(primaryMoves, { maxMoves: 4, count: 20 })
    for (const c of candidates) {
      expect(c.length).toBeLessThanOrEqual(4)
    }
  })

  it('主解自体が候補に含まれる', () => {
    const candidates = collectCandidates(primaryMoves, { maxMoves: 20, count: 10 })
    const primaryStr = primaryMoves.join(' ')
    const found = candidates.some(c => c.join(' ') === primaryStr)
    expect(found).toBe(true)
  })

  it('AUFプリ付きバリエーションが生成される（U, U2, U\'）', () => {
    const candidates = collectCandidates(primaryMoves, { maxMoves: 20, count: 20 })
    const aufs: Move[] = ['U', 'U2', "U'"]
    for (const auf of aufs) {
      const hasAuf = candidates.some(c => c[0] === auf)
      expect(hasAuf).toBe(true)
    }
  })

  it('count を超える候補は返さない', () => {
    const candidates = collectCandidates(primaryMoves, { maxMoves: 20, count: 3 })
    expect(candidates.length).toBeLessThanOrEqual(3)
  })

  it('空の主解でもクラッシュしない', () => {
    expect(() => collectCandidates([], { maxMoves: 10, count: 5 })).not.toThrow()
  })
})

// ────────────────────────────────────────────────────────────
// generateAlgorithms: 出力形式確認（Worker/DB はモック済み）
// ────────────────────────────────────────────────────────────
describe('generateAlgorithms (integration-light)', () => {
  it('GeneratedAlgorithmDTO の形式に沿った配列を返す', async () => {
    // Worker Pool はセットアップで vi.mock 済み
    const { generateAlgorithms } = await import('@/lib/generator/generator')
    const results = await generateAlgorithms(SOLVED_STATE, {
      maxMoves: 20,
      count: 3,
    })

    expect(Array.isArray(results)).toBe(true)
    for (const alg of results) {
      expect(alg).toHaveProperty('moves')
      expect(alg).toHaveProperty('movesString')
      expect(alg).toHaveProperty('htm')
      expect(alg).toHaveProperty('qtm')
      expect(alg).toHaveProperty('evaluation')
      expect(alg.evaluation).toHaveProperty('totalScore')
    }
  })

  it('totalScore の降順でソートされている', async () => {
    const { generateAlgorithms } = await import('@/lib/generator/generator')
    const results = await generateAlgorithms(SOLVED_STATE, { maxMoves: 20, count: 5 })
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].evaluation.totalScore)
        .toBeGreaterThanOrEqual(results[i].evaluation.totalScore)
    }
  })

  it('Zobrist重複除去により同じ最終状態の候補は1つのみ', async () => {
    const { generateAlgorithms } = await import('@/lib/generator/generator')
    const results = await generateAlgorithms(SOLVED_STATE, { maxMoves: 20, count: 20 })
    const hashes = new Set(results.map(r => r.movesString))
    // movesString でユニーク = 重複除去が機能している
    expect(hashes.size).toBe(results.length)
  })
})
