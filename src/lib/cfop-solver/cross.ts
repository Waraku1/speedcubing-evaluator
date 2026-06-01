/**
 * cross.ts — CFOP Cross ソルバー
 *
 * ホワイトクロス（D面の十字）を完成させる最短手順を
 * BFS（幅優先探索）で求める。
 *
 * ── このファイルが担う役割 ────────────────────────────────────────
 *
 *   入力: スクランブル済みの CubeState（moves.ts の 54 文字列）
 *   出力: CrossResult
 *           .moves      → クロスを完成させる Move の配列（最短手順）
 *           .depth      → 手数
 *           .stateAfter → クロス完成後のキューブ状態
 *
 * ── 次のフェーズへの状態引き渡し ──────────────────────────────────
 *
 *  CFOP は 4 フェーズが連鎖する。各ソルバーは
 *  「前のフェーズが終わった状態」から探索を始める必要がある。
 *
 *    solveCross(初期状態)
 *      → CrossResult.stateAfter        ← クロス完成後の状態
 *              ↓ そのまま次に渡す
 *    solveF2L(crossResult.stateAfter)
 *      → F2LResult.stateAfter          ← F2L完成後の状態
 *              ↓ そのまま次に渡す
 *    solveOLL(f2lResult.stateAfter)
 *      → OLLResult.stateAfter          ← OLL完成後の状態
 *              ↓ そのまま次に渡す
 *    solvePLL(ollResult.stateAfter)
 *      → PLLResult.moves / PLLResult.stateAfter  ← 完全に解けた状態
 *
 *  cfopSolver.ts 側では:
 *    const solution = [
 *      ...crossResult.moves,
 *      ...f2lResult.moves,
 *      ...ollResult.moves,
 *      ...pllResult.moves,
 *    ];
 *  と結合するだけで完全な解法手順になる。
 *
 * ── 実装順序と出力順序は独立している ─────────────────────────────
 *
 *  このプロジェクトでは Cross → OLL/PLL → F2L の順で実装するが、
 *  これはあくまで「コードを書く順番」の話。
 *
 *  理由: F2L はコーナーとエッジの位置・向きの組み合わせが多く
 *        最も複雑なフェーズ。Cross と OLL/PLL を先に完成させると
 *        「Cross + (F2Lスキップ) + OLL + PLL」の形で
 *        部分的な動作確認が早期にできる。
 *        F2L にバグがあっても他フェーズと切り離して調査できる。
 *
 *  手順の出力順番は cfopSolver.ts が制御するため、
 *  実装順序に関わらず必ず Cross → F2L → OLL → PLL の順になる。
 *
 * ── BFS とは何か ──────────────────────────────────────────────────
 *
 *  BFS（Breadth-First Search / 幅優先探索）とは、
 *  「1手で到達できる全状態 → 2手で到達できる全状態 → …」と
 *  層（深さ）を順番に広げながら目標状態を探す方法。
 *
 *  ポイント:
 *  - 最初に目標が見つかった時点の手数が必ず最短になる。
 *  - DFS（深さ優先）と違い、遠回りの経路を先に調べることがない。
 *
 *  イメージ（深さ = 手数）:
 *
 *    深さ 0:  [初期状態]
 *    深さ 1:  [U を打った状態] [R を打った状態] … 18通り
 *    深さ 2:  深さ1 の各状態に 15手を追加 … 最大 270通り
 *    深さ 3:  さらに 15手を追加 … 最大 4,050通り
 *    …
 *    深さ 7:  クロスは必ずここまでに見つかる（理論的最大値）
 *
 * ── 枝刈り（探索の効率化） ────────────────────────────────────────
 *
 *  [1] visited Set（訪問済み管理）
 *      同じキューブ状態を 2 度探索しないよう、
 *      一度調べた CubeState（54文字列）を Set に記録する。
 *      これにより「別経路で同じ状態に到達」しても無視できる。
 *
 *  [2] 同一面の連続を排除
 *      直前の手と同じ面（例: R の直後に R, R', R2）を打っても
 *      等価な別の1手で表せるため重複になる。
 *      これを除外することで探索を 18手 → 15手 に削減できる。
 *
 *      例:  R → R  ≡  R2
 *           R → R' ≡  （何もしない）
 *           R → R2 ≡  R'
 *      → 直前と同じ面のムーブは全部スキップ
 *
 * ── ノード構造（メモリ最適化） ────────────────────────────────────
 *
 *  素朴な実装ではキューに { state, moves: Move[] } を積むが、
 *  深さ 7 になると moves 配列のコピーが大量発生してメモリを圧迫する。
 *
 *  本実装では「親ノードへの参照」方式を使う。
 *
 *    Node = {
 *      state  : CubeState   ← この時点のキューブ状態
 *      move   : Move | null ← この状態に至った1手（根は null）
 *      parent : Node | null ← 1つ前のノード（根は null）
 *      depth  : number      ← 現在の深さ（= 手数）
 *    }
 *
 *  目標発見後は parent を遡るだけで手順を再構成できる。
 *  配列コピーが一切不要なのでメモリ効率が大幅に向上する。
 *
 *    [再構成の流れ]
 *      goalNode → parent → parent → … → root
 *      手順を逆順に収集 → reverse() → 完成
 */

import { applyMove, type Move } from "../cube/moves";
import { isCrossSolved }        from "./detection";
import type { CubeState }       from "../cube/moves";

// ─── 定数 ────────────────────────────────────────────────────────────────────

/**
 * 使用する 18 手の全リスト。
 * moves.ts には全手リストが export されていないため、ここで定義する。
 */
const ALL_MOVES: readonly Move[] = [
  "U", "U'", "U2",
  "R", "R'", "R2",
  "F", "F'", "F2",
  "D", "D'", "D2",
  "L", "L'", "L2",
  "B", "B'", "B2",
];

/**
 * クロスの理論的最大手数は 8 手。
 * 安全のため 9 を上限にしておく（通常は 7 以内で解ける）。
 */
const MAX_DEPTH = 9;

// ─── 型定義 ───────────────────────────────────────────────────────────────────

/**
 * BFS の探索ノード。
 * 親ノードへの参照を持つことで、発見後に手順を遡って再構成できる。
 */
type SearchNode = {
  /** この時点のキューブ状態 */
  state: CubeState;
  /** この状態に至るために打った1手（根ノードは null） */
  move: Move | null;
  /** 1つ前のノード（根ノードは null） */
  parent: SearchNode | null;
  /** ここまでの手数（= 深さ） */
  depth: number;
};

/** solveCross が返す結果 */
export type CrossResult = {
  /** クロスを完成させる手順（最短）。すでに完成していれば空配列。 */
  moves: Move[];
  /** 手数 */
  depth: number;
  /**
   * クロス完成後のキューブ状態。
   * 次フェーズ（F2L）のソルバーにそのまま渡す。
   *
   * 正しい受け渡しの順序:
   *   const cross = solveCross(scrambled);
   *   const f2l   = solveF2L(cross.stateAfter);    // ← Crossの後はF2L
   *   const oll   = solveOLL(f2l.stateAfter);      // ← F2Lの後にOLL
   *   const pll   = solvePLL(oll.stateAfter);      // ← OLLの後にPLL
   *
   * ※ cross.stateAfter を直接 solveOLL に渡さないこと。
   *    Cross完了後は中段4スロット（F2L）がまだ揃っていない。
   */
  stateAfter: CubeState;
};

// ─── 内部ヘルパー ─────────────────────────────────────────────────────────────

/**
 * Move 文字列から「面名」を取り出す。
 *
 * "R"  → "R"
 * "R'" → "R"
 * "R2" → "R"
 *
 * 同一面の連続を検出するために使う。
 */
function faceOf(move: Move): string {
  return move[0];
}

/**
 * 発見ノードから根ノードまで parent を遡り、
 * 手順の配列を再構成して返す。
 *
 * 遡り方:
 *   goalNode.move → parent.move → … → root（move === null）
 *   末端から根方向に収集するので最後に reverse() が必要。
 */
function reconstructPath(node: SearchNode): Move[] {
  const path: Move[] = [];
  let current: SearchNode | null = node;

  while (current !== null && current.move !== null) {
    path.push(current.move);
    current = current.parent;
  }

  // push した順は「最後の手 → 最初の手」なので逆順にする
  path.reverse();
  return path;
}

// ─── メイン ───────────────────────────────────────────────────────────────────

/**
 * ホワイトクロスを完成させる最短手順を BFS で求める。
 *
 * アルゴリズムの流れ:
 *   1. 初期状態をキューに積む
 *   2. キューの先頭ノードを取り出す
 *   3. クロスが完成していれば手順を再構成して返す
 *   4. MAX_DEPTH に達していれば次の手を探索しない（枝刈り）
 *   5. 18手 × 枝刈りで次状態を生成し、未訪問ならキューに積む
 *   6. キューが空になるまで繰り返す
 *
 * @param state - スクランブル済み CubeState（54文字列）
 * @returns CrossResult — moves に最短手順、depth に手数が入る
 * @throws スクランブルが不正でクロスが解けない場合（通常は起きない）
 */
export function solveCross(state: CubeState): CrossResult {

  // ── ステップ1: すでにクロスが完成していれば即返す ─────────────────
  if (isCrossSolved(state).solved) {
    // クロスがすでに完成しているので状態は変化しない
    return { moves: [], depth: 0, stateAfter: state };
  }

  // ── ステップ2: BFS の初期化 ───────────────────────────────────────

  // 訪問済み状態を記録する Set。
  // CubeState は 54 文字の文字列なのでそのまま格納できる。
  const visited = new Set<string>();
  visited.add(state);

  // 根ノード（初期状態）
  const rootNode: SearchNode = {
    state,
    move:   null,
    parent: null,
    depth:  0,
  };

  // BFS キュー。JavaScript の配列を使い、push で追加・shift で取り出す。
  const queue: SearchNode[] = [rootNode];

  // ── ステップ3: BFS メインループ ──────────────────────────────────

  while (queue.length > 0) {

    // キューの先頭を取り出す（= 最も浅い未探索ノード）
    const current = queue.shift()!;

    // ── ステップ4: 深さ上限に達したら次の手を追加しない ─────────
    if (current.depth >= MAX_DEPTH) continue;

    // ── ステップ5: 18手（枝刈り済み）を順番に試す ────────────────
    for (const move of ALL_MOVES) {

      // 枝刈り: 直前と同じ面への操作はスキップする
      // 例: 直前が "R" なら "R", "R'", "R2" はすべてスキップ
      if (
        current.move !== null &&
        faceOf(move) === faceOf(current.move)
      ) {
        continue;
      }

      // この手を適用した新しいキューブ状態を計算
      const nextState = applyMove(current.state, move);

      // 訪問済みならスキップ（同じ状態を再探索しない）
      if (visited.has(nextState)) continue;
      visited.add(nextState);

      // 新しいノードを作成（moves 配列のコピーは不要）
      const nextNode: SearchNode = {
        state:  nextState,
        move,
        parent: current,
        depth:  current.depth + 1,
      };

      // ── ステップ6: クロス完成チェック ────────────────────────
      if (isCrossSolved(nextState).solved) {
        // 親を遡って手順を再構成して返す
        const moves = reconstructPath(nextNode);
        return {
          moves,
          depth:      moves.length,
          stateAfter: nextState,   // ← クロス完成時点の状態を保持
        };
      }

      // 未完成ならキューに追加して次の深さで探索
      queue.push(nextNode);
    }
  }

  // ── ここに到達するのは不正なキューブ状態のみ ──────────────────────
  throw new Error(
    `[solveCross] クロスを解く手順が見つかりませんでした。` +
    `スクランブルが正しい CubeState であるか確認してください。`
  );
}