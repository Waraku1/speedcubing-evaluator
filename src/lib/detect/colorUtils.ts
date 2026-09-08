import type { CubeDraftTokenV1 } from "../ui/cubeDraftV1";

export type HSV = Readonly<{ h: number; s: number; v: number }>;

export function rgbToHsv(r: number, g: number, b: number): HSV {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
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

  return Object.freeze({ h, s: max === 0 ? 0 : delta / max, v: max });
}

/** Dark, ambiguous, and out-of-range samples stay explicitly unknown. */
export function classifyColorHSV(hsv: HSV): CubeDraftTokenV1 {
  if (!Number.isFinite(hsv.h) || !Number.isFinite(hsv.s) || !Number.isFinite(hsv.v)) {
    return "N";
  }
  if (hsv.v < 0.2) return "N";
  if (hsv.s < 0.25 || (hsv.s < 0.4 && hsv.v > 0.7)) return "U";
  if (hsv.h < 15 || hsv.h > 340) return "R";
  if (hsv.h >= 15 && hsv.h < 45) return "L";
  if (hsv.h >= 45 && hsv.h < 80) return "D";
  if (hsv.h >= 80 && hsv.h < 170) return "F";
  if (hsv.h >= 170 && hsv.h < 260) return "B";
  return "N";
}
