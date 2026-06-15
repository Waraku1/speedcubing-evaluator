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

  // スマホの長方形映像の中心を正方形にクロップしてAIに渡す
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
  const numAnchors = 8400,
    numChannels = 26;
  let bestScore = -Infinity,
    bestIdx = -1;

  for (let i = 0; i < numAnchors; i++) {
    const score = tensorData[4 * numAnchors + i]; // クラススコア
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  // スコアが低い場合は見失ったと判定
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

// --- ホモグラフィ変換（透視投影）数学ロジック ---
function applyHomography(A: Point, B: Point, C: Point, D: Point): Point[] {
  const points: Point[] = [];

  // 4点からホモグラフィ行列パラメータを算出
  const dx1 = B.x - C.x,
    dx2 = D.x - C.x,
    dx3 = A.x - B.x + C.x - D.x;
  const dy1 = B.y - C.y,
    dy2 = D.y - C.y,
    dy3 = A.y - B.y + C.y - D.y;

  const det = dx1 * dy2 - dx2 * dy1;
  const a31 = (dx3 * dy2 - dx2 * dy3) / (det || 1e-10);
  const a32 = (dx1 * dy3 - dx3 * dy1) / (det || 1e-10);

  const a11 = B.x - A.x + a31 * B.x;
  const a12 = D.x - A.x + a32 * D.x;
  const a13 = A.x;
  const a21 = B.y - A.y + a31 * B.y;
  const a22 = D.y - A.y + a32 * D.y;
  const a23 = A.y;

  // 3x3グリッド（9マス）の中心座標を投影
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

export function generateGridPoints(pose: CubePose, step: 1 | 2): Point[] {
  const pts: Point[] = [];

  if (step === 1) {
    pts.push(
      ...applyHomography(pose.leftUp, pose.top, pose.rightUp, pose.center),
    );
    pts.push(
      ...applyHomography(pose.leftUp, pose.center, pose.bottom, pose.leftDown),
    );
    pts.push(
      ...applyHomography(
        pose.center,
        pose.rightUp,
        pose.rightDown,
        pose.bottom,
      ),
    );
  } else {
    pts.push(
      ...applyHomography(pose.leftUp, pose.top, pose.rightUp, pose.center),
    );
    pts.push(
      ...applyHomography(pose.leftUp, pose.center, pose.bottom, pose.leftDown),
    );
    pts.push(
      ...applyHomography(
        pose.center,
        pose.rightUp,
        pose.rightDown,
        pose.bottom,
      ),
    );
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
  const pose = decodeOutput(
    outputs[session.outputNames[0]].data as Float32Array,
  );

  if (!pose) return null;

  // ホモグラフィによる27マスの座標取得（0.0 ~ 1.0）
  const points = generateGridPoints(pose, step);

  // カメラ映像から色を取得
  const minDim = Math.min(video.videoWidth, video.videoHeight);
  const sx = (video.videoWidth - minDim) / 2;
  const sy = (video.videoHeight - minDim) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const colors = points.map((p) => {
    // 正方形にクロップされた座標を、元の長方形ビデオ座標に復元
    const px = Math.floor(sx + p.x * minDim);
    const py = Math.floor(sy + p.y * minDim);

    // 範囲外アクセス防止
    if (px < 0 || px >= canvas.width || py < 0 || py >= canvas.height)
      return "U" as Color;

    const pixel = ctx.getImageData(px, py, 1, 1).data;
    return classifyColorHSV(rgbToHsv(pixel[0], pixel[1], pixel[2])) || "U";
  });

  return { colors, points, pose };
}
