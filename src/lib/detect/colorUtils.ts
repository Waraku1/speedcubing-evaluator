import { Color } from "../cube/cube";

// HSV色空間の型
export type HSV = { h: number; s: number; v: number }; // h: 0-360, s: 0-1, v: 0-1

// 現実の色（HSV）とキューブの面の論理マッピング
// ※実行環境やカメラに合わせて調整可能。白(U)は彩度(S)が低く、黒(無効)は明度(V)が低い。
const REFERENCE_COLORS: Record<Color, HSV> = {
  U: { h: 0, s: 0.0, v: 1.0 }, // U: 白 (White) - 彩度0
  D: { h: 60, s: 1.0, v: 1.0 }, // D: 黄 (Yellow)
  R: { h: 0, s: 1.0, v: 1.0 }, // R: 赤 (Red)
  L: { h: 30, s: 1.0, v: 1.0 }, // L: 橙 (Orange)
  F: { h: 120, s: 1.0, v: 1.0 }, // F: 緑 (Green)
  B: { h: 240, s: 1.0, v: 1.0 }, // B: 青 (Blue)
};

export function rgbToHsv(r: number, g: number, b: number): HSV {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  if (delta === 0) h = 0;
  else if (max === rNorm) h = ((gNorm - bNorm) / delta) % 6;
  else if (max === gNorm) h = (bNorm - rNorm) / delta + 2;
  else h = (rNorm - gNorm) / delta + 4;

  h = Math.round(h * 60);
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return { h, s, v };
}

export function classifyColor(r: number, g: number, b: number): Color {
  const hsv = rgbToHsv(r, g, b);

  // 彩度が非常に低い、または明度が非常に高い場合は「白(U)」と判定
  if (hsv.s < 0.25 || (hsv.s < 0.4 && hsv.v > 0.8)) return "U";

  // 明度が低すぎる場合はエラーとして扱うべきだが、最も近い色を探す
  let closestColor: Color = "U";
  let minDistance = Infinity;

  // 円柱座標系であるHSVの距離を計算（特に色相Hは360度でループする点に注意）
  for (const [colorName, refHsv] of Object.entries(REFERENCE_COLORS)) {
    const c = colorName as Color;
    if (c === "U") continue; // 白は上記で判定済み

    const hueDiff = Math.min(
      Math.abs(hsv.h - refHsv.h),
      360 - Math.abs(hsv.h - refHsv.h),
    );

    // Hの差分を重視しつつ、SとVの差も加味するユークリッド距離
    const distance = Math.sqrt(
      Math.pow(hueDiff / 180, 2) * 2.0 + // 色相の重みを高く設定
        Math.pow(hsv.s - refHsv.s, 2) +
        Math.pow(hsv.v - refHsv.v, 2),
    );

    if (distance < minDistance) {
      minDistance = distance;
      closestColor = c;
    }
  }

  return closestColor;
}
