import * as ort from "onnxruntime-web";
import { classifyColorHSV, rgbToHsv } from "./colorUtils";
import type { ScannerPointV1 } from "./scannerMessagesV1";
import type { CubeDraftTokenV1 } from "../ui/cubeDraftV1";

const INPUT_SIZE = 640;
const ANCHOR_COUNT = 8400;
const KEYPOINT_SCORE_THRESHOLD = 0.5;

export type CubePoseV1 = Readonly<{
  center: ScannerPointV1;
  top: ScannerPointV1;
  rightUp: ScannerPointV1;
  rightDown: ScannerPointV1;
  bottom: ScannerPointV1;
  leftDown: ScannerPointV1;
  leftUp: ScannerPointV1;
}>;

export type ScannerInferenceV1 = Readonly<{
  colors: readonly CubeDraftTokenV1[];
  points: readonly ScannerPointV1[];
}>;

function decodeOutput(tensorData: Float32Array): CubePoseV1 | null {
  let bestScore = -Infinity;
  let bestIndex = -1;

  for (let index = 0; index < ANCHOR_COUNT; index += 1) {
    const score = tensorData[4 * ANCHOR_COUNT + index];
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  if (bestScore < KEYPOINT_SCORE_THRESHOLD || bestIndex === -1) return null;

  const point = (keypointIndex: number): ScannerPointV1 =>
    Object.freeze({
      x:
        tensorData[(5 + keypointIndex * 3) * ANCHOR_COUNT + bestIndex] /
        INPUT_SIZE,
      y:
        tensorData[(6 + keypointIndex * 3) * ANCHOR_COUNT + bestIndex] /
        INPUT_SIZE,
    });

  const pose: CubePoseV1 = Object.freeze({
    center: point(0),
    top: point(1),
    rightUp: point(2),
    rightDown: point(3),
    bottom: point(4),
    leftDown: point(5),
    leftUp: point(6),
  });

  return isValidPoseGeometryV1(pose) ? pose : null;
}

function signedArea(points: readonly ScannerPointV1[]): number {
  return (
    points.reduce((area, point, index) => {
      const next = points[(index + 1) % points.length];
      return area + point.x * next.y - next.x * point.y;
    }, 0) / 2
  );
}

export function isValidPoseGeometryV1(pose: CubePoseV1): boolean {
  const points = Object.values(pose);
  if (
    points.some(
      ({ x, y }) =>
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        x < 0 ||
        x > 1 ||
        y < 0 ||
        y > 1
    )
  ) {
    return false;
  }

  const topArea = Math.abs(
    signedArea([pose.leftUp, pose.top, pose.rightUp, pose.center])
  );
  const leftArea = Math.abs(
    signedArea([pose.leftUp, pose.center, pose.bottom, pose.leftDown])
  );
  const rightArea = Math.abs(
    signedArea([pose.center, pose.rightUp, pose.rightDown, pose.bottom])
  );

  return topArea >= 0.002 && leftArea >= 0.002 && rightArea >= 0.002;
}

function applyHomography(
  a: ScannerPointV1,
  b: ScannerPointV1,
  c: ScannerPointV1,
  d: ScannerPointV1
): readonly ScannerPointV1[] | null {
  const dx1 = b.x - c.x;
  const dx2 = d.x - c.x;
  const dx3 = a.x - b.x + c.x - d.x;
  const dy1 = b.y - c.y;
  const dy2 = d.y - c.y;
  const dy3 = a.y - b.y + c.y - d.y;
  const determinant = dx1 * dy2 - dx2 * dy1;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-8) return null;

  const a31 = (dx3 * dy2 - dx2 * dy3) / determinant;
  const a32 = (dx1 * dy3 - dx3 * dy1) / determinant;
  const a11 = b.x - a.x + a31 * b.x;
  const a12 = d.x - a.x + a32 * d.x;
  const a13 = a.x;
  const a21 = b.y - a.y + a31 * b.y;
  const a22 = d.y - a.y + a32 * d.y;
  const a23 = a.y;
  const points: ScannerPointV1[] = [];

  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const u = (column + 0.5) / 3;
      const v = (row + 0.5) / 3;
      const w = a31 * u + a32 * v + 1;
      if (!Number.isFinite(w) || Math.abs(w) < 1e-8) return null;
      const point = Object.freeze({
        x: (a11 * u + a12 * v + a13) / w,
        y: (a21 * u + a22 * v + a23) / w,
      });
      if (
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        point.x < 0 ||
        point.x > 1 ||
        point.y < 0 ||
        point.y > 1
      ) {
        return null;
      }
      points.push(point);
    }
  }

  return Object.freeze(points);
}

/** Raw model/camera ordering only: top q0..q8, left q0..q8, right q0..q8. */
export function generateRawGridPointsV1(
  pose: CubePoseV1
): readonly ScannerPointV1[] | null {
  const top = applyHomography(pose.leftUp, pose.top, pose.rightUp, pose.center);
  const left = applyHomography(pose.leftUp, pose.center, pose.bottom, pose.leftDown);
  const right = applyHomography(pose.center, pose.rightUp, pose.rightDown, pose.bottom);
  return top === null || left === null || right === null
    ? null
    : Object.freeze([...top, ...left, ...right]);
}

function createInput(imageData: ImageData): Float32Array {
  const pixelCount = INPUT_SIZE * INPUT_SIZE;
  const result = new Float32Array(3 * pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    result[index] = imageData.data[index * 4] / 255;
    result[pixelCount + index] = imageData.data[index * 4 + 1] / 255;
    result[2 * pixelCount + index] = imageData.data[index * 4 + 2] / 255;
  }
  return result;
}

function sampleColors(
  imageData: ImageData,
  points: readonly ScannerPointV1[]
): readonly CubeDraftTokenV1[] {
  const colors = points.map((point): CubeDraftTokenV1 => {
    const centerX = Math.floor(point.x * INPUT_SIZE);
    const centerY = Math.floor(point.y * INPUT_SIZE);
    if (
      centerX < 2 ||
      centerX >= INPUT_SIZE - 2 ||
      centerY < 2 ||
      centerY >= INPUT_SIZE - 2
    ) {
      return "N";
    }

    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const offset = ((centerY + dy) * INPUT_SIZE + centerX + dx) * 4;
        red += imageData.data[offset];
        green += imageData.data[offset + 1];
        blue += imageData.data[offset + 2];
        count += 1;
      }
    }

    return classifyColorHSV(rgbToHsv(red / count, green / count, blue / count));
  });
  return Object.freeze(colors);
}

export async function runScannerInferenceV1(
  session: ort.InferenceSession,
  bitmap: ImageBitmap,
  canvas: OffscreenCanvas,
  context: OffscreenCanvasRenderingContext2D
): Promise<ScannerInferenceV1 | null> {
  context.clearRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  context.drawImage(bitmap, 0, 0, INPUT_SIZE, INPUT_SIZE);
  const imageData = context.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  const input = new ort.Tensor("float32", createInput(imageData), [
    1,
    3,
    INPUT_SIZE,
    INPUT_SIZE,
  ]);
  let outputs: ort.InferenceSession.OnnxValueMapType | null = null;

  try {
    outputs = await session.run({ [session.inputNames[0]]: input });
    const output = outputs[session.outputNames[0]];
    const pose = decodeOutput(output.data as Float32Array);
    if (pose === null) return null;
    const points = generateRawGridPointsV1(pose);
    if (points === null) return null;
    return Object.freeze({ colors: sampleColors(imageData, points), points });
  } finally {
    input.dispose();
    if (outputs !== null) {
      for (const tensor of Object.values(outputs)) tensor.dispose();
    }
  }
}
