/**
 * cfop-solver.ts — CFOP メインエントリ
 *
 * ═══════════════════════════════════════════════════════════════
 *  このファイルの役割
 * ═══════════════════════════════════════════════════════════════
 *
 *  4つのソルバーを正しい順序で呼び出し、
 *  スクランブルから完全な解法手順を生成して返す。
 *
 *  外部から使うときはこのファイルだけ import すればよい。
 *  他のソルバーファイルを直接触る必要はない。
 *
 * ═══════════════════════════════════════════════════════════════
 *  入力と出力
 * ═══════════════════════════════════════════════════════════════
 *
 *  入力:
 *    scramble: Move[]
 *      例: ["R","U","R'","U'","F2","L","D'","B2","R2","U",
 *            "F","L2","D","R","B'","U2","L'","F2","D2"]
 *
 *  出力: SolveResult
 *    .solution      全手順を1つの配列に結合したもの
 *    .totalHTM      HTM（Half-Turn Metric）総手数
 *                   → 全ての手を1手として数える
 *    .totalQTM      QTM（Quarter-Turn Metric）総手数
 *                   → X2（半回転）は2手として数える
 *    .phases        フェーズ別の詳細
 *      .cross       クロスの手順と手数
 *      .f2l         F2L全体の手順・手数・スロット別手順
 *      .oll         OLLの手順と手数
 *      .pll         PLLの手順と手数
 *    .scrambledState スクランブル後のキューブ状態（デバッグ用）
 *    .solvedState    解法適用後の最終状態（検証用）
 *
 * ═══════════════════════════════════════════════════════════════
 *  処理の流れ
 * ═══════════════════════════════════════════════════════════════
 *
 *  [STEP 1] Move[] → CubeState 変換
 *    applyMoves(SOLVED_STATE, scramble)
 *    → 完成状態にスクランブルを適用してスクランブル済み状態を作る
 *
 *  [STEP 2] Cross を解く
 *    solveCross(scrambledState)
 *    → D面の白十字を完成させる最短手順（BFS）
 *    → CrossResult.stateAfter を次のステップへ渡す
 *
 *  [STEP 3] F2L を解く
 *    solveF2L(crossResult.stateAfter)
 *    → 中段4スロットを順番に完成させる（スロット別BFS）
 *    → F2LResult.stateAfter を次のステップへ渡す
 *
 *  [STEP 4] OLL を解く
 *    solveOLL(f2lResult.stateAfter)
 *    → U面の向きを揃える（テーブルルックアップ）
 *    → OLLResult.stateAfter を次のステップへ渡す
 *
 *  [STEP 5] PLL を解く
 *    solvePLL(ollResult.stateAfter)
 *    → U段の位置を揃える（テーブルルックアップ）
 *    → PLLResult.stateAfter が完成状態になる
 *
 *  [STEP 6] 結果を整形して返す
 *    全フェーズの moves を結合 → solution
 *    countHTM / countQTM で手数を計算
 *
 * ═══════════════════════════════════════════════════════════════
 *  ファイル構成（参考）
 * ═══════════════════════════════════════════════════════════════
 *
 *  src/lib/
 *    cube/
 *      moves.ts          CubeState型・applyMoves・SOLVED_STATE等
 *    cfop-solver/
 *      detection.ts      各フェーズ完了判定関数
 *      cross.ts          Crossソルバー（BFS）
 *      f2l.ts            F2Lソルバー（スロット別BFS）
 *      oll-pll.ts        OLL/PLLソルバー（テーブルルックアップ）
 *      cfop-solver.ts    ← このファイル（統合エントリ）
 */

// ─── import ───────────────────────────────────────────────────────────────────

import {
  applyMoves,
  countHTM,
  countQTM,
  parseMoveString,
  cancelMoves,
  SOLVED_STATE,
  type CubeState,
  type Move,
} from "../cube/moves";

import { solveCross, type CrossResult } from "./cross";
import { solveF2L,  type F2LResult   } from "./f2l";
import { solveOLL, solvePLL,
         type OLLResult, type PLLResult } from "./oll-pll";
import { isPLLSolved, type F2LSlot }      from "./detection";

// ═══════════════════════════════════════════════════════════════
//  型定義
// ═══════════════════════════════════════════════════════════════

/**
 * solveCFOP が返す結果。
 * 全フェーズの手順・手数・状態をまとめて保持する。
 */
export type SolveResult = {

  /**
   * 全手順を1つの配列に結合したもの。
   * Cross + F2L + OLL + PLL の順。
   *
   * 例: この配列を applyMoves(scrambledState, solution) に渡すと
   *     完成状態になる。
   */
  solution: Move[];

  /**
   * HTM（Half-Turn Metric）での総手数。
   * U・U'・U2・R・R'・R2 … すべて1手として数える。
   * スピードキューブ競技での標準的な手数カウント方法。
   */
  totalHTM: number;

  /**
   * QTM（Quarter-Turn Metric）での総手数。
   * U・U' は1手、U2（半回転）は2手として数える。
   * 手の「物理的な回転量」を厳密に計算したい場合に使う。
   */
  totalQTM: number;

  /** フェーズ別の詳細情報 */
  phases: {

    /** Cross フェーズ */
    cross: {
      moves: Move[];
      /** このフェーズの HTM 手数 */
      htm: number;
    };

    /** F2L フェーズ */
    f2l: {
      moves: Move[];
      htm: number;
      /**
       * スロット別の手順。
       * デバッグや「各スロットに何手かかったか」の表示に使う。
       * 例: { FR: ["R","U","R'"], FL: [...], BR: [...], BL: [...] }
       */
      slotMoves: Record<F2LSlot, Move[]>;
    };

    /** OLL フェーズ */
    oll: {
      moves: Move[];
      htm: number;
    };

    /** PLL フェーズ */
    pll: {
      moves: Move[];
      htm: number;
    };
  };

  /**
   * スクランブル後のキューブ状態（54文字列）。
   * デバッグや状態の可視化に使う。
   */
  scrambledState: CubeState;

  /**
   * 解法適用後の最終キューブ状態（54文字列）。
   * isPLLSolved(solvedState) === true であれば解法が正しい。
   */
  solvedState: CubeState;
};

// ═══════════════════════════════════════════════════════════════
//  メイン関数
// ═══════════════════════════════════════════════════════════════

/**
 * CFOP 法でルービックキューブを解く。
 *
 * @param scramble - スクランブル手順の Move 配列
 * @returns SolveResult — 全手順・手数・フェーズ別詳細
 *
 * @throws スクランブルが不正（不正なMoveトークン等）の場合
 * @throws 各ソルバーで解が見つからなかった場合（通常は起きない）
 *
 * @example
 * ```typescript
 * import { solveCFOP } from "@/lib/cfop-solver/cfop-solver";
 *
 * const scramble: Move[] = [
 *   "R","U","R'","U'","F2","L","D'",
 *   "B2","R2","U","F","L2","D",
 *   "R","B'","U2","L'","F2","D2"
 * ];
 *
 * const result = solveCFOP(scramble);
 *
 * console.log("解法:", result.solution.join(" "));
 * console.log("総手数 (HTM):", result.totalHTM);
 * console.log("Cross:", result.phases.cross.moves.join(" "));
 * console.log("F2L  :", result.phases.f2l.moves.join(" "));
 * console.log("OLL  :", result.phases.oll.moves.join(" "));
 * console.log("PLL  :", result.phases.pll.moves.join(" "));
 * ```
 */
export function solveCFOP(scramble: Move[]): SolveResult {

  // ── STEP 1: Move[] → CubeState 変換 ──────────────────────────
  //
  // SOLVED_STATE（完成状態の54文字列）にスクランブルを適用して
  // 「スクランブル済みキューブ状態」を作る。
  //
  // SOLVED_STATE = "UUUUUUUUURRRRRRRRR FFFFFFFFF DDDDDDDDD LLLLLLLLL BBBBBBBBB"
  //
  const scrambledState: CubeState = applyMoves(SOLVED_STATE, scramble);

  // ── STEP 2: Cross を解く ──────────────────────────────────────
  //
  // D面の白十字（4エッジ）を完成させる最短手順を BFS で求める。
  // 最大 8〜9 手以内で必ず見つかる。
  //
  const crossResult: CrossResult = solveCross(scrambledState);

  // ── STEP 3: F2L を解く ────────────────────────────────────────
  //
  // Cross完了後の状態から、中段4スロット（FR・FL・BR・BL）を
  // 1スロットずつ BFS で完成させる。
  // 完成済みスロットを崩さないよう保護フィルターで制御する。
  //
  const f2lResult: F2LResult = solveF2L(crossResult.stateAfter);

  // ── STEP 4: OLL を解く ────────────────────────────────────────
  //
  // F2L完了後の状態から、U面の向きを揃える。
  // 57パターンのアルゴリズムテーブルをルックアップして解く。
  // AUF（U回転の事前調整）を自動で挿入する。
  //
  const ollResult: OLLResult = solveOLL(f2lResult.stateAfter);

  // ── STEP 5: PLL を解く ────────────────────────────────────────
  //
  // OLL完了後の状態から、U段のピースの位置を揃える。
  // 21パターンのアルゴリズムテーブルをルックアップして解く。
  // pre-AUF（前置U回転）と post-AUF（後置U回転）を自動で挿入する。
  //
  const pllResult: PLLResult = solvePLL(ollResult.stateAfter);

  // ── STEP 6: 結果を整形して返す ───────────────────────────────
  //
  // 全フェーズの手順を1つの配列に結合する。
  // Cross → F2L → OLL → PLL の順。
  //
  const solution: Move[] = [
    ...crossResult.moves,
    ...f2lResult.moves,
    ...ollResult.moves,
    ...pllResult.moves,
  ];

  // 最終状態を検証用に保存する
  // isPLLSolved(solvedState) === true であれば解法が正しい
  const solvedState: CubeState = pllResult.stateAfter;

  return {
    solution,
    totalHTM: countHTM(solution),
    totalQTM: countQTM(solution),
    phases: {
      cross: {
        moves: crossResult.moves,
        htm:   countHTM(crossResult.moves),
      },
      f2l: {
        moves:     f2lResult.moves,
        htm:       countHTM(f2lResult.moves),
        slotMoves: f2lResult.slotMoves,
      },
      oll: {
        moves: ollResult.moves,
        htm:   countHTM(ollResult.moves),
      },
      pll: {
        moves: pllResult.moves,
        htm:   countHTM(pllResult.moves),
      },
    },
    scrambledState,
    solvedState,
  };
}

// ═══════════════════════════════════════════════════════════════
//  ユーティリティ関数
// ═══════════════════════════════════════════════════════════════

/**
 * 解法結果を人間が読みやすい文字列にフォーマットして返す。
 *
 * 出力例:
 * ```
 * ── CFOP 解法 ──────────────────────────────
 * Cross : R U R' U'  (4手)
 * F2L   : R U R' U R U2 R'  (7手)
 *   FR  : R U R'
 *   FL  : L' U' L
 *   BR  : R' U' R
 *   BL  : L U L'
 * OLL   : F R U R' U' F'  (6手)
 * PLL   : R U R' U' R' F R2 U' R' U' R U R' F'  (14手)
 * ──────────────────────────────────────────
 * 解法  : R U R' U' R U R' ...
 * 総手数: 31手 (HTM) / 33手 (QTM)
 * ```
 *
 * @param result - solveCFOP の戻り値
 * @returns フォーマット済み文字列
 */
export function formatSolveResult(result: SolveResult): string {
  const { phases, solution, totalHTM, totalQTM } = result;

  const fmt = (moves: Move[]) =>
    moves.length > 0 ? moves.join(" ") : "(なし)";

  const lines: string[] = [
    "── CFOP 解法 ──────────────────────────────",
    `Cross : ${fmt(phases.cross.moves)}  (${phases.cross.htm}手)`,
    `F2L   : ${fmt(phases.f2l.moves)}  (${phases.f2l.htm}手)`,
    // スロット別の内訳
    ...(["FR", "FL", "BR", "BL"] as F2LSlot[]).map(slot => {
      const slotMovs = phases.f2l.slotMoves[slot];
      return `  ${slot}  : ${fmt(slotMovs)}`;
    }),
    `OLL   : ${fmt(phases.oll.moves)}  (${phases.oll.htm}手)`,
    `PLL   : ${fmt(phases.pll.moves)}  (${phases.pll.htm}手)`,
    "──────────────────────────────────────────",
    `解法  : ${fmt(solution)}`,
    `総手数: ${totalHTM}手 (HTM) / ${totalQTM}手 (QTM)`,
  ];

  return lines.join("\n");
}

/**
 * スペース区切りの文字列からスクランブルを解析して solveCFOP を呼ぶ
 * ショートカット関数。
 *
 * @param scrambleStr - スペース区切りのスクランブル文字列
 *   例: "R U R' U' F2 L D' B2 R2 U F L2 D R B' U2 L' F2 D2"
 * @returns SolveResult
 *
 * @example
 * ```typescript
 * const result = solveCFOPFromString(
 *   "R U R' U' F2 L D' B2 R2 U F L2 D R B' U2 L' F2 D2"
 * );
 * console.log(formatSolveResult(result));
 * ```
 */
export function solveCFOPFromString(scrambleStr: string): SolveResult {
  const moves = parseMoveString(scrambleStr);
  return solveCFOP(moves);
}

/**
 * 解法が正しいかを検証する。
 *
 * solveCFOP の戻り値の solvedState に対して
 * isPLLSolved を呼んで true が返るかをチェックする。
 *
 * STEP B（テスト）で利用することを想定している。
 *
 * @param result - solveCFOP の戻り値
 * @returns true = 解法が正しくキューブが完成している
 *
 * @example
 * ```typescript
 * const result = solveCFOP(scramble);
 * if (!verifySolveResult(result)) {
 *   console.error("解法が不正です:", result.solvedState);
 * }
 * ```
 */
export function verifySolveResult(result: SolveResult): boolean {
  return isPLLSolved(result.solvedState);
}

// ═══════════════════════════════════════════════════════════════
//  re-export（外部から1ファイルで全型・関数にアクセスできるよう）
// ═══════════════════════════════════════════════════════════════

//  使う側は cfop-solver.ts だけ import すればよい。
//  各サブモジュールを直接 import する必要はない。

export type { CubeState, Move }       from "../cube/moves";
export type { CrossResult }           from "./cross";
export type { F2LResult }             from "./f2l";
export type { OLLResult, PLLResult }  from "./oll-pll";
export type { F2LSlot, PhaseStatus }  from "./detection";