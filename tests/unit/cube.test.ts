/**
 * lib/cube/ のUnit テスト
 *
 * 問題点: 置換テーブルのバグはサイレントに伝播し、
 *         ソルバーの正解率を下げる最も危険なバグ源。
 *
 * 解決方針:
 *   1. 既知の手順（sexy move・T-perm等）を適用し、結果が文献値と一致するか確認
 *   2. (move + inverse) = identity を全18手で検証
 *   3. シリアライズ ↔ デシリアライズの往復整合性確認
 *   4. cancelMoves の正規化確認
 */
import { describe, it, expect } from 'vitest'
import {
  applySingleMove,
  applyMoves,
  invertMoves,
  cancelMoves,
  SOLVED_STATE,
} from '@/lib/cube/moves'
import {
  serializeCubeState,
  parseCubeState,
  isValidCubeState,
  isSolvedState,
} from '@/lib/cube/cube'
import type { Move } from '@/types/cube'

// ── ヘルパー ────────────────────────────────────────────────────────────────
const ALL_MOVES: Move[] = [
  'U', "U'", 'U2', 'R', "R'", 'R2',
  'F', "F'", 'F2', 'D', "D'", 'D2',
  'L', "L'", 'L2', 'B', "B'", 'B2',
]

// ────────────────────────────────────────────────────────────
// 置換テーブル: (move + inverse) = identity
// ────────────────────────────────────────────────────────────
describe('applyMove / invertMoves: identity 確認（全18手）', () => {
  it.each(ALL_MOVES)('%s → inverse → SOLVED_STATE に戻る', (move) => {
    const after = applySingleMove(SOLVED_STATE, move)
    const [inv] = invertMoves([move])
    const back = applySingleMove(after, inv)
    expect(serializeCubeState(back)).toBe(serializeCubeState(SOLVED_STATE))
  })
})

// ────────────────────────────────────────────────────────────
// 既知手順: sexy move の6回 = identity
// R U R' U' を6回繰り返すと元に戻る
// ────────────────────────────────────────────────────────────
describe('applyMoves: sexy move × 6 = identity', () => {
  it('(R U R\' U\') × 6 = SOLVED', () => {
    const sexyMove: Move[] = ["R", "U", "R'", "U'"]
    let state = SOLVED_STATE
    for (let i = 0; i < 6; i++) {
      state = applyMoves(state, sexyMove)
    }
    expect(isSolvedState(state)).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────
// 既知手順: U move の4回 = identity
// ────────────────────────────────────────────────────────────
describe('applyMoves: single face × order = identity', () => {
  it.each([
    { move: 'U', times: 4 },
    { move: 'R', times: 4 },
    { move: 'F', times: 4 },
    { move: 'U2', times: 2 },
    { move: 'R2', times: 2 },
  ] as const)('%s × %i = SOLVED', ({ move, times }) => {
    let state = SOLVED_STATE
    for (let i = 0; i < times; i++) {
      state = applySingleMove(state, move as Move)
    }
    expect(isSolvedState(state)).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────
// T-perm: 既知のコーナー/エッジ置換確認
// R U R' U' R' F R2 U' R' U' R U R' F'
// T-Perm を2回適用すると元に戻る
// ────────────────────────────────────────────────────────────
describe('T-perm × 2 = identity', () => {
  it('T-perm を2回適用すると SOLVED に戻る', () => {
    const tPerm: Move[] = ["R", "U", "R'", "U'", "R'", "F", "R2", "U'", "R'", "U'", "R", "U", "R'", "F'"]
    let state = SOLVED_STATE
    state = applyMoves(state, tPerm)
    expect(isSolvedState(state)).toBe(false) // 1回後は崩れている
    state = applyMoves(state, tPerm)
    expect(isSolvedState(state)).toBe(true)  // 2回後は元に戻る
  })
})

// ────────────────────────────────────────────────────────────
// シリアライズ / デシリアライズ
// ────────────────────────────────────────────────────────────
describe('serializeCubeState / parseCubeState', () => {
  it('SOLVED_STATE のシリアライズが54文字', () => {
    const s = serializeCubeState(SOLVED_STATE)
    expect(s).toHaveLength(54)
  })

  it('serialize → parse の往復が元の状態と一致', () => {
    const s = serializeCubeState(SOLVED_STATE)
    const parsed = parseCubeState(s)
    expect(serializeCubeState(parsed)).toBe(s)
  })

  it('手順適用後の状態もシリアライズ往復が正確', () => {
    const state = applyMoves(SOLVED_STATE, ["R", "U", "F"] as Move[])
    const s = serializeCubeState(state)
    const parsed = parseCubeState(s)
    expect(serializeCubeState(parsed)).toBe(s)
  })

  it('不正な文字列は例外をスロー', () => {
    expect(() => parseCubeState('invalid')).toThrow()
    expect(() => parseCubeState('a'.repeat(54))).toThrow() // 無効な色
  })

  it('53文字は例外をスロー（長さ不足）', () => {
    expect(() => parseCubeState('W'.repeat(53))).toThrow()
  })
})

// ────────────────────────────────────────────────────────────
// isValidCubeState
// ────────────────────────────────────────────────────────────
describe('isValidCubeState', () => {
  it('SOLVED_STATE は有効', () => {
    expect(isValidCubeState(SOLVED_STATE)).toBe(true)
  })

  it('各色9枚制約違反は無効（センターを書き換えた状態）', () => {
    // 面Uのセンター(index 4)を変えた状態は色数が崩れる
    const invalid = {
      ...SOLVED_STATE,
      U: [...SOLVED_STATE.U] as any,
    }
    invalid.U[4] = 'R' as any // U面のセンターを赤に変更
    expect(isValidCubeState(invalid)).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────
// cancelMoves: 同面マージ
// ────────────────────────────────────────────────────────────
describe('cancelMoves', () => {
  it("R R → R2 にマージ", () => {
    expect(cancelMoves(["R", "R"] as Move[])).toEqual(["R2"])
  })

  it("R R R → R' にマージ（3回転）", () => {
    expect(cancelMoves(["R", "R", "R"] as Move[])).toEqual(["R'"])
  })

  it("R R R R → [] にキャンセル（4回転）", () => {
    expect(cancelMoves(["R", "R", "R", "R"] as Move[])).toEqual([])
  })

  it("R R' → [] にキャンセル", () => {
    expect(cancelMoves(["R", "R'"] as Move[])).toEqual([])
  })

  it('異なる面は変更しない', () => {
    const result = cancelMoves(["R", "U"] as Move[])
    expect(result).toEqual(["R", "U"])
  })

  it('空配列は空配列のまま', () => {
    expect(cancelMoves([])).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────
// invertMoves
// ────────────────────────────────────────────────────────────
describe('invertMoves', () => {
  it("['R', 'U', \"F'\"] → [\"F\", \"U'\", \"R'\"]", () => {
    const result = invertMoves(["R", "U", "F'"] as Move[])
    expect(result).toEqual(["F", "U'", "R'"])
  })

  it("R2 の逆は R2", () => {
    expect(invertMoves(["R2"] as Move[])).toEqual(["R2"])
  })

  it('空配列は空配列のまま', () => {
    expect(invertMoves([])).toEqual([])
  })

  it('invertMoves を2回適用すると元に戻る', () => {
    const original: Move[] = ["R", "U", "F'", "D2", "B"]
    expect(invertMoves(invertMoves(original))).toEqual(original)
  })
})
