/**
 * f2l.ts — CFOP F2L（First Two Layers）ソルバー
 *
 * ═══════════════════════════════════════════════════════════════
 *  このファイルの全体像
 * ═══════════════════════════════════════════════════════════════
 *
 *  F2L = First Two Layers（下2段を完成させる）
 *
 *  Cross完了後に残っている未完成箇所:
 *    D面: 十字のみ完成（コーナー4個は未完成）
 *    側面中段: 4スロット（FR・FL・BR・BL）が全て未完成
 *
 *  F2Lでやること:
 *    4つのスロット（FR・FL・BR・BL）それぞれに
 *    「コーナー1個 + エッジ1個」のペアを正しく収める。
 *    これが完成すると「下2段」が全て揃い、OLLへ進める。
 *
 *  受け取る状態: solveCross の stateAfter（Cross完了後）
 *  返す状態:     F2L完全完成後 → solveOLL へ渡す
 *
 * ═══════════════════════════════════════════════════════════════
 *  スロットとは何か
 * ═══════════════════════════════════════════════════════════════
 *
 *  キューブの下2段には4つの「スロット」がある。
 *  スロット名は「接している面の組み合わせ」で決まる。
 *
 *    FR スロット: Front面とRight面の境界（前右）
 *    FL スロット: Front面とLeft面の境界（前左）
 *    BR スロット: Back面とRight面の境界（後右）
 *    BL スロット: Back面とLeft面の境界（後左）
 *
 *  各スロットには「コーナー（角）1個 + エッジ（辺）1個」が入る。
 *
 *  スロットごとの完成位置インデックス（moves.ts レイアウト）:
 *
 *            ┌──────────┐
 *            │  0  1  2 │  U面
 *            │  3  4  5 │
 *            │  6  7  8 │
 * ┌──────────┼──────────┼──────────┬──────────┐
 * │ 36 37 38 │ 18 19 20 │  9 10 11 │ 45 46 47 │  ← 上段
 * │ 39 40 41 │ 21 22 23 │ 12 13 14 │ 48 49 50 │  ← 中段（F2Lエッジ）
 * │ 42 43 44 │ 24 25 26 │ 15 16 17 │ 51 52 53 │  ← 下段（F2Lコーナー）
 * └──────────┼──────────┼──────────┴──────────┘
 *            │ 27 28 29 │  D面
 *            │ 30 31 32 │
 *            │ 33 34 35 │
 *            └──────────┘
 *
 *  FR: コーナー 26(F),15(R),29(D)  エッジ 23(F),12(R)
 *  FL: コーナー 24(F),44(L),27(D)  エッジ 21(F),41(L)
 *  BR: コーナー 51(B),17(R),35(D)  エッジ 48(B),14(R)
 *  BL: コーナー 53(B),42(L),33(D)  エッジ 50(B),39(L)
 *
 * ═══════════════════════════════════════════════════════════════
 *  解法アプローチ：スロット別BFS ＋ 完成済みスロット保護
 * ═══════════════════════════════════════════════════════════════
 *
 *  F2Lを一度に全スロットBFSで解こうとすると状態空間が爆発する。
 *  （4スロット同時 = 18^12 以上の組み合わせ）
 *
 *  そこで「1スロットずつ順番に解く」方式を採用する。
 *
 *  処理順序: FR → FL → BR → BL
 *
 *  ─── スロット別BFSの流れ ─────────────────────────────────────
 *
 *    [FR を解く]
 *      現在の状態から FR スロットだけを完成させるBFS。
 *      深さ上限: 12手。
 *      保護: Crossの8マスを崩す手を除外。
 *
 *    [FL を解く]
 *      FR完成後の状態から FL を解くBFS。
 *      保護: Cross(8マス) + FR完成済みスロット(5マス) を崩す手を除外。
 *
 *    [BR を解く]
 *      FR+FL完成後の状態から BR を解くBFS。
 *      保護: Cross + FR + FL の合計13マスを監視。
 *
 *    [BL を解く]
 *      FR+FL+BR完成後の状態から BL を解くBFS。
 *      保護: Cross + FR + FL + BR の合計18マスを監視。
 *
 * ═══════════════════════════════════════════════════════════════
 *  完成済みスロット保護の仕組み
 * ═══════════════════════════════════════════════════════════════
 *
 *  次の手を試すとき、以下の手順でフィルターをかける:
 *
 *    1. 手を適用した「次の状態」を計算する
 *    2. 保護対象インデックスのリストを参照する
 *    3. いずれかのインデックスの色が変化していれば、その手をスキップ
 *    4. 変化がなければ探索を続ける
 *
 *  これにより「すでに完成しているスロットを崩す手」が
 *  自動的に除外される。
 *
 *  保護対象インデックス:
 *    Cross:  [28, 30, 32, 34, 25, 43, 16, 52]  (D面十字8マス)
 *    FR完成: [26, 15, 29, 23, 12]               (コーナー3 + エッジ2)
 *    FL完成: [24, 44, 27, 21, 41]
 *    BR完成: [51, 17, 35, 48, 14]
 *    BL完成: [53, 42, 33, 50, 39]
 *
 * ═══════════════════════════════════════════════════════════════
 *  フェーズ連携
 * ═══════════════════════════════════════════════════════════════
 *
 *   solveCross(scrambled).stateAfter
 *       ↓ Cross完了後の状態
 *   solveF2L(crossResult.stateAfter)
 *       → F2LResult.stateAfter
 *       ↓ 下2段完全完成後の状態
 *   solveOLL(f2lResult.stateAfter)
 */

import { applyMove, type Move }                   from "../cube/moves";
import { isF2LSlotSolved, type F2LSlot }           from "./detection";
import type { CubeState }                          from "../cube/moves";

// ═══════════════════════════════════════════════════════════════
//  定数
// ═══════════════════════════════════════════════════════════════

/** F2L BFS で使用する全18手 */
const ALL_MOVES: readonly Move[] = [
  "U", "U'", "U2",
  "R", "R'", "R2",
  "F", "F'", "F2",
  "D", "D'", "D2",
  "L", "L'", "L2",
  "B", "B'", "B2",
];

/**
 * F2L 1スロットあたりの BFS 深さ上限。
 * 競技上の最悪ケースは 11〜12 手程度。
 */
const MAX_DEPTH = 12;

/**
 * スロット処理順序。
 * 前面から見えるスロット（FR・FL）を先に解く。
 */
const SLOT_ORDER: readonly F2LSlot[] = ["FR", "FL", "BR", "BL"];

// ─── 保護インデックス定義 ─────────────────────────────────────────────────────

/**
 * Cross完成後に保護すべきインデックス（8マス）。
 *
 * D面の十字エッジ4マス + 隣接面エッジ4マス。
 * センター（31番）は常に固定なので監視不要。
 *
 *   D面エッジ: 28(D-F), 30(D-L), 32(D-R), 34(D-B)
 *   隣接面:   25(F),   43(L),   16(R),   52(B)
 *   ,25,43,16,52を減らし、cross_guardを緩和している→今はしてない
 */
const CROSS_GUARD: readonly number[] = [28, 30, 32, 34, 25, 43, 16, 52];

/**
 * 各スロット完成後に保護すべきインデックス（5マス）。
 * コーナー3マス + エッジ2マス。
 */
const SLOT_GUARD: Readonly<Record<F2LSlot, readonly number[]>> = {
  FR: [26, 15, 29, 23, 12],
  FL: [24, 44, 27, 21, 41],
  BR: [51, 17, 35, 48, 14],
  BL: [53, 42, 33, 50, 39],
};

// ═══════════════════════════════════════════════════════════════
//  型定義
// ═══════════════════════════════════════════════════════════════

/** solveF2L が返す結果 */
export type F2LResult = {
  /**
   * 全4スロット分の手順を結合したもの。
   * solveOLL にそのまま渡す stateAfter の元となる。
   */
  moves: Move[];
  /** 総手数 */
  depth: number;
  /**
   * F2L完全完成後のキューブ状態。
   * 次フェーズ solveOLL にそのまま渡す。
   *
   *   const f2l = solveF2L(crossResult.stateAfter);
   *   const oll = solveOLL(f2l.stateAfter);  // ← そのまま渡せる
   */
  stateAfter: CubeState;
  /**
   * スロットごとの個別手順（デバッグ・表示用）。
   * 例: { FR: ["R","U","R'"], FL: [...], BR: [...], BL: [...] }
   */
  slotMoves: Record<F2LSlot, Move[]>;
};

/** BFS ノード（cross.ts と同じ親参照方式） */
type SearchNode = {
  state:  CubeState;
  move:   Move | null;
  parent: SearchNode | null;
  depth:  number;
};

// ═══════════════════════════════════════════════════════════════
//  内部ヘルパー
// ═══════════════════════════════════════════════════════════════

/**
 * 移動前後で保護インデックスの色が変化しているか確認する。
 *
 * @param before   - 手を打つ前の状態
 * @param after    - 手を打った後の状態
 * @param guards   - 監視するインデックスの配列
 * @returns true = 変化あり（この手はスキップすべき）
 */
function breaksGuard(
  before: CubeState,
  after: CubeState,
  guards: readonly number[]
): boolean {
  for (const idx of guards) {
    if (before[idx] !== after[idx]) return true;
  }
  return false;
}

/**
 * Move 文字列から面名を取り出す（同一面連続の枝刈り用）。
 * "R'" → "R",  "U2" → "U"
 */
function faceOf(move: Move): string {
  return move[0];
}

/**
 * ゴールノードから根ノードまで親を遡り手順を再構成する。
 * cross.ts の reconstructPath と同じロジック。
 */
function reconstructPath(node: SearchNode): Move[] {
  const path: Move[] = [];
  let cur: SearchNode | null = node;
  while (cur !== null && cur.move !== null) {
    path.push(cur.move);
    cur = cur.parent;
  }
  path.reverse();
  return path;
}

// ═══════════════════════════════════════════════════════════════
//  スロット単体 BFS
// ═══════════════════════════════════════════════════════════════

/**
 * 指定した1スロットを完成させる最短手順をBFSで求める。
 *
 * ── 処理の流れ ────────────────────────────────────────────────
 *
 *  1. すでにスロットが完成していれば即返す（0手）。
 *
 *  2. BFS を初期化する。
 *       visited Set に初期状態を登録。
 *       根ノードをキューに積む。
 *
 *  3. BFS メインループ:
 *       キューの先頭を取り出す（最も浅い未探索ノード）。
 *       深さ上限に達したらスキップ（枝刈り）。
 *       18手を試す:
 *         a. 直前と同じ面はスキップ（同一面連続の除外）
 *         b. 手を適用した次状態を計算
 *         c. 保護インデックスの色が変化していればスキップ
 *         d. 訪問済みならスキップ
 *         e. 対象スロットが完成していれば手順を再構成して返す
 *         f. 未完成ならキューに積んで次の深さへ
 *
 * @param state   - 現在のキューブ状態
 * @param slot    - 解くスロット名
 * @param guards  - 保護するインデックスの配列（Cross + 完成済みスロット）
 * @returns 手順の配列（最短）と完成後の状態
 */
function solveSlot(
  state: CubeState,
  slot: F2LSlot,
  guards: readonly number[]
): { moves: Move[]; stateAfter: CubeState } {

  // ── ステップ1: すでに完成していれば即返す ─────────────────────
  if (isF2LSlotSolved(state, slot)) {
    return { moves: [], stateAfter: state };
  }

  // ── ステップ2: BFS 初期化 ─────────────────────────────────────
  const visited = new Set<string>();
  visited.add(state);

  const root: SearchNode = { state, move: null, parent: null, depth: 0 };
  const queue: SearchNode[] = [root];

  // ── ステップ3: BFS メインループ ──────────────────────────────
  while (queue.length > 0) {
    const current = queue.shift()!;

    // 深さ上限に達したら次の手を追加しない
    if (current.depth >= MAX_DEPTH) continue;

    for (const move of ALL_MOVES) {

      // (a) 直前と同じ面はスキップ
      if (
        current.move !== null &&
        faceOf(move) === faceOf(current.move)
      ) continue;

      // (b) 次の状態を計算
      const nextState = applyMove(current.state, move);

      // (c) 保護インデックスの色が変化していればスキップ
      //     → すでに完成しているCrossやスロットを崩す手を除外する
      if (breaksGuard(current.state, nextState, guards)) continue;

      // (d) 訪問済みならスキップ
      if (visited.has(nextState)) continue;
      visited.add(nextState);

      const nextNode: SearchNode = {
        state:  nextState,
        move,
        parent: current,
        depth:  current.depth + 1,
      };

      // (e) 対象スロットが完成したら手順を再構成して返す
      if (isF2LSlotSolved(nextState, slot)) {
        return {
          moves:      reconstructPath(nextNode),
          stateAfter: nextState,
        };
      }

      // (f) 未完成ならキューに追加
      queue.push(nextNode);
    }
  }

  // BFS で見つからなかった場合（不正な状態か深さ不足）
  throw new Error(
    `[solveSlot] スロット ${slot} の解が見つかりませんでした。\n` +
    `深さ上限: ${MAX_DEPTH} 手。保護インデックス数: ${guards.length}。\n` +
    `Cross が正しく完成しているか確認してください。`
  );
}

// ═══════════════════════════════════════════════════════════════
//  F2L メインソルバー
// ═══════════════════════════════════════════════════════════════

/**
 * F2L（First Two Layers）の4スロットを全て完成させる。
 *
 * ── 処理の流れ ────────────────────────────────────────────────
 *
 *  FR → FL → BR → BL の順で1スロットずつ BFS で解く。
 *
 *  各スロットを解くたびに:
 *    - 完成済みスロットの保護インデックスを累積して追加する
 *    - 次のスロットのBFSでは保護が強まる
 *
 *  具体的な保護インデックスの累積:
 *
 *    FR解く前: CROSS_GUARD のみ (8マス)
 *    FL解く前: CROSS_GUARD + FR_GUARD (13マス)
 *    BR解く前: CROSS_GUARD + FR_GUARD + FL_GUARD (18マス)
 *    BL解く前: CROSS_GUARD + FR_GUARD + FL_GUARD + BR_GUARD (23マス)
 *
 * @param state - Cross完了後の CubeState
 * @returns F2LResult — 全スロットの手順・状態を含む
 */
export function solveF2L(state: CubeState): F2LResult {

  let currentState = state;

  // 累積保護インデックス（Crossの8マスから始める）
  const guards: number[] = [...CROSS_GUARD];

  // 全スロット分の手順を蓄積する
  const allMoves: Move[] = [];
  const slotMoves: Record<F2LSlot, Move[]> = {
    FR: [], FL: [], BR: [], BL: [],
  };

  // ── スロットを順番に解く ──────────────────────────────────────
  for (const slot of SLOT_ORDER) {

    // このスロットを現在の保護インデックスでBFS
    const result = solveSlot(currentState, slot, guards);

    // 手順を蓄積
    slotMoves[slot] = result.moves;
    allMoves.push(...result.moves);

    // 状態を更新（次のスロットはこの状態から始める）
    currentState = result.stateAfter;

    // 完成したスロットのインデックスを保護リストに追加
    // → 次のスロットのBFSでこのスロットを崩さないようにする
    guards.push(...SLOT_GUARD[slot]);
  }

  return {
    moves:      allMoves,
    depth:      allMoves.length,
    stateAfter: currentState,
    slotMoves,
  };
}