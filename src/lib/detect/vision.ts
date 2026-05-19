import { Color } from "../cube/cube";
import { classifyColor } from "./colorUtils";
import { Point } from "./scannerCoordinates";

/**
 * ビデオフレームまたは画像要素から、指定された相対座標群の色を抽出します。
 * (UI非依存。HTMLVideoElement 等を直接受け取ります)
 */
export function extractColors(
  imageSource: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  points: Point[],
): Color[] {
  // 元のサイズを取得
  const width =
    "videoWidth" in imageSource ? imageSource.videoWidth : imageSource.width;
  const height =
    "videoHeight" in imageSource ? imageSource.videoHeight : imageSource.height;

  // パフォーマンスのため、オフスクリーンCanvasを使用
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx) throw new Error("Canvas 2D context is not supported");

  ctx.drawImage(imageSource, 0, 0, width, height);

  // 各座標のピクセルをサンプリング
  return points.map((p) => {
    const px = Math.min(Math.floor(p.x * width), width - 1);
    const py = Math.min(Math.floor(p.y * height), height - 1);

    // サンプリング精度を上げるため、1pxではなく周囲3x3の平均を取ることも可能ですが、
    // ここではシンプルに中心の1ピクセルを取得します。
    const pixel = ctx.getImageData(px, py, 1, 1).data;
    return classifyColor(pixel[0], pixel[1], pixel[2]);
  });
}
