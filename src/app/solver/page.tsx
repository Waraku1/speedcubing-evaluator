"use client";

import { useEffect, useState, type FormEvent } from "react";
import { DETECTED_SCAN_STORAGE_KEY } from "@/lib/detect/solverAdapter";
import { assertValidCubeState } from "@/lib/cfop-solver/state-adapter";
import type { WorkbenchGoal, WorkbenchMode, WorkbenchResult } from "@/lib/cfop-solver/workbench";
import "./solver.css";

const SOLVED = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
const FACE_ORDER = ["U", "R", "F", "D", "L", "B"] as const;
const COLORS: Record<string, string> = { U: "#fafafa", R: "#ef4444", F: "#10b981", D: "#fbbf24", L: "#f97316", B: "#3b82f6" };

function CubeNet({ state }: { state: string }) {
  return <div className="cube-net" aria-label="現在のキューブ状態" data-testid="cube-face-editor">
    {FACE_ORDER.map((face, index) => <div className={`cube-face face-${face}`} key={face}>
      <span>{face}</span><div className="face-grid">{state.slice(index * 9, index * 9 + 9).split("").map((color, i) =>
        <i key={i} style={{ background: COLORS[color] ?? "#334155" }} aria-label={`${face}${i + 1}: ${color}`} />)}</div>
    </div>)}
  </div>;
}

export default function SolverPage() {
  const [facelets, setFacelets] = useState(SOLVED);
  const [mode, setMode] = useState<WorkbenchMode>("complete");
  const [goal, setGoal] = useState<WorkbenchGoal>("cross");
  const [result, setResult] = useState<WorkbenchResult | null>(null);
  const [position, setPosition] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const transferred = sessionStorage.getItem(DETECTED_SCAN_STORAGE_KEY);
    if (!transferred) return;
    sessionStorage.removeItem(DETECTED_SCAN_STORAGE_KEY);
    try {
      assertValidCubeState(transferred);
      setFacelets(transferred);
      setResult(null);
      setPosition(0);
    } catch {
      setError("スキャン状態を読み込めませんでした。検出画面で色を確認してください。");
    }
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError(""); setResult(null); setPosition(0);
    try {
      const response = await fetch("/api/cfop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ facelets: facelets.trim().toUpperCase(), mode, goal }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error?.message ?? "計算に失敗しました。");
      setResult(payload.data as WorkbenchResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "通信に失敗しました。");
    } finally { setLoading(false); }
  }

  const currentState = result ? (position === 0 ? result.initialState : result.steps[position - 1]?.stateAfter ?? result.finalState) : facelets.trim().toUpperCase();
  const currentStep = result && position > 0 ? result.steps[position - 1] : null;
  return <main className="solver-shell">
    <header className="solver-header"><div><p className="eyebrow">SPEEDCUBING EVALUATOR / WORKBENCH</p><h1>CFOP Solver</h1><p>キューブ状態から、段階ごとの手順と実行しやすさを確認します。</p></div><a href="/detect">カメラ検出へ ↗</a></header>
    <div className="solver-layout">
      <section className="solver-left" aria-label="入力と状態">
        <form className="solver-panel input-panel" onSubmit={submit}>
          <div className="panel-heading"><span className="panel-index">01</span><div><h2>入力と到達目標</h2><p>URFDLB順、各面9文字の54面入力</p></div></div>
          <label htmlFor="facelets">キューブ状態</label>
          <textarea id="facelets" data-testid="state-string-input" spellCheck={false} disabled={loading} value={facelets} onChange={(event) => { setFacelets(event.target.value); setResult(null); setPosition(0); setError(""); }} rows={3} aria-describedby="facelet-help" />
          <small id="facelet-help">U / R / F / D / L / B を各9個。中央色は固定です。</small>
          <div className="choice-row" role="group" aria-label="解法モード"><label><input type="radio" name="mode" value="complete" disabled={loading} checked={mode === "complete"} onChange={() => { setMode("complete"); setResult(null); setPosition(0); }} /> 完全解 · PLLまで</label><label><input type="radio" name="mode" value="partial" disabled={loading} checked={mode === "partial"} onChange={() => { setMode("partial"); setResult(null); setPosition(0); }} /> 部分解</label></div>
          {mode === "partial" && <label htmlFor="goal">到達目標<select id="goal" disabled={loading} value={goal} onChange={(event) => { setGoal(event.target.value as WorkbenchGoal); setResult(null); setPosition(0); }}><option value="cross">Cross</option><option value="f2l">F2L</option><option value="oll">OLL</option></select></label>}
          <button className="primary-button" type="submit" disabled={loading}>Solve · 解法を計算</button>
          {loading && <p role="status" data-testid="solver-loading">計算中…</p>}
          {error && <p role="alert" className="error-message">{error}</p>}
        </form>
        <section className="solver-panel state-panel"><div className="panel-heading"><span className="panel-index">02</span><div><h2>キューブ状態</h2><p>{result ? `手順 ${position} / ${result.steps.length}` : "入力プレビュー"}</p></div></div><CubeNet state={currentState.padEnd(54, "?").slice(0, 54)} /><p className="state-code">{currentState}</p></section>
      </section>
      <section className="solver-right" aria-label="解法結果">
        {!result && !loading && <div className="solver-panel empty-panel"><span className="panel-index">03</span><h2>解法結果</h2><p>状態と到達目標を指定して計算してください。</p></div>}
        {result && <div data-testid="solve-result">
          <section className="solver-panel"><div className="panel-heading"><span className="panel-index">03</span><div><h2>段階</h2><p>{result.alreadyReached ? "目標達成済み · 手順なし" : result.mode === "complete" && result.solved ? "完成を検証済み" : `${result.goal.toUpperCase()} に到達 · 部分解はここで終了`}</p></div></div>
            <div className="phase-list">{result.phases.map((phase) => <div className="phase-row" key={phase.phase}><strong>{phase.phase.toUpperCase()}</strong><span>{phase.htm} HTM</span><code>{phase.moves.join(" ") || "手順なし"}</code></div>)}</div>
          </section>
          <section className="solver-panel"><div className="panel-heading"><span className="panel-index">04</span><div><h2>現在手順</h2><p data-testid="current-step">{position === 0 ? "開始状態" : `${position} / ${result.steps.length} · ${currentStep?.label}`}</p></div></div>
            <div className="current-moves">{currentStep?.moves.join(" ") || "手順を進めてください"}</div>
            <div className="step-controls"><button type="button" onClick={() => setPosition(Math.max(0, position - 1))} disabled={position === 0} data-testid="previous-step-button">← 前へ</button><button type="button" onClick={() => setPosition(Math.min(result.steps.length, position + 1))} disabled={position >= result.steps.length} data-testid="next-step-button">次へ →</button></div>
            <p className="small-note">{currentStep ? `${currentStep.phase.toUpperCase()} · ${currentStep.htm} HTM` : "各ステップ後の状態を表示します"}</p>
          </section>
          <section className="solver-panel"><div className="panel-heading"><span className="panel-index">05</span><div><h2>全体手順</h2><p>{result.moves.length} HTM · {result.goal.toUpperCase()}まで</p></div></div><code className="all-moves" data-testid="moves-display">{result.moves.join(" ") || "目標達成済み · 手順なし"}</code></section>
          <section className="solver-panel"><div className="panel-heading"><span className="panel-index">06</span><div><h2>Evaluator評価</h2><p>表示・再生する全体手順を評価</p></div></div>
            <div className="score">{(result.evaluator.humanEfficiencyScore * 100).toFixed(1)}<span> / 100</span></div>
            <p>人間工学スコアを優先し、同点ならHTMが少ない候補を選択。</p><p>有効候補 {result.optimization.validCandidates} 件 · 採用: {result.optimization.selected === "original" ? "元手順" : "段階内の隣接回転整理"}。{result.optimization.validCandidates === 1 ? "候補内評価。" : "検証済み候補内で比較。"}全体最適・最短解は保証しません。</p>
            <code className="evaluated-moves">評価対象: {result.evaluator.evaluatedMoves.join(" ") || "空手順"}</code>
          </section>
        </div>}
      </section>
    </div>
  </main>;
}
