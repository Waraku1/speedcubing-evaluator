import { CubeState, Color, isValidCubeState } from "../cube/cube";

/**
 * 2回のスキャン結果（それぞれ27色）を統合し、CubeStateを生成します。
 *
 * @param step1Colors - [U(9), F(9), R(9)] の順序で抽出された27マスの配列
 * @param step2Colors - [D(9), B(9), L(9)] の順序で抽出された27マスの配列
 * @returns 構築されたCubeState
 */
export function buildCubeState(
  step1Colors: Color[],
  step2Colors: Color[],
): CubeState {
  if (step1Colors.length !== 27 || step2Colors.length !== 27) {
    throw new Error("Invalid scan data length. Expected 27 colors per step.");
  }

  // scannerCoordinates.ts の定義に従い、9マスずつ切り出す
  const U = step1Colors.slice(0, 9);
  const F = step1Colors.slice(9, 18);
  const R = step1Colors.slice(18, 27);

  const D = step2Colors.slice(0, 9);
  const B = step2Colors.slice(9, 18);
  const L = step2Colors.slice(18, 27);

  const state: CubeState = { U, R, F, D, L, B };

  // cube.ts のバリデーション機能を呼び出して、認識エラー（各色が9個ずつない等）を検知
  if (!isValidCubeState(state)) {
    console.warn(
      "Warning: Parsed state is invalid. Color recognition might have failed.",
    );
    // ※実際のアプリケーションでは、ここでErrorを投げるか、
    // ユーザーに修正を促すためのフラグを返す設計にします。
  }

  return state;
}
