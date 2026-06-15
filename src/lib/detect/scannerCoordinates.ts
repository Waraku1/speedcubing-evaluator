export type Point = { x: number; y: number };

const CX = 50; // 中心X
const CY = 50; // 中心Y
const R = 35; // キューブのサイズ（半径）

// 3Dアイソメトリック投影のための3つの基底ベクトル
const v1 = { x: R * 0.866025, y: -R * 0.5 }; // 右上方向
const v2 = { x: -R * 0.866025, y: -R * 0.5 }; // 左上方向
const v3 = { x: 0, y: R }; // 下方向

const C = { x: CX, y: CY };

const add = (p1: Point, p2: Point) => ({ x: p1.x + p2.x, y: p1.y + p2.y });
const scale = (p: Point, s: number) => ({ x: p.x * s, y: p.y * s });

export const STEP1_POINTS: Point[] = [];
export const STEP2_POINTS: Point[] = [];

// --- サンプリング座標の計算 (各面 3x3 = 9個) ---
// 抽出用に 0.0 ~ 1.0 の相対座標に変換して格納します。

// [Step 1] U面(上), F面(左下), R面(右下) のインデックス順(0~8)
for (let r = 0; r < 3; r++) {
  for (let c = 0; c < 3; c++) {
    const p = add(
      add(add(C, v1), v2),
      add(scale(v2, -(c + 0.5) / 3), scale(v1, -(r + 0.5) / 3)),
    );
    STEP1_POINTS.push({ x: p.x / 100, y: p.y / 100 });
  }
}
for (let r = 0; r < 3; r++) {
  for (let c = 0; c < 3; c++) {
    const p = add(
      add(C, v2),
      add(scale(v2, -(c + 0.5) / 3), scale(v3, (r + 0.5) / 3)),
    );
    STEP1_POINTS.push({ x: p.x / 100, y: p.y / 100 });
  }
}
for (let r = 0; r < 3; r++) {
  for (let c = 0; c < 3; c++) {
    const p = add(C, add(scale(v1, (c + 0.5) / 3), scale(v3, (r + 0.5) / 3)));
    STEP1_POINTS.push({ x: p.x / 100, y: p.y / 100 });
  }
}

// [Step 2] D面(上), B面(左下), L面(右下) のインデックス順(0~8)
// ※キューブを裏返すため、0の位置と走査方向がStep1とは異なります。
for (let r = 0; r < 3; r++) {
  for (let c = 0; c < 3; c++) {
    const p = add(
      add(C, v1),
      add(scale(v2, (c + 0.5) / 3), scale(v1, -(r + 0.5) / 3)),
    );
    STEP2_POINTS.push({ x: p.x / 100, y: p.y / 100 });
  }
}
for (let r = 0; r < 3; r++) {
  for (let c = 0; c < 3; c++) {
    const p = add(
      add(C, v3),
      add(scale(v2, (c + 0.5) / 3), scale(v3, -(r + 0.5) / 3)),
    );
    STEP2_POINTS.push({ x: p.x / 100, y: p.y / 100 });
  }
}
for (let r = 0; r < 3; r++) {
  for (let c = 0; c < 3; c++) {
    const p = add(
      add(C, v3),
      add(scale(v1, (c + 0.5) / 3), scale(v3, -(r + 0.5) / 3)),
    );
    STEP2_POINTS.push({ x: p.x / 100, y: p.y / 100 });
  }
}

// --- UI用 3Dグリッド線(ワイヤーフレーム)の生成 ---
export function getIsometricGridLines(): {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isBorder: boolean;
}[] {
  const lines: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    isBorder: boolean;
  }> = [];
  const pushLine = (p1: Point, p2: Point, isBorder: boolean) =>
    lines.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, isBorder });

  // 上ガイド
  for (let i = 0; i <= 3; i++) {
    const isBorder = i === 0 || i === 3;
    pushLine(
      add(C, scale(v1, i / 3)),
      add(add(C, scale(v1, i / 3)), v2),
      isBorder,
    );
    pushLine(
      add(C, scale(v2, i / 3)),
      add(add(C, scale(v2, i / 3)), v1),
      isBorder,
    );
  }
  // 左下ガイド
  for (let i = 0; i <= 3; i++) {
    const isBorder = i === 0 || i === 3;
    pushLine(
      add(C, scale(v2, i / 3)),
      add(add(C, scale(v2, i / 3)), v3),
      isBorder,
    );
    pushLine(
      add(C, scale(v3, i / 3)),
      add(add(C, scale(v3, i / 3)), v2),
      isBorder,
    );
  }
  // 右下ガイド
  for (let i = 0; i <= 3; i++) {
    const isBorder = i === 0 || i === 3;
    pushLine(
      add(C, scale(v1, i / 3)),
      add(add(C, scale(v1, i / 3)), v3),
      isBorder,
    );
    pushLine(
      add(C, scale(v3, i / 3)),
      add(add(C, scale(v3, i / 3)), v1),
      isBorder,
    );
  }
  return lines;
}
