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
  // 【白 (U) の調整】部屋の光が黄色っぽくても白と判定できるように彩度(s)の許容範囲を 0.25 -> 0.32 に拡大
  if (hsv.s < 0.32 && hsv.v > 0.45) return "U"; 
  
  // 【暗すぎる場所 (影) の無視】
  if (hsv.v < 0.15) return null; 

  // 【色相(H)による分類の調整】
  if (hsv.h < 10 || hsv.h > 345) return "R";  // 赤 (より厳密に)
  if (hsv.h >= 10 && hsv.h < 42) return "L";  // オレンジ (幅を広げた)
  if (hsv.h >= 42 && hsv.h < 78) return "D";  // 黄色
  if (hsv.h >= 78 && hsv.h < 165) return "F"; // 緑
  if (hsv.h >= 165 && hsv.h < 255) return "B"; // 青

  return null;
}
