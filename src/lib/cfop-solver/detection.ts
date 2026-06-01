/**
 * detection.ts — CFOP 各フェーズの「完了判定」関数群
 *
 * 前提: moves.ts の文字列ベース CubeState (54文字) を使用する。
 *
 * ── スティッカー番号早見表 ──────────────────────────────────────
 *
 *  面の並び順:  U(0-8)  R(9-17)  F(18-26)  D(27-35)  L(36-44)  B(45-53)
 *
 *  各面は外側から見たときの row-major 配置:
 *      0 1 2
 *      3 4 5
 *      6 7 8
 *  → 実際のインデックス = face_start + offset
 *
 *            ┌──────────┐
 *            │  0  1  2 │  U面
 *            │  3  4  5 │
 *            │  6  7  8 │
 * ┌──────────┼──────────┼──────────┬──────────┐
 * │ 36 37 38 │ 18 19 20 │  9 10 11 │ 45 46 47 │  ← L / F / R / B（横展開）
 * │ 39 40 41 │ 21 22 23 │ 12 13 14 │ 48 49 50 │
 * │ 42 43 44 │ 24 25 26 │ 15 16 17 │ 51 52 53 │  ← ※ B面は後ろから見た配置
 * └──────────┼──────────┼──────────┴──────────┘
 *            │ 27 28 29 │  D面
 *            │ 30 31 32 │
 *            │ 33 34 35 │
 *            └──────────┘
 *
 * ── Cross (白クロス) エッジ対応 ────────────────────────────────────
 *
 *  D面の十字エッジと隣接面エッジの対:
 *    D[1]=28 ↔ F[7]=25   (D-F エッジ)
 *    D[3]=30 ↔ L[7]=43   (D-L エッジ)
 *    D[5]=32 ↔ R[7]=16   (D-R エッジ)
 *    D[7]=34 ↔ B[7]=52   (D-B エッジ)
 *
 * ── F2L 4スロット ────────────────────────────────────────────────
 *
 *  スロット FR:  コーナー 26(F) 15(R) 29(D)  エッジ 23(F) 12(R)
 *  スロット FL:  コーナー 24(F) 44(L) 27(D)  エッジ 21(F) 41(L)
 *  スロット BR:  コーナー 51(B) 17(R) 35(D)  エッジ 48(B) 14(R)
 *  スロット BL:  コーナー 53(B) 42(L) 33(D)  エッジ 50(B) 39(L)
 */

import type { CubeState } from "../cube/moves";

// ─── 型定義 ───────────────────────────────────────────────────────────────────

/** F2L の 4 スロット名 */
export type F2LSlot = "FR" | "FL" | "BR" | "BL";

/** isCrossSolved / isF2LSolved などが返す詳細情報 */
export type PhaseStatus = {
  /** そのフェーズが完了しているか */
  solved: boolean;
  /** 未完了のスロットや面の名前（デバッグ用） */
  unsolved: string[];
};

// ─── 内部ヘルパー ─────────────────────────────────────────────────────────────

/**
 * 54 文字の state 文字列から 1 文字を取り出す。
 * インデックスが範囲外のときは空文字を返す（実行時エラー防止）。
 */
function at(state: CubeState, index: number): string {
  return state[index] ?? "";
}

// ─── Cross 判定 ───────────────────────────────────────────────────────────────

/**
 * D-F エッジ・D-L エッジ・D-R エッジ・D-B エッジの
 * ペア情報を定数として定義する。
 *
 * 各エントリは [D面側インデックス, 隣接面側インデックス, 隣接面の色] の順。
 * 隣接面の色は「その面のセンター色 = 面名そのもの」と一致する必要がある。
 */
const CROSS_EDGE_PAIRS: ReadonlyArray<[number, number, string]> = [
  [28, 25, "F"], // D-F エッジ: D[1] ↔ F[7]
  [30, 43, "L"], // D-L エッジ: D[3] ↔ L[7]
  [32, 16, "R"], // D-R エッジ: D[5] ↔ R[7]
  [34, 52, "B"], // D-B エッジ: D[7] ↔ B[7]
];

/**
 * ホワイトクロス（D 面の十字）が完成しているかを判定する。
 *
 * 完成条件:
 *   1. D 面のエッジ 4 マス (28, 30, 32, 34) が全て "D"（＝白）
 *   2. 隣接する 4 面のエッジが各面のセンター色と一致している
 *
 * @returns PhaseStatus — solved が true なら完成。unsolved に未完了エッジ名が入る。
 */
export function isCrossSolved(state: CubeState): PhaseStatus {
  const unsolved: string[] = [];

  for (const [dIdx, adjIdx, adjColor] of CROSS_EDGE_PAIRS) {
    const dOk  = at(state, dIdx) === "D";
    const adjOk = at(state, adjIdx) === adjColor;
    if (!dOk || !adjOk) {
      unsolved.push(`D-${adjColor}`);
    }
  }

  return { solved: unsolved.length === 0, unsolved };
}

// ─── F2L 判定 ─────────────────────────────────────────────────────────────────

/**
 * F2L 各スロットのコーナー・エッジ インデックスと
 * それぞれが取るべき色を定義する。
 *
 * コーナーは 3 面分、エッジは 2 面分あり、
 * [インデックス, 期待色] のペア配列として表現する。
 */
const F2L_SLOTS: Readonly<
  Record<F2LSlot, ReadonlyArray<[number, string]>>
> = {
  FR: [
    // コーナー（DFR）
    [26, "F"], [15, "R"], [29, "D"],
    // エッジ（FR 中段）
    [23, "F"], [12, "R"],
  ],
  FL: [
    // コーナー（DFL）
    [24, "F"], [44, "L"], [27, "D"],
    // エッジ（FL 中段）
    [21, "F"], [41, "L"],
  ],
  BR: [
    // コーナー（DBR）
    [51, "B"], [17, "R"], [35, "D"],
    // エッジ（BR 中段）
    [48, "B"], [14, "R"],
  ],
  BL: [
    // コーナー（DBL）
    [53, "B"], [42, "L"], [33, "D"],
    // エッジ（BL 中段）
    [50, "B"], [39, "L"],
  ],
};

/**
 * 指定した F2L スロットが完成しているかを判定する。
 *
 * 完成条件: そのスロットのコーナー 3 マスとエッジ 2 マスが
 *           すべて期待する色と一致していること。
 *
 * @param slot - "FR" | "FL" | "BR" | "BL"
 */
export function isF2LSlotSolved(
  state: CubeState,
  slot: F2LSlot
): boolean {
  return F2L_SLOTS[slot].every(
    ([idx, expectedColor]) => at(state, idx) === expectedColor
  );
}

/**
 * F2L の 4 スロット全体の完成状況を返す。
 *
 * @returns PhaseStatus — solved が true なら 4 スロット全完成。
 *                        unsolved に未完了スロット名の配列が入る。
 */
export function isF2LSolved(state: CubeState): PhaseStatus {
  const unsolved: string[] = [];

  for (const slot of ["FR", "FL", "BR", "BL"] as const) {
    if (!isF2LSlotSolved(state, slot)) {
      unsolved.push(slot);
    }
  }

  return { solved: unsolved.length === 0, unsolved };
}

// ─── OLL 判定 ─────────────────────────────────────────────────────────────────

/**
 * OLL（Orientation of Last Layer）が完成しているかを判定する。
 *
 * 完成条件: U 面の 9 マス（インデックス 0〜8）が全て "U"（＝黄色）
 *
 * OLL では側面の色は問わない。
 * 上面の向きだけが揃っていれば OK。
 */
export function isOLLSolved(state: CubeState): boolean {
  for (let i = 0; i < 9; i++) {
    if (at(state, i) !== "U") return false;
  }
  return true;
}

// ─── PLL 判定 ─────────────────────────────────────────────────────────────────

/**
 * PLL（Permutation of Last Layer）が完成しているかを判定する。
 *
 * PLL が完成 = キューブ全体が完成している。
 * （OLL 完了後に PLL を行うので、全面一致が完成の証明になる）
 *
 * 完成条件: 54 文字の state が SOLVED_STATE と一致すること。
 *
 * SOLVED_STATE = "UUUUUUUUURRRRRRRRR" +
 *                "FFFFFFFFF" +
 *                "DDDDDDDDD" +
 *                "LLLLLLLLL" +
 *                "BBBBBBBBB"
 */
const SOLVED_STATE =
  "UUUUUUUUU" +
  "RRRRRRRRR" +
  "FFFFFFFFF" +
  "DDDDDDDDD" +
  "LLLLLLLLL" +
  "BBBBBBBBB";

export function isPLLSolved(state: CubeState): boolean {
  return state === SOLVED_STATE;
}

// ─── CFOP 全体サマリー ────────────────────────────────────────────────────────

/**
 * CFOP の進捗を 4 フェーズまとめて返すユーティリティ。
 * 主にデバッグや UI 表示に使う。
 *
 * @returns 各フェーズの完了フラグと未完了情報をまとめたオブジェクト
 *
 * @example
 * const progress = getCFOPProgress(state);
 * console.log(progress.cross.solved);   // true / false
 * console.log(progress.f2l.unsolved);   // ["BR", "BL"] など
 */
export function getCFOPProgress(state: CubeState): {
  cross: PhaseStatus;
  f2l:   PhaseStatus;
  oll:   { solved: boolean };
  pll:   { solved: boolean };
} {
  return {
    cross: isCrossSolved(state),
    f2l:   isF2LSolved(state),
    oll:   { solved: isOLLSolved(state) },
    pll:   { solved: isPLLSolved(state) },
  };
}