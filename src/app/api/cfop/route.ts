import { NextRequest, NextResponse } from "next/server";
import { buildWorkbenchResult, type WorkbenchGoal, type WorkbenchMode } from "@/lib/cfop-solver/workbench";
import { InvalidCubeStateError } from "@/lib/cfop-solver/state-adapter";

const GOALS = new Set<WorkbenchGoal>(["cross", "f2l", "oll"]);

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: "JSON形式の入力が必要です。" } }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: "入力形式を確認してください。" } }, { status: 400 });
  }
  const value = body as Record<string, unknown>;
  if (typeof value.facelets !== "string" || (value.mode !== "complete" && value.mode !== "partial") ||
      (value.mode === "partial" && !GOALS.has(value.goal as WorkbenchGoal))) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: "54面の状態、解法モード、到達目標を確認してください。" } }, { status: 400 });
  }
  try {
    const data = buildWorkbenchResult({ facelets: value.facelets, mode: value.mode as WorkbenchMode, goal: value.mode === "complete" ? "pll" : value.goal as WorkbenchGoal });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof InvalidCubeStateError) {
      const message = error.message;
      const code = /54-character|outside|nine|center|format/.test(message) ? "INVALID_FACELETS" : "UNREACHABLE_STATE";
      return NextResponse.json({ success: false, error: { code, message: code === "INVALID_FACELETS" ? `入力形式または色数が正しくありません: ${message}` : `物理的に到達できない状態です: ${message}` } }, { status: 422 });
    }
    console.error("CFOP solver failed", error);
    return NextResponse.json({ success: false, error: { code: "SOLVER_FAILED", message: "解法の計算または検証に失敗しました。" } }, { status: 500 });
  }
}
