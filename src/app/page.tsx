"use client";

import { useMemo, useState } from "react";

import type {
  CFOPPhase,
  CFOPSolveResult,
} from "@/lib/cfop-solver/cfop-solver";
import {
  getCFOPProgress,
  type F2LSlot,
} from "@/lib/cfop-solver/detection";
import {
  applyMoves,
  parseMoveString,
  SOLVED_STATE,
  type CubeState,
  type Move,
} from "@/lib/cube/moves";

type WorkbenchResult = CFOPSolveResult & { timeMs: number };
type ViewStep = "scramble" | CFOPPhase;

type ApiResponse =
  | { success: true; data: WorkbenchResult }
  | { success: false; error: { code: string; message: string } };

const SAMPLES = [
  "R U R' U' F2 D L2 B' U2 R2 F' D2",
  "U' L' U2 L U' L' U' L F U' F' F2 B",
  "F R U' R' U' R U R' F' R U R' U' R' F R F'",
] as const;

const FACE_NAMES = ["U", "R", "F", "D", "L", "B"] as const;
const FACE_LABELS: Record<(typeof FACE_NAMES)[number], string> = {
  U: "Up",
  R: "Right",
  F: "Front",
  D: "Down",
  L: "Left",
  B: "Back",
};

const STEPS: { id: ViewStep; label: string; eyebrow: string }[] = [
  { id: "scramble", label: "Scramble", eyebrow: "Initial state" },
  { id: "cross", label: "Cross", eyebrow: "D-layer cross" },
  { id: "f2l", label: "F2L", eyebrow: "Four pairs" },
  { id: "oll", label: "OLL", eyebrow: "Orient last layer" },
  { id: "pll", label: "PLL", eyebrow: "Permute last layer" },
];

const PHASE_COPY: Record<CFOPPhase, { index: string; title: string; note: string }> = {
  cross: {
    index: "01",
    title: "Aligned Cross",
    note: "Builds and aligns the four D-layer edge pieces.",
  },
  f2l: {
    index: "02",
    title: "First Two Layers",
    note: "Solves each corner-edge pair while preserving the cross.",
  },
  oll: {
    index: "03",
    title: "Orient Last Layer",
    note: "Orients every sticker on the U face.",
  },
  pll: {
    index: "04",
    title: "Permute Last Layer",
    note: "Places the final layer pieces to complete the solve.",
  },
};

const CUBE_COLORS: Record<string, string> = {
  U: "#f4f4ef",
  R: "#d7473f",
  F: "#2aaa6b",
  D: "#f0c54a",
  L: "#ef762f",
  B: "#3576d3",
};

function Icon({ name }: { name: "copy" | "play" | "reset" | "spark" | "check" }) {
  const paths = {
    copy: <><rect x="8" y="8" width="10" height="10" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    play: <path d="m8 5 9 7-9 7V5Z" />,
    reset: <><path d="M4 12a8 8 0 1 0 2.3-5.65L4 8" /><path d="M4 4v4h4" /></>,
    spark: <><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z" /><path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="icon" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function MoveSequence({ moves, muted = false }: { moves: readonly Move[]; muted?: boolean }) {
  if (moves.length === 0) {
    return <span className="move-empty">No moves · already solved</span>;
  }

  return (
    <div className={`move-sequence${muted ? " is-muted" : ""}`}>
      {moves.map((move, index) => (
        <span className="move-token" key={`${move}-${index}`}>{move}</span>
      ))}
    </div>
  );
}

type Point = readonly [number, number];

function interpolateFacePoint(
  corners: readonly [Point, Point, Point, Point],
  column: number,
  row: number,
): Point {
  const [topLeft, topRight, bottomRight, bottomLeft] = corners;
  const u = column / 3;
  const v = row / 3;

  return [
    (1 - u) * (1 - v) * topLeft[0] + u * (1 - v) * topRight[0] + u * v * bottomRight[0] + (1 - u) * v * bottomLeft[0],
    (1 - u) * (1 - v) * topLeft[1] + u * (1 - v) * topRight[1] + u * v * bottomRight[1] + (1 - u) * v * bottomLeft[1],
  ];
}

function CubeIsoFace({
  state,
  face,
  corners,
}: {
  state: CubeState;
  face: (typeof FACE_NAMES)[number];
  corners: readonly [Point, Point, Point, Point];
}) {
  const start = FACE_NAMES.indexOf(face) * 9;
  const stickers = state.slice(start, start + 9).split("");

  return (
    <g aria-label={`${FACE_LABELS[face]} face`}>
      {stickers.map((color, index) => (
        <polygon
          className="cube-sticker"
          points={[
            interpolateFacePoint(corners, index % 3, Math.floor(index / 3)),
            interpolateFacePoint(corners, index % 3 + 1, Math.floor(index / 3)),
            interpolateFacePoint(corners, index % 3 + 1, Math.floor(index / 3) + 1),
            interpolateFacePoint(corners, index % 3, Math.floor(index / 3) + 1),
          ].map((point) => point.join(",")).join(" ")}
          fill={CUBE_COLORS[color]}
          key={`${face}-${index}`}
        />
      ))}
    </g>
  );
}

function CubeVisualizer({ state, label }: { state: CubeState; label: string }) {
  return (
    <div className="visualizer" data-testid="cube-visualizer">
      <div className="visualizer-heading">
        <div>
          <span className="kicker">Live cube state</span>
          <h2>{label}</h2>
        </div>
        <span className="view-badge"><span /> U · F · R</span>
      </div>
      <div className="cube-stage" aria-label={`3D cube visualization: ${label}`}>
        <svg className="cube-svg" viewBox="0 0 360 300" role="img">
          <defs>
            <filter id="cube-shadow" x="-30%" y="-30%" width="160%" height="170%">
              <feDropShadow dx="0" dy="18" stdDeviation="14" floodColor="#000" floodOpacity=".58" />
            </filter>
          </defs>
          <ellipse className="cube-floor-shadow" cx="181" cy="261" rx="96" ry="20" />
          <g filter="url(#cube-shadow)">
            <CubeIsoFace state={state} face="U" corners={[[100, 78], [180, 32], [260, 78], [180, 124]]} />
            <CubeIsoFace state={state} face="F" corners={[[100, 78], [180, 124], [180, 256], [100, 210]]} />
            <CubeIsoFace state={state} face="R" corners={[[180, 124], [260, 78], [260, 210], [180, 256]]} />
          </g>
        </svg>
      </div>
      <div className="orientation-key">
        {(["U", "F", "R"] as const).map((face) => (
          <span key={face}>
            <i style={{ background: CUBE_COLORS[face] }} />
            {face} <small>{FACE_LABELS[face]}</small>
          </span>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, suffix }: { label: string; value: number | string; suffix?: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {suffix && <small>{suffix}</small>}
    </div>
  );
}

function StatusPill({ label, solved }: { label: string; solved: boolean }) {
  return (
    <div className={`status-pill ${solved ? "is-complete" : ""}`}>
      <span className="status-dot">{solved && <Icon name="check" />}</span>
      <span>{label}</span>
      <small>{solved ? "complete" : "pending"}</small>
    </div>
  );
}

function PhaseCard({ phase, result }: { phase: CFOPPhase; result: WorkbenchResult }) {
  const phaseResult = result.phases[phase];
  const copy = PHASE_COPY[phase];
  const details = phase === "oll"
    ? result.oll.algorithmIds
    : phase === "pll"
      ? result.pll.algorithmIds
      : [];

  return (
    <article className={`phase-card phase-${phase}`}>
      <header className="phase-card-header">
        <div className="phase-number">{copy.index}</div>
        <div className="phase-title-group">
          <div className="phase-label-row">
            <h3>{copy.title}</h3>
            <span className="complete-badge"><Icon name="check" /> Complete</span>
          </div>
          <p>{copy.note}</p>
        </div>
        <div className="phase-metrics">
          <span><b>{phaseResult.htm}</b> HTM</span>
          <span><b>{phaseResult.qtm}</b> QTM</span>
        </div>
      </header>

      <div className="phase-moves">
        <span className="field-label">Moves</span>
        <MoveSequence moves={phaseResult.moves} />
      </div>

      {phase === "f2l" && (
        <div className="slot-grid">
          {(["FR", "FL", "BR", "BL"] as F2LSlot[]).map((slot) => {
            const order = result.phases.f2l.solvedOrder.indexOf(slot);
            return (
              <div className="slot-card" key={slot}>
                <div className="slot-card-top">
                  <strong>{slot}</strong>
                  <span>{order >= 0 ? `pair ${order + 1}` : "pre-solved"}</span>
                </div>
                <MoveSequence moves={result.phases.f2l.slotMoves[slot]} muted />
              </div>
            );
          })}
        </div>
      )}

      {(phase === "oll" || phase === "pll") && (
        <div className="algorithm-row">
          <span className="field-label">Case</span>
          <code>{phase === "oll" ? result.oll.caseId : result.pll.caseId}</code>
          <span className="algorithm-separator" />
          <span className="field-label">Algorithm path</span>
          <span>{details.length > 0 ? details.join(" → ") : "skip"}</span>
        </div>
      )}
    </article>
  );
}

export default function Home() {
  const [scramble, setScramble] = useState<string>(SAMPLES[0]);
  const [sampleIndex, setSampleIndex] = useState(0);
  const [result, setResult] = useState<WorkbenchResult | null>(null);
  const [activeStep, setActiveStep] = useState<ViewStep>("scramble");
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const parsedInput = useMemo(() => {
    try {
      const moves = parseMoveString(scramble);
      return {
        moves,
        state: applyMoves(SOLVED_STATE, moves),
        error: null,
      };
    } catch (error) {
      return {
        moves: [] as Move[],
        state: SOLVED_STATE,
        error: error instanceof Error ? error.message : "Invalid scramble.",
      };
    }
  }, [scramble]);

  const stateForStep = useMemo(() => {
    if (!result || activeStep === "scramble") return parsedInput.state;
    return result.phases[activeStep].stateAfter;
  }, [activeStep, parsedInput.state, result]);

  const progress = useMemo(() => getCFOPProgress(stateForStep), [stateForStep]);
  const activeLabel = STEPS.find((step) => step.id === activeStep)?.label ?? "Scramble";

  async function handleSolve() {
    if (parsedInput.error || loading) return;

    setLoading(true);
    setServerError(null);
    setCopied(false);

    try {
      const response = await fetch("/api/cfop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scramble }),
      });
      const payload = (await response.json()) as ApiResponse;

      if (!payload.success) {
        throw new Error(payload.error.message);
      }

      setResult(payload.data);
      setActiveStep("cross");
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Solver request failed.");
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setScramble("");
    setResult(null);
    setServerError(null);
    setActiveStep("scramble");
  }

  function handleSample() {
    const next = (sampleIndex + 1) % SAMPLES.length;
    setSampleIndex(next);
    setScramble(SAMPLES[next]);
    setResult(null);
    setServerError(null);
    setActiveStep("scramble");
  }

  async function copySolution() {
    if (!result) return;
    await navigator.clipboard.writeText(result.solution.join(" "));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function selectStep(step: ViewStep) {
    if (step !== "scramble" && !result) return;
    setActiveStep(step);
  }

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <nav className="topbar" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="CubeLab home">
          <span className="brand-mark" aria-hidden="true">
            <i /><i /><i /><i />
          </span>
          <span>Cube<span>Lab</span></span>
        </a>
        <div className="nav-links">
          <a className="active" href="#workbench">Workbench</a>
          <a href="#solution">Solution</a>
          <a href="/detect">Detection</a>
        </div>
        <div className="engine-status">
          <span /> CFOP engine online
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <span className="eyebrow"><span /> Human-style CFOP analysis</span>
          <h1>Read the cube.<br /><em>See the solution.</em></h1>
          <p>
            A precise workbench for inspecting every phase of a Rubik&apos;s Cube solve—from scrambled state to the final turn.
          </p>
        </div>
        <div className="hero-aside">
          <span className="hero-index">3×3</span>
          <p>Cross · F2L · OLL · PLL</p>
          <div className="spectrum" aria-hidden="true">
            <i /><i /><i /><i /><i /><i />
          </div>
        </div>
      </section>

      <section className="workbench-grid" id="workbench">
        <div className="input-panel glass-panel">
          <div className="panel-heading">
            <div>
              <span className="kicker">01 / Input</span>
              <h2>Enter scramble</h2>
            </div>
            <span className="notation-label">WCA notation</span>
          </div>

          <label className={`scramble-field ${parsedInput.error ? "has-error" : ""}`}>
            <span className="sr-only">Scramble</span>
            <textarea
              value={scramble}
              onChange={(event) => {
                setScramble(event.target.value);
                setResult(null);
                setServerError(null);
                setActiveStep("scramble");
              }}
              placeholder="R U R' U' F2 D L2…"
              spellCheck={false}
              rows={4}
              data-testid="scramble-input"
            />
            <span className="move-count">{parsedInput.moves.length} moves</span>
          </label>

          {(parsedInput.error || serverError) && (
            <div className="error-message" role="alert">
              <span>!</span>
              <div><strong>Unable to solve</strong>{parsedInput.error ?? serverError}</div>
            </div>
          )}

          <div className="input-actions">
            <div>
              <button className="button secondary" type="button" onClick={handleClear}>
                <Icon name="reset" /> Clear
              </button>
              <button className="button secondary" type="button" onClick={handleSample}>
                <Icon name="spark" /> Sample
              </button>
            </div>
            <button
              className="button primary"
              type="button"
              disabled={Boolean(parsedInput.error) || loading}
              onClick={handleSolve}
              data-testid="solve-button"
            >
              {loading ? <span className="spinner" data-testid="solver-loading" /> : <Icon name="play" />}
              {loading ? "Solving…" : "Run solver"}
            </button>
          </div>

          <div className="input-footnote">
            <span>Supported</span>
            <code>U D L R F B</code>
            <code>&apos;</code>
            <code>2</code>
          </div>
        </div>

        <CubeVisualizer state={stateForStep} label={activeLabel} />
      </section>

      <section className="status-strip" aria-label="Cube status">
        <StatusPill label="Cross" solved={progress.cross.solved} />
        <StatusPill label="Aligned" solved={progress.alignedCross.solved} />
        <StatusPill label="F2L" solved={progress.f2l.solved} />
        <StatusPill label="OLL" solved={progress.oll.solved} />
        <StatusPill label="PLL" solved={progress.pll.solved} />
      </section>

      <section className="solution-section" id="solution">
        <div className="section-heading">
          <div>
            <span className="kicker">02 / Analysis</span>
            <h2>Solution breakdown</h2>
          </div>
          {result && <span className="runtime">Computed in {result.timeMs} ms</span>}
        </div>

        <div className="stepper" aria-label="Solution phases">
          {STEPS.map((step, index) => {
            const enabled = step.id === "scramble" || Boolean(result);
            const isActive = activeStep === step.id;
            const isComplete = Boolean(result) && step.id !== "scramble";
            return (
              <button
                type="button"
                className={`${isActive ? "is-active" : ""} ${isComplete ? "is-complete" : ""}`}
                disabled={!enabled}
                onClick={() => selectStep(step.id)}
                key={step.id}
              >
                <span className="step-node">{isComplete ? <Icon name="check" /> : index}</span>
                <span className="step-copy"><small>{step.eyebrow}</small><strong>{step.label}</strong></span>
              </button>
            );
          })}
        </div>

        {!result ? (
          <div className="empty-state">
            <div className="empty-cube" aria-hidden="true"><i /><i /><i /></div>
            <span className="kicker">Ready when you are</span>
            <h3>Your phase analysis will appear here.</h3>
            <p>Enter a valid scramble and run the solver to inspect the full CFOP path.</p>
          </div>
        ) : (
          <div className="results" data-testid="solve-result">
            <div className="summary-card">
              <div className="summary-main">
                <span className="kicker">Full solution</span>
                <MoveSequence moves={result.solution} />
              </div>
              <div className="summary-metrics">
                <Metric label="HTM" value={result.totalHTM} suffix="turns" />
                <Metric label="QTM" value={result.totalQTM} suffix="quarters" />
                <button className="copy-button" type="button" onClick={copySolution}>
                  <Icon name={copied ? "check" : "copy"} /> {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <div className="phase-list">
              {(["cross", "f2l", "oll", "pll"] as CFOPPhase[]).map((phase) => (
                <PhaseCard phase={phase} result={result} key={phase} />
              ))}
            </div>

            <div className="state-inspector">
              <div className="state-inspector-heading">
                <div>
                  <span className="kicker">CubeState inspector</span>
                  <h3>{activeLabel} snapshot</h3>
                </div>
                <span>URFDLB · 54 stickers</span>
              </div>
              <div className="state-values">
                <div>
                  <span>State before</span>
                  <code>{activeStep === "scramble" ? SOLVED_STATE : result.phases[activeStep].stateBefore}</code>
                </div>
                <div>
                  <span>State after</span>
                  <code>{stateForStep}</code>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      <footer>
        <span>CubeLab / CFOP Workbench</span>
        <span>Existing move engine · detection · phase solvers</span>
      </footer>
    </main>
  );
}
