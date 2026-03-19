/**
 * lib/evaluator/ のUnit テスト
 *
 * 問題点: 数式ベースのスコア関数は境界値・エッジケースが多く、
 *         実装ミスが totalScore に伝播しても気づきにくい。
 *
 * 解決方針: 各スコア関数を独立してテスト。数式を直接検証する。
 *           weight合計・正規化範囲[0,1]も確認する。
 */
import { describe, it, expect } from 'vitest'
import { evaluateAlgorithm } from '@/lib/evaluator/evaluator'
import {
  scoreHTM,
  scoreFinger,
  scoreFlow,
  scoreRegrip,
  scoreAxis,
} from '@/lib/evaluator/evaluator'

// ────────────────────────────────────────────────────────────
// scoreHTM: exp(-ln2/15 * htm)  →  15手で0.5
// ────────────────────────────────────────────────────────────
describe('scoreHTM', () => {
  it('0手のとき 1.0 を返す（最高スコア）', () => {
    expect(scoreHTM(0)).toBe(1.0)
  })

  it('15手のとき 0.5 を返す（半減点）', () => {
    expect(scoreHTM(15)).toBeCloseTo(0.5, 5)
  })

  it('30手のとき 0.25 を返す（さらに半減）', () => {
    expect(scoreHTM(30)).toBeCloseTo(0.25, 5)
  })

  it('手数が増えるほど単調減少する', () => {
    const scores = [0, 5, 10, 15, 20, 25].map(scoreHTM)
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThan(scores[i - 1])
    }
  })

  it('負の値は返さない', () => {
    expect(scoreHTM(100)).toBeGreaterThan(0)
  })
})

// ────────────────────────────────────────────────────────────
// scoreFinger: FT_TABLE ルックアップ平均
// R,U=1.0 が最高。B,L 系は低い。
// ────────────────────────────────────────────────────────────
describe('scoreFinger', () => {
  it('1手のとき（ペアなし）BASE値 1.0 を返す', () => {
    // ペアが存在しないので分母0 → 実装は1.0を返す仕様
    expect(scoreFinger(["R"])).toBeCloseTo(1.0, 3)
  })

  it('R U の繰り返しは高スコア（≥ 0.8）', () => {
    const moves = ["R", "U", "R'", "U'", "R", "U", "R'", "U'"]
    expect(scoreFinger(moves as any)).toBeGreaterThanOrEqual(0.8)
  })

  it('B L の繰り返しは低スコア（≤ 0.5）', () => {
    const moves = ["B", "L", "B'", "L'"]
    expect(scoreFinger(moves as any)).toBeLessThanOrEqual(0.5)
  })

  it('スコアは [0, 1] の範囲に収まる', () => {
    const moves = ["R", "U", "F", "D", "L", "B"]
    const score = scoreFinger(moves as any)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })
})

// ────────────────────────────────────────────────────────────
// scoreFlow: 0.5 + Σ transition / (n-1)
// 隣接軸 +0.2, 同軸 -0.2, 同面 -0.4
// ────────────────────────────────────────────────────────────
describe('scoreFlow', () => {
  it('1手のとき 0.5 を返す（遷移なし）', () => {
    expect(scoreFlow(["R"])).toBeCloseTo(0.5, 5)
  })

  it('異なる軸を交互に使うと高スコア（R→U→R→U）', () => {
    // R(X軸) → U(Y軸): 隣接 +0.2
    const score = scoreFlow(["R", "U", "R", "U"] as any)
    expect(score).toBeGreaterThan(0.5)
  })

  it('同じ面の連続は低スコア（R R R）', () => {
    const score = scoreFlow(["R", "R", "R"] as any)
    expect(score).toBeLessThan(0.5)
  })

  it('スコアは [0, 1] の範囲に収まる', () => {
    const cases = [
      ["R", "U", "F", "D", "L", "B"],
      ["R", "R'", "R", "R'"],
      ["U", "D", "U", "D"],
    ]
    for (const moves of cases) {
      const score = scoreFlow(moves as any)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(1)
    }
  })
})

// ────────────────────────────────────────────────────────────
// scoreRegrip: exp(-0.5 * count)  B↔F / L↔R = 再グリップ
// ────────────────────────────────────────────────────────────
describe('scoreRegrip', () => {
  it('再グリップ0回で 1.0 を返す', () => {
    expect(scoreRegrip(["R", "U", "R'"])).toBe(1.0)
  })

  it('B L が混じると count が増えスコアが下がる', () => {
    const noRegrip = scoreRegrip(["R", "U"] as any)
    const withRegrip = scoreRegrip(["R", "B", "R"] as any)
    expect(withRegrip).toBeLessThan(noRegrip)
  })

  it('再グリップ回数が増えるほど単調減少', () => {
    // B, L, F はすべて再グリップ要因
    const s1 = scoreRegrip(["B"] as any)
    const s2 = scoreRegrip(["B", "L"] as any)
    const s3 = scoreRegrip(["B", "L", "F"] as any)
    expect(s1).toBeGreaterThan(s2)
    expect(s2).toBeGreaterThan(s3)
  })

  it('スコアは (0, 1] の範囲に収まる', () => {
    expect(scoreRegrip(["B", "L", "F", "L", "B", "F"] as any)).toBeGreaterThan(0)
    expect(scoreRegrip(["R", "U"] as any)).toBeLessThanOrEqual(1)
  })
})

// ────────────────────────────────────────────────────────────
// scoreAxis: H(X,Y,Z) / log(3)  シャノンエントロピー正規化
// X軸: R,L / Y軸: U,D / Z軸: F,B
// ────────────────────────────────────────────────────────────
describe('scoreAxis', () => {
  it('全軸均等使用で 1.0（最大エントロピー）', () => {
    // R(X), U(Y), F(Z) を均等に使う
    const moves = ["R", "U", "F", "R", "U", "F"]
    expect(scoreAxis(moves as any)).toBeCloseTo(1.0, 3)
  })

  it('1軸のみ使用で 0.0（エントロピー最小）', () => {
    const moves = ["R", "R'", "R2", "R", "R'"]
    expect(scoreAxis(moves as any)).toBeCloseTo(0.0, 3)
  })

  it('2軸使用で 0 < score < 1', () => {
    const moves = ["R", "U", "R'", "U'"]
    const score = scoreAxis(moves as any)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1)
  })

  it('空配列でも例外を投げない', () => {
    expect(() => scoreAxis([])).not.toThrow()
  })
})

// ────────────────────────────────────────────────────────────
// evaluateAlgorithm: totalScore の重み合計検証
// w = [htm=0.25, finger=0.30, flow=0.20, regrip=0.15, axis=0.10]
// ────────────────────────────────────────────────────────────
describe('evaluateAlgorithm', () => {
  const sextuple = ["R", "U", "R'", "U'", "R", "U", "R'", "U'", "R", "U", "R'", "U'"] as const

  it('EvaluationResult の全フィールドを返す', () => {
    const result = evaluateAlgorithm(sextuple as any)
    expect(result).toHaveProperty('htm')
    expect(result).toHaveProperty('qtm')
    expect(result).toHaveProperty('scoreHTM')
    expect(result).toHaveProperty('scoreFinger')
    expect(result).toHaveProperty('scoreFlow')
    expect(result).toHaveProperty('scoreRegrip')
    expect(result).toHaveProperty('scoreAxis')
    expect(result).toHaveProperty('totalScore')
    expect(result).toHaveProperty('breakdown')
    expect(result.breakdown).toHaveLength(6)
  })

  it('totalScore が各スコアの重み付き合計と一致する', () => {
    const result = evaluateAlgorithm(sextuple as any)
    const expected =
      0.25 * result.scoreHTM +
      0.30 * result.scoreFinger +
      0.20 * result.scoreFlow +
      0.15 * result.scoreRegrip +
      0.10 * result.scoreAxis
    expect(result.totalScore).toBeCloseTo(expected, 5)
  })

  it('totalScore は [0, 1] に収まる', () => {
    expect(evaluateAlgorithm(sextuple as any).totalScore).toBeGreaterThanOrEqual(0)
    expect(evaluateAlgorithm(sextuple as any).totalScore).toBeLessThanOrEqual(1)
  })

  it('htm は手数と一致する', () => {
    const result = evaluateAlgorithm(sextuple as any)
    expect(result.htm).toBe(sextuple.length)
  })

  it('同じ入力に対してキャッシュが機能する（参照等価）', () => {
    const moves = ["R", "U", "R'", "U'"] as const
    const r1 = evaluateAlgorithm(moves as any)
    const r2 = evaluateAlgorithm(moves as any)
    // LRUCache が有効なら同じオブジェクト参照が返る
    expect(r1).toBe(r2)
  })

  it('空手順でもクラッシュしない', () => {
    expect(() => evaluateAlgorithm([])).not.toThrow()
  })
})
