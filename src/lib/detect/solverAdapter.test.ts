import { describe, expect, it } from "vitest";
import { applyMoves, SOLVED_STATE } from "../cube/moves";
import { detectedScanToFacelets } from "./solverAdapter";
import { generateGridPoints, type CubePose } from "./visionOnnx";

function scanFromFacelets(state: string) {
  const face = (letter: string) => state.slice("URFDLB".indexOf(letter) * 9, "URFDLB".indexOf(letter) * 9 + 9).split("");
  return { step1: [...face("U"), ...face("R"), ...face("B")], step2: [...face("D"), ...face("F"), ...face("L")] };
}

describe("detect to solver adapter", () => {
  it("reorders six faces without rotating their outside-view stickers", () => {
    const state = applyMoves(SOLVED_STATE, ["R", "U", "F2", "L", "B"]);
    expect(detectedScanToFacelets(scanFromFacelets(state))).toEqual({ format: "URFDLB_FACELETS_V1", facelets: state });
  });
  it("rejects incomplete, wrong-center, and impossible cubes", () => {
    const solved = scanFromFacelets(SOLVED_STATE);
    expect(() => detectedScanToFacelets({ ...solved, step1: solved.step1.slice(1) })).toThrow();
    const unknown = scanFromFacelets(SOLVED_STATE); unknown.step2[9] = "N";
    expect(() => detectedScanToFacelets(unknown)).toThrow(/未判定/);
    const wrongCenter = scanFromFacelets(SOLVED_STATE); wrongCenter.step1[4] = "R";
    expect(() => detectedScanToFacelets(wrongCenter)).toThrow(/中央色/);
    const manual = scanFromFacelets(SOLVED_STATE);
    for (const center of [4, 13, 22]) { manual.step1[center] = "N"; manual.step2[center] = "N"; }
    expect(detectedScanToFacelets(manual).facelets).toBe(SOLVED_STATE);
    const impossible = scanFromFacelets(SOLVED_STATE); impossible.step1[0] = "R";
    expect(() => detectedScanToFacelets(impossible)).toThrow(/成立しません/);
  });

  it("keeps the scanned B face in outside-view orientation", () => {
    const pose: CubePose = {
      center: { x: 0.5, y: 0.5 }, top: { x: 0.5, y: 0 },
      leftUp: { x: 0.1, y: 0.25 }, rightUp: { x: 0.9, y: 0.25 },
      leftDown: { x: 0.1, y: 0.75 }, rightDown: { x: 0.9, y: 0.75 },
      bottom: { x: 0.5, y: 1 },
    };
    const points = generateGridPoints(pose, 1);
    // At the U/R/B corner, B0 is near the U/R/B corner and B2 near U/L/B.
    expect(points[18].x).toBeLessThan(points[20].x);
    expect(points[18].y).toBeLessThan(points[24].y);
  });
});
