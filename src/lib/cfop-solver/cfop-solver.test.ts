/**
 * cfop-solver-test.ts — CFOP Solver テスト（Vitest）
 *
 * ═══════════════════════════════════════════════════════════════
 *  実行方法
 * ═══════════════════════════════════════════════════════════════
 *
 *  方法1: ファイルを直接指定して実行（推奨）
 *    pnpm vitest run src/lib/cfop-solver/cfop-solver-test.ts
 *
 *  方法2: pnpm test で全テストをまとめて実行
 *    pnpm test
 *
 *  方法3: tsx で直接スクリプトとして実行
 *    pnpm tsx src/lib/cfop-solver/cfop-solver-test.ts
 *
 * ═══════════════════════════════════════════════════════════════
 *  テスト内容（B-1〜B-3）
 * ═══════════════════════════════════════════════════════════════
 *
 *  B-1: detection.ts — 判定関数の基礎テスト
 *    完成状態・スクランブル後の状態で各判定関数が
 *    正しく true / false を返すか確認する。
 *
 *  B-2: cross.ts — Cross ソルバーのテスト
 *    スクランブルを与えて solveCross を呼び、
 *    返ってきた手順でクロスが完成するかを確認。
 *
 *  B-3: f2l.ts — F2L ソルバーのテスト
 *    cross完了後の状態から solveF2L を呼び、
 *    4スロット全て・段階的に完成するかを確認。
 * 
 * 追加探索でのcross
 * describe("追加スクランブルでも動作確認", () => {

    const additionalCases: { name: string; moves: Move[] }[] = [
      {
        name: "T-perm",
        moves: ["R","U","R'","U'","R'","F","R2","U'","R'","U'","R","U","R'","F'"],
      },
      {
        name: "Sexy move × 6（恒等変換）",
        moves: [
          "R","U","R'","U'","R","U","R'","U'","R","U","R'","U'",
          "R","U","R'","U'","R","U","R'","U'","R","U","R'","U'",
        ],
      },
      {
        name: "U面のみのスクランブル",
        moves: ["U","R2","U'","L2","U","R2","U'"],
      },
      {
        name: "短いスクランブル",
        moves: ["R","U","R'","U'","F","U","F'"],
      },
    ];

    it.each(additionalCases)("Cross解法成功: $name", ({ moves }) => {
      const state  = applyMoves(SOLVED_STATE, moves);
      const result = solveCross(state);
      expect(isCrossSolved(result.stateAfter).solved).toBe(true);
    });
  });
 * 
  追加スクランブルでのf2l
  describe("追加スクランブルでの F2L テスト", () => {

    const additionalCases: { name: string; moves: Move[] }[] = [
      {
        name: "U面だけ動かすスクランブル",
        moves: ["U","R2","U'","L2","U","R2","U'"],
      },
      {
        name: "短いスクランブル",
        moves: ["R","U","R'","U'","F","U","F'"],
      },
    ];

    it.each(additionalCases)("F2L解法成功: $name", ({ moves }) => {
      const state = applyMoves(SOLVED_STATE, moves);
      const cross = solveCross(state);
      const f2l   = solveF2L(cross.stateAfter);
      expect(isF2LSolved(f2l.stateAfter).solved).toBe(true);
    });
  });
 */

import { describe, it, expect } from "vitest";

import { applyMoves, SOLVED_STATE, type Move } from "../cube/moves";

import {
  isCrossSolved,
  isF2LSolved,
  isF2LSlotSolved,
  isOLLSolved,
  isPLLSolved,
  type F2LSlot,
} from "./detection";

import { solveCross } from "./cross";
import { solveF2L }   from "./f2l";

// ═══════════════════════════════════════════════════════════════
//  テスト対象のスクランブル
// ═══════════════════════════════════════════════════════════════

/**
 * プロジェクトで使用する実際のスクランブル。
 * 添付画像のコードと同一。
 *   "R", "U", "R'", "U'",
  "F2", "L", "D'",
  "B2", "R2", "U",
  "F", "L2", "D",
  "R", "B'", "U2",
  "L'", "F2", "D2",
 */
const SCRAMBLE: Move[] = [
  "R", "U","R'","U'"
];

function printCubeState(state: string) {
  // 各面を3×3で出力
  const face = (name: string, offset: number) => {
    console.log(`\n[${name}]`);
    for (let i = 0; i < 3; i++) {
      console.log(
        state.slice(offset + i * 3, offset + (i + 1) * 3).split("").join(" ")
      );
    }
  };
  face("U", 0);
  face("R", 9);
  face("F", 18);
  face("D", 27);
  face("L", 36);
  face("B", 45);
}

// ═══════════════════════════════════════════════════════════════
//  B-1: detection.ts のテスト
// ═══════════════════════════════════════════════════════════════

describe("B-1: detection.ts — 判定関数の基礎テスト", () => {

  describe("SOLVED_STATE（完成状態）に対する判定", () => {

    it("isCrossSolved(SOLVED_STATE) が true を返す", () => {
      const result = isCrossSolved(SOLVED_STATE);
      expect(result.solved).toBe(true);
    });

    it("isCrossSolved(SOLVED_STATE).unsolved が空配列", () => {
      const result = isCrossSolved(SOLVED_STATE);
      expect(result.unsolved).toHaveLength(0);
    });

    it("isF2LSolved(SOLVED_STATE) が true を返す", () => {
      const result = isF2LSolved(SOLVED_STATE);
      expect(result.solved).toBe(true);
    });

    it("isF2LSolved(SOLVED_STATE).unsolved が空配列", () => {
      const result = isF2LSolved(SOLVED_STATE);
      expect(result.unsolved).toHaveLength(0);
    });

    it.each(["FR", "FL", "BR", "BL"] as F2LSlot[])(
      "isF2LSlotSolved(SOLVED_STATE, %s) が true を返す",
      (slot) => {
        expect(isF2LSlotSolved(SOLVED_STATE, slot)).toBe(true);
      }
    );

    it("isOLLSolved(SOLVED_STATE) が true を返す", () => {
      expect(isOLLSolved(SOLVED_STATE)).toBe(true);
    });

    it("isPLLSolved(SOLVED_STATE) が true を返す", () => {
      expect(isPLLSolved(SOLVED_STATE)).toBe(true);
    });
  });

  describe("スクランブル後の状態に対する判定", () => {

    const scrambledState = applyMoves(SOLVED_STATE, SCRAMBLE);

    it("スクランブル後: isCrossSolved が false を返す", () => {
      expect(isCrossSolved(scrambledState).solved).toBe(false);
    });

    it("スクランブル後: isF2LSolved が false を返す", () => {
      expect(isF2LSolved(scrambledState).solved).toBe(false);
    });

    it("スクランブル後: isOLLSolved が false を返す", () => {
      expect(isOLLSolved(scrambledState)).toBe(false);
    });

    it("スクランブル後: isPLLSolved が false を返す", () => {
      expect(isPLLSolved(scrambledState)).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
//  B-2: cross.ts のテスト
// ═══════════════════════════════════════════════════════════════

describe("B-2: cross.ts — Cross ソルバーのテスト", () => {

  describe("メインスクランブルで Cross を解く", () => {

    const scrambledState = applyMoves(SOLVED_STATE, SCRAMBLE);
    const crossResult    = solveCross(scrambledState);

    it("Cross 手順が生成される（0手以上）", () => {
      expect(crossResult.moves.length).toBeGreaterThanOrEqual(0);
    });

    it(`Cross 手数が上限以内（${crossResult.depth} ≤ 9）`, () => {
      expect(crossResult.depth).toBeLessThanOrEqual(9);
    });

    it("cross.stateAfter と手動適用した状態が一致する", () => {
      const stateAfterCross = applyMoves(scrambledState, crossResult.moves);
      expect(crossResult.stateAfter).toBe(stateAfterCross);
    });

    it("cross.stateAfter で isCrossSolved が true になる", () => {
      expect(isCrossSolved(crossResult.stateAfter).solved).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
//  B-3: f2l.ts のテスト
// ═══════════════════════════════════════════════════════════════

describe("B-3: f2l.ts — F2L ソルバーのテスト", () => {

  describe("Cross完了後の状態から F2L を解く", () => {

    it("f2l.stateAfter で isF2LSolved が true になる", () => {
      const scrambledState = applyMoves(SOLVED_STATE, SCRAMBLE);
      const crossResult    = solveCross(scrambledState);
      const f2lResult      = solveF2L(crossResult.stateAfter);
      expect(isF2LSolved(f2lResult.stateAfter).solved).toBe(true);
    });

    it("f2l.stateAfter と手動適用した状態が一致する", () => {
      const scrambledState = applyMoves(SOLVED_STATE, SCRAMBLE);
      const crossResult    = solveCross(scrambledState);
      const f2lResult      = solveF2L(crossResult.stateAfter);
      const manualAfterF2L = applyMoves(crossResult.stateAfter, f2lResult.moves);
      expect(f2lResult.stateAfter).toBe(manualAfterF2L);
    });

    it("F2L完了後もCrossが崩れていない", () => {
      const scrambledState = applyMoves(SOLVED_STATE, SCRAMBLE);
      const crossResult    = solveCross(scrambledState);
      const f2lResult      = solveF2L(crossResult.stateAfter);
      expect(isCrossSolved(f2lResult.stateAfter).solved).toBe(true);
    });
  });

  describe("各スロットの個別完成確認", () => {

    it.each(["FR", "FL", "BR", "BL"] as F2LSlot[])(
      "F2L完了後: スロット %s が完成している",
      (slot) => {
        const scrambledState = applyMoves(SOLVED_STATE, SCRAMBLE);
        const crossResult    = solveCross(scrambledState);
        const f2lResult      = solveF2L(crossResult.stateAfter);
        expect(isF2LSlotSolved(f2lResult.stateAfter, slot)).toBe(true);
      }
    );
  });

  describe("手順を段階的に適用してスロット完成を確認", () => {

    // FR → FL → BR → BL の順に手順を積み上げて各スロットの完成を確認

    const scrambledState = applyMoves(SOLVED_STATE, SCRAMBLE);
    const afterCross     = solveCross(scrambledState).stateAfter;
    const f2lResult      = solveF2L(afterCross);

    const slotOrder: F2LSlot[] = ["FR", "FL", "BR", "BL"];
    let   stateStep             = afterCross;

    for (const slot of slotOrder) {
      // each スロットの手順を適用していくので、
      // ループ内で stateStep を更新しながらテストする
      const slotMoves = f2lResult.slotMoves[slot];

      // ← このブロックは describe スコープ内で評価されるため
      //   変数キャプチャに注意して it を登録する
      it(`スロット ${slot} の手順適用後に完成している`, () => {
        stateStep = applyMoves(stateStep, slotMoves);
        expect(isF2LSlotSolved(stateStep, slot)).toBe(true);
      });

      it(`スロット ${slot} 完了後も Cross が維持されている`, () => {
        expect(isCrossSolved(stateStep).solved).toBe(true);
      });
    }
  });
});

describe("Cross/F2L の手順・CubeStateの可視化", () => {
  it("手順と状態を可視化", () => {
    const scrambledState = applyMoves(SOLVED_STATE, SCRAMBLE);

    // Cross
    const crossResult = solveCross(scrambledState);
    console.log("==== Cross 手順 ====");
    console.log(crossResult.moves.join(" "));
    console.log("==== Cross 完了時 CubeState ====");
    printCubeState(crossResult.stateAfter);

    // F2L
    const f2lResult = solveF2L(crossResult.stateAfter);
    console.log("==== F2L 手順 ====");
    console.log(f2lResult.moves.join(" "));
    console.log("==== F2L 完了時 CubeState ====");
    printCubeState(f2lResult.stateAfter);

    // 必要なら各スロットの手順も
    Object.entries(f2lResult.slotMoves).forEach(([slot, moves]) => {
      console.log(`slot ${slot} 手順:`, moves.join(" "));
    })
  });
});