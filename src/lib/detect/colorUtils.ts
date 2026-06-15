import { Color } from "../cube/cube";

export type HSV = { h: number; s: number; v: number };

export function rgbToHsv(r: number, g: number, b: number): HSV {
  const rNorm = r / 255,
    gNorm = g / 255,
    bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rNorm) h = ((gNorm - bNorm) / delta) % 6;
    else if (max === gNorm) h = (bNorm - rNorm) / delta + 2;
    else h = (rNorm - gNorm) / delta + 4;
  }
  h = Math.round(h * 60);
  if (h < 0) h += 360;

  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

/**
 * HSVから最も近いキューブの色を返します。
 * (白は彩度Sが低い、それ以外は色相Hで分類)
 */
export function classifyColorHSV(hsv: HSV): Color | null {
  if (hsv.s < 0.25 || (hsv.s < 0.4 && hsv.v > 0.7)) return "U"; // 白
  if (hsv.v < 0.2) return null; // 黒(影)は無視

  if (hsv.h < 15 || hsv.h > 340) return "R"; // 赤
  if (hsv.h >= 15 && hsv.h < 45) return "L"; // 橙
  if (hsv.h >= 45 && hsv.h < 80) return "D"; // 黄
  if (hsv.h >= 80 && hsv.h < 170) return "F"; // 緑
  if (hsv.h >= 170 && hsv.h < 260) return "B"; // 青

  return null;
}
