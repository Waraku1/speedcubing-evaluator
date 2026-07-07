import * as ort from "onnxruntime-web";
import { Point } from "./scannerCoordinates";
import { Color } from "../cube/cube";
import { classifyColorHSV, rgbToHsv } from "./colorUtils";

export type CubePose = {
  center: Point;
  top: Point;
  rightUp: Point;
  rightDown: Point;
  bottom: Point;
  leftDown: Point;
  leftUp: Point;
};

// --- 画像前処理 ---
function preprocess(video: HTMLVideoElement): Float32Array | null {
  const size = 640;
  if (video.videoWidth === 0 || video.videoHeight === 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const minDim = Math.min(video.videoWidth, video.videoHeight);
  const sx = (video.videoWidth - minDim) / 2;
  const sy = (video.videoHeight - minDim) / 2;
  ctx.drawImage(video, sx, sy, minDim, minDim, 0, 0, size, size);

  const { data } = ctx.getImageData(0, 0, size, size);
  const float32Data = new Float32Array(3 * size * size);
  for (let i = 0; i < size * size; i++) {
    float32Data[i] = data[i * 4] / 255.0;
    float32Data[size * size + i] = data[i * 4 + 1] / 255.0;
    float32Data[2 * size * size + i] = data[i * 4 + 2] / 255.0;
  }
  return float32Data;
}

// --- YOLOv8 出力デコード ---
function decodeOutput(tensorData: Float32Array): CubePose | null {
  const numAnchors = 8400, numChannels = 26;
  let bestScore = -Infinity, bestIdx = -1;

  for (let i = 0; i < numAnchors; i++) {
    const score = tensorData[4 * numAnchors + i];
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestScore < 0.5 || bestIdx === -1) return null;

  const getKp = (kpIdx: number): Point => ({
    x: tensorData[(5 + kpIdx * 3) * numAnchors + bestIdx] / 640,
    y: tensorData[(5 + kpIdx * 3 + 1) * numAnchors + bestIdx] / 640,
  });

  return {
    center: getKp(0),
    top: getKp(1),
    rightUp: getKp(2),
    rightDown: getKp(3),
    bottom: getKp(4),
    leftDown: getKp(5),
    leftUp: getKp(6),
  };
}

// --- ホモグラフィ変換 ---
function applyHomography(A: Point, B: Point, C: Point, D: Point): Point[] {
  const points: Point[] = [];
  const dx1 = B.x - C.x, dx2 = D.x - C.x, dx3 = A.x - B.x + C.x - D.x;
  const dy1 = B.y - C.y, dy2 = D.y - C.y, dy3 = A.y - B.y + C.y - D.y;

  const det = dx1 * dy2 - dx2 * dy1;
  const a31 = (dx3 * dy2 - dx2 * dy3) / (det || 1e-10);
  const a32 = (dx1 * dy3 - dx3 * dy1) / (det || 1e-10);

  const a11 = B.x - A.x + a31 * B.x;
  const a12 = D.x - A.x + a32 * D.x;
  const a13 = A.x;
  const a21 = B.y - A.y + a31 * B.y;
  const a22 = D.y - A.y + a32 * D.y;
  const a23 = A.y;

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const u = (c + 0.5) / 3;
      const v = (r + 0.5) / 3;
      const w = a31 * u + a32 * v + 1;
      points.push({
        x: (a11 * u + a12 * v + a13) / w,
        y: (a21 * u + a22 * v + a23) / w,
      });
    }
  }
  return points;
}

function rotate180<T>(arr: T[]): T[] {
  return [
    arr[8], arr[7], arr[6],
    arr[5], arr[4], arr[3],
    arr[2], arr[1], arr[0],
  ];
}

function flipvert<T>(arr: T[]): T[] {
  return[
    arr[2], arr[5], arr[8],
    arr[1], arr[4], arr[7],
    arr[0], arr[3], arr[6],
  ];
}

export function generateGridPoints(pose: CubePose, step: 1 | 2): Point[] {
  const pts: Point[] = [];

  const top = applyHomography(
    pose.leftUp,
    pose.top,
    pose.rightUp,
    pose.center
  );

  const left = applyHomography(
    pose.leftUp,
    pose.center,
    pose.bottom,
    pose.leftDown
  );

  const right = applyHomography(
    pose.center,
    pose.rightUp,
    pose.rightDown,
    pose.bottom
  );

  if (step === 1) {
    pts.push(...rotate180(top)); // U
    pts.push(...left); // R
    pts.push(...rotate180(right));           // B
} else {
    pts.push(...rotate180(flipvert(top)));             // D
    pts.push(...rotate180(left)); // F
    pts.push(...rotate180(right));// L
}

  return pts;
}

// --- 推論と色サンプリングの実行 ---
export async function runInference(
  session: ort.InferenceSession,
  video: HTMLVideoElement,
  step: 1 | 2,
): Promise<{ colors: Color[]; points: Point[]; pose: CubePose } | null> {
  const floatData = preprocess(video);
  if (!floatData) return null;

  const inputTensor = new ort.Tensor("float32", floatData, [1, 3, 640, 640]);
  const outputs = await session.run({ [session.inputNames[0]]: inputTensor });
  const pose = decodeOutput(outputs[session.outputNames[0]].data as Float32Array);

  if (!pose) return null;

  const points = generateGridPoints(pose, step);
  const minDim = Math.min(video.videoWidth, video.videoHeight);
  const sx = (video.videoWidth - minDim) / 2;
  const sy = (video.videoHeight - minDim) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // 1. 全27マスの生のHSV値を抽出
  const rawHsvList = points.map((p) => {
    const px = Math.floor(sx + p.x * minDim);
    const py = Math.floor(sy + p.y * minDim);

    if (px < 2 || px >= canvas.width - 2 || py < 2 || py >= canvas.height - 2) {
      return { h: 0, s: 0, v: 0 };
    }

    let totalR = 0, totalG = 0, totalB = 0, count = 0;
    const size = 2;
    for (let dy = -size; dy <= size; dy++) {
      for (let dx = -size; dx <= size; dx++) {
        const pixel = ctx.getImageData(px + dx, py + dy, 1, 1).data;
        totalR += pixel[0];
        totalG += pixel[1];
        totalB += pixel[2];
        count++;
      }
    }
    return rgbToHsv(totalR / count, totalG / count, totalB / count);
  });

  const centerIndices = [4, 13, 22];
  const expectedCenterColors: Color[][] = [
    ["U", "R", "B"], // ステップ1: [上面=白, 左手前=青, 右手前=赤]
    ["D", "F", "L"], // ステップ2: [上面=黄, 左手前=緑, 右手前=橙]
  ];
  
  const currentExpected = expectedCenterColors[step - 1];

  // 2. 確定センター色に基づく相対マイルド補正を毎フレーム適用
  const colors = rawHsvList.map((target, idx) => {
    const faceIdx = Math.floor(idx / 9);
    const centerIdx = centerIndices[faceIdx];
    const centerHsv = rawHsvList[centerIdx];
    const centerColor = currentExpected[faceIdx];

    if (idx === centerIdx) return centerColor;

    let h = target.h;
    let s = target.s;
    let v = target.v;

    if (centerColor === "U") {
      if (centerHsv.s > 0.08) {
        s = Math.max(0, s - (centerHsv.s * 0.4));
      }
    } 
    else if (centerColor === "D") {
      if (h > 45 && h < 70) {
        s = Math.max(s, centerHsv.s * 0.3);
      }
    } 
    else if (centerColor === "B") {
      if (h > 100 && h < 150) {
        h = h + (centerHsv.h - h) * 0.3;
      }
    } 
    else if (centerColor === "F") {
      if (h > 150 && h < 195) {
        h = h + (centerHsv.h - h) * 0.3;
      }
    } 
    else if (centerColor === "R") {
      if (h >= 15 && h <= 35) {
        h = h + (centerHsv.h - h) * 0.3;
      }
    } 
    else if (centerColor === "L") {
      if (h < 20 || h > 340) {
        const diff = centerHsv.h - h;
        h = (h + diff * 0.3 + 360) % 360;
      }
    }

    return classifyColorHSV({ h, s, v }) || "U";
  });

  return { colors, points, pose };
}