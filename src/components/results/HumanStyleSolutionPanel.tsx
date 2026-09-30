"use client";

import { useEffect, useRef, useState } from "react";

import type {
  CFOPPhaseResultV1,
  CFOPResultV1,
} from "../../types/cfop-v1";
import type {
  CFOPAlternativeV1,
  CFOPAlternativesResultV1,
} from "../../types/cfop-alternatives-v1";
import {
  normalizeUiCFOPErrorV1,
  requestCFOPSolution,
  type CFOPCubeOperationV1,
  type UiCFOPPublicErrorV1,
} from "../../lib/ui/cfopCube";
import {
  requestCFOPAlternatives,
  type CFOPAlternativesOperationV1,
} from "../../lib/ui/cfopAlternativesCube";
import styles from "./results.module.css";

type HumanStyleSolutionPanelProps = Readonly<{
  facelets: string;
}>;

type CommittedResult = Readonly<{
  requestId: string;
  result: CFOPResultV1;
}>;

type ComparisonView = "FULL" | "CROSS" | "F2L" | "OLL" | "PLL";

const COMPARISON_VIEWS: readonly ComparisonView[] = [
  "FULL",
  "CROSS",
  "F2L",
  "OLL",
  "PLL",
];

const STRATEGY_LABELS = Object.freeze({
  DEFAULT: "Current deterministic pipeline",
  CROSS_VARIANT: "Different verified Cross path",
  F2L_FIRST_SLOT: "Different verified first F2L slot",
});

function MoveSequence({ moves }: Readonly<{ moves: readonly string[] }>) {
  return <span className="mono">{moves.join(" ") || "No moves required"}</span>;
}

function AlternativePhaseView({
  alternative,
  view,
}: Readonly<{
  alternative: CFOPAlternativeV1;
  view: ComparisonView;
}>) {
  if (view === "FULL") {
    return (
      <>
        <dl className={styles.comparisonMetrics}>
          <div><dt>Total HTM</dt><dd>{alternative.solution.htm}</dd></div>
          <div><dt>Total QTM</dt><dd>{alternative.solution.qtm}</dd></div>
        </dl>
        <p className={styles.phaseMetrics}>
          Cross {alternative.phases.cross.htm} HTM · F2L {alternative.phases.f2l.htm} HTM ·
          OLL {alternative.phases.oll.htm} HTM · PLL {alternative.phases.pll.htm} HTM
        </p>
        <p><strong>Complete move sequence</strong></p>
        <p><MoveSequence moves={alternative.solution.moves} /></p>
      </>
    );
  }

  if (view === "F2L") {
    const phase = alternative.phases.f2l;
    return (
      <>
        <p><strong>F2L moves</strong></p>
        <p><MoveSequence moves={phase.moves} /></p>
        <p className={styles.phaseMetrics}>HTM {phase.htm} · QTM {phase.qtm}</p>
        <p><strong>Solved order:</strong> {phase.solvedOrder.join(" → ") || "Already solved"}</p>
        {phase.stages.length === 0 ? (
          <p>No F2L stages required.</p>
        ) : (
          <ol className={styles.comparisonStages}>
            {phase.stages.map((stage, index) => (
              <li key={`${alternative.ordinal}:${stage.slot}:${index}`}>
                <strong>{stage.slot} slot</strong>
                <p><MoveSequence moves={stage.moves} /></p>
                <p>Macro IDs: {stage.macroIds.join(" → ") || "None"}</p>
                <p className={styles.phaseMetrics}>HTM {stage.htm} · QTM {stage.qtm}</p>
              </li>
            ))}
          </ol>
        )}
      </>
    );
  }

  if (view === "CROSS") {
    const phase = alternative.phases.cross;
    return (
      <>
        <p><strong>Cross moves</strong></p>
        <p><MoveSequence moves={phase.moves} /></p>
        <p className={styles.phaseMetrics}>HTM {phase.htm} · QTM {phase.qtm}</p>
      </>
    );
  }

  const phase = view === "OLL"
    ? alternative.phases.oll
    : alternative.phases.pll;

  return (
    <>
      <p><strong>{view} moves</strong></p>
      <p><MoveSequence moves={phase.moves} /></p>
      <p className={styles.phaseMetrics}>HTM {phase.htm} · QTM {phase.qtm}</p>
      <dl className={styles.technicalList}>
        <div><dt>Case ID</dt><dd>{phase.caseId}</dd></div>
        <div>
          <dt>Algorithm IDs</dt>
          <dd>{phase.algorithmIds.join(" → ") || "None"}</dd>
        </div>
      </dl>
    </>
  );
}

function AlternativesComparison({
  result,
}: Readonly<{ result: CFOPAlternativesResultV1 }>) {
  const [view, setView] = useState<ComparisonView>("FULL");

  return (
    <section aria-labelledby="cfop-alternatives-heading" className={styles.comparisonPanel}>
      <h4 id="cfop-alternatives-heading">Verified solution alternatives</h4>
      <p className={styles.supportingCopy}>
        These alternatives compare verified cube-solution paths only. They are
        not Human-State or Domain-Demand evaluations.
      </p>
      <div
        aria-label="Comparison phase"
        className={styles.comparisonSelector}
        role="group"
      >
        {COMPARISON_VIEWS.map((candidateView) => (
          <button
            aria-pressed={view === candidateView}
            key={candidateView}
            onClick={() => setView(candidateView)}
            type="button"
          >
            {candidateView === "FULL"
              ? "Full"
              : candidateView === "CROSS"
                ? "Cross"
                : candidateView}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="sr-only">
        Showing {view === "FULL" ? "Full" : view} comparison
      </p>
      <div className={styles.comparisonGrid} data-testid="cfop-alternatives-result">
        {result.alternatives.map((alternative) => (
          <article className={styles.comparisonCard} key={alternative.ordinal}>
            <h5>
              {alternative.ordinal === 1
                ? "Current solver result"
                : `Alternative ${alternative.ordinal}`}
            </h5>
            <p className={styles.strategyLabel}>
              Candidate {alternative.ordinal} · Generation strategy: {STRATEGY_LABELS[alternative.strategy]}
            </p>
            <AlternativePhaseView alternative={alternative} view={view} />
          </article>
        ))}
      </div>
      <p className={styles.comparisonSummary}>
        Generated {result.generatedCount} of up to {result.requestedLimit} requested paths.
      </p>
    </section>
  );
}

function PhaseMoves({ phase }: Readonly<{ phase: CFOPPhaseResultV1 }>) {
  return (
    <div className={styles.cfopPhase}>
      <div className={styles.headingRow}>
        <h4>{phase.phase}</h4>
        <span aria-label={`${phase.phase} verification: Verified`} className={styles.verifiedBadge}>
          <span aria-hidden="true">✓</span> Verified
        </span>
      </div>
      {phase.moves.length === 0 ? (
        <p className={styles.emptyPhase}>No moves required</p>
      ) : (
        <ol aria-label={`${phase.phase} moves`} className={styles.moveList}>
          {phase.moves.map((move, index) => (
            <li className={styles.moveToken} key={`${phase.phase}:${index}:${move}`}>
              <span className="sr-only">Move {index + 1}: </span>
              {move}
            </li>
          ))}
        </ol>
      )}
      <p className={styles.phaseMetrics}>
        HTM {phase.htm} · QTM {phase.qtm}
      </p>
    </div>
  );
}

function CFOPResultContent({
  result,
  requestId,
}: Readonly<{ result: CFOPResultV1; requestId?: string }>) {
  return (
    <div className={styles.cfopResult}>
      <dl className={styles.compactMetrics}>
        <div>
          <dt>Total HTM</dt>
          <dd>{result.solution.htm}</dd>
        </div>
        <div>
          <dt>Total QTM</dt>
          <dd>{result.solution.qtm}</dd>
        </div>
      </dl>

      <div className={styles.cfopPhaseList}>
        <PhaseMoves phase={result.phases.cross} />
        <PhaseMoves phase={result.phases.f2l} />
        <PhaseMoves phase={result.phases.oll} />
        <PhaseMoves phase={result.phases.pll} />
      </div>

      <details className={styles.cfopDetails}>
        <summary>F2L slot details and provenance</summary>
        <dl className={styles.technicalList}>
          <div>
            <dt>Solved order</dt>
            <dd>{result.phases.f2l.solvedOrder.join(" → ") || "Already solved"}</dd>
          </div>
          {result.phases.f2l.slots.map((slot) => (
            <div key={slot.slot}>
              <dt>{slot.slot} slot</dt>
              <dd className="mono">{slot.moves.join(" ") || "No moves required"}</dd>
            </div>
          ))}
          <div>
            <dt>Input mode</dt>
            <dd>{result.input.inputMode}</dd>
          </div>
          <div>
            <dt>History usage</dt>
            <dd>{result.method.historyUsage}</dd>
          </div>
          {requestId === undefined ? null : (
            <div>
              <dt>Request ID</dt>
              <dd className="mono">{requestId}</dd>
            </div>
          )}
        </dl>
      </details>
    </div>
  );
}

export function SavedHumanStyleSolutionPanel({
  result,
}: Readonly<{ result?: CFOPResultV1 }>) {
  return (
    <section aria-labelledby="saved-cfop-heading" className={styles.section}>
      <p className={styles.sectionLabel}>Stored separate cube solution information</p>
      <h3 id="saved-cfop-heading">Human-style CFOP snapshot</h3>
      <p className={styles.supportingCopy}>
        This is stored method output from the save operation. Opening this record
        does not re-run CFOP, and the output remains separate from Human State,
        Domain Demand, Entropy, Interpretation, and Evaluation.
      </p>
      {result === undefined ? (
        <div className={styles.infoNote}>
          CFOP was not included in this saved snapshot.
        </div>
      ) : (
        <CFOPResultContent result={result} />
      )}
    </section>
  );
}

export function HumanStyleSolutionPanel({ facelets }: HumanStyleSolutionPanelProps) {
  const [status, setStatus] = useState<
    "IDLE" | "LOADING" | "SUCCESS" | "ERROR" | "CANCELLED"
  >("IDLE");
  const [committed, setCommitted] = useState<CommittedResult | null>(null);
  const [error, setError] = useState<UiCFOPPublicErrorV1 | null>(null);
  const [alternativesStatus, setAlternativesStatus] = useState<
    "IDLE" | "LOADING" | "SUCCESS" | "ERROR" | "CANCELLED"
  >("IDLE");
  const [alternatives, setAlternatives] =
    useState<CFOPAlternativesResultV1 | null>(null);
  const [alternativesError, setAlternativesError] =
    useState<UiCFOPPublicErrorV1 | null>(null);
  const operationRef = useRef<CFOPCubeOperationV1 | null>(null);
  const alternativesOperationRef = useRef<CFOPAlternativesOperationV1 | null>(null);
  const epochRef = useRef(0);
  const resultRef = useRef<HTMLHeadingElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const runRef = useRef<HTMLButtonElement | null>(null);
  const alternativesResultRef = useRef<HTMLDivElement | null>(null);
  const alternativesErrorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      epochRef.current += 1;
      operationRef.current?.cancel();
      operationRef.current = null;
      alternativesOperationRef.current?.cancel();
      alternativesOperationRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (status === "SUCCESS") resultRef.current?.focus();
    if (status === "ERROR") errorRef.current?.focus();
    if (status === "CANCELLED") runRef.current?.focus();
  }, [status]);

  useEffect(() => {
    if (alternativesStatus === "SUCCESS") alternativesResultRef.current?.focus();
    if (alternativesStatus === "ERROR") alternativesErrorRef.current?.focus();
  }, [alternativesStatus]);

  function run(): void {
    if (operationRef.current !== null) return;

    const epoch = epochRef.current + 1;
    epochRef.current = epoch;
    const operation = requestCFOPSolution({ facelets });
    operationRef.current = operation;
    alternativesOperationRef.current?.cancel();
    alternativesOperationRef.current = null;
    setCommitted(null);
    setError(null);
    setAlternatives(null);
    setAlternativesError(null);
    setAlternativesStatus("IDLE");
    setStatus("LOADING");

    void operation.result.then(
      (value) => {
        if (operationRef.current !== operation || epochRef.current !== epoch) return;
        operationRef.current = null;
        setCommitted(value);
        setStatus("SUCCESS");
      },
      (reason: unknown) => {
        if (operationRef.current !== operation || epochRef.current !== epoch) return;
        operationRef.current = null;
        const normalized = normalizeUiCFOPErrorV1(reason);
        if (normalized.code === "REQUEST_CANCELLED") {
          setStatus("CANCELLED");
          return;
        }
        setError(normalized);
        setStatus("ERROR");
      }
    );
  }

  function cancel(): void {
    const operation = operationRef.current;
    if (operation === null) return;
    operationRef.current = null;
    epochRef.current += 1;
    operation.cancel();
    setStatus("CANCELLED");
  }

  function compareAlternatives(): void {
    if (alternativesOperationRef.current !== null) return;
    const operation = requestCFOPAlternatives({ facelets, maxAlternatives: 3 });
    alternativesOperationRef.current = operation;
    setAlternatives(null);
    setAlternativesError(null);
    setAlternativesStatus("LOADING");

    void operation.result.then(
      (value) => {
        if (alternativesOperationRef.current !== operation) return;
        alternativesOperationRef.current = null;
        setAlternatives(value);
        setAlternativesStatus("SUCCESS");
      },
      (reason: unknown) => {
        if (alternativesOperationRef.current !== operation) return;
        alternativesOperationRef.current = null;
        const normalized = normalizeUiCFOPErrorV1(reason);
        if (normalized.code === "REQUEST_CANCELLED") {
          setAlternativesStatus("CANCELLED");
          return;
        }
        setAlternativesError(normalized);
        setAlternativesStatus("ERROR");
      },
    );
  }

  function cancelAlternatives(): void {
    const operation = alternativesOperationRef.current;
    if (operation === null) return;
    alternativesOperationRef.current = null;
    operation.cancel();
    setAlternativesStatus("CANCELLED");
  }

  const result = committed?.result ?? null;

  return (
    <section aria-labelledby="cfop-heading" className={styles.section}>
      <p className={styles.sectionLabel}>Separate cube solution information</p>
      <h3 id="cfop-heading">Human-style CFOP</h3>
      <p className={styles.supportingCopy}>
        Generate Cross, F2L, OLL, and PLL moves directly from this facelet state.
        No scramble or observed cube history is reconstructed. This method output
        is not Human-State evidence and does not change Domain Demand.
      </p>

      <div aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        {status === "LOADING"
          ? "Generating human-style CFOP solution"
          : status === "SUCCESS"
            ? "Human-style CFOP solution ready"
            : status === "CANCELLED"
              ? "Human-style CFOP request cancelled"
              : ""}
      </div>

      <div className={styles.cfopActions}>
        <button
          className={styles.inlineButton}
          disabled={status === "LOADING"}
          onClick={run}
          ref={runRef}
          type="button"
        >
          {status === "SUCCESS" ? "Regenerate CFOP solution" : "Generate CFOP solution"}
        </button>
        {status === "LOADING" ? (
          <button className={styles.inlineButton} onClick={cancel} type="button">
            Cancel CFOP request
          </button>
        ) : null}
      </div>

      {status === "LOADING" ? (
        <div className={styles.infoNote} data-testid="cfop-request-status">
          <strong>Generating human-style phases</strong>
          <p>The current facelet state is being processed on the server.</p>
        </div>
      ) : null}

      {status === "CANCELLED" ? (
        <div className={styles.infoNote} data-testid="cfop-cancelled-status">
          <strong>CFOP request cancelled</strong>
          <p>The verified evaluation result remains available.</p>
        </div>
      ) : null}

      {status === "ERROR" && error !== null ? (
        <div
          className={styles.cfopError}
          data-testid="cfop-error-summary"
          ref={errorRef}
          role="alert"
          tabIndex={-1}
        >
          <p className="mono">{error.code}</p>
          <h4>{error.title}</h4>
          <p>{error.explanation}</p>
          {error.requestId === undefined ? null : (
            <p>
              Support request ID: <span className="mono">{error.requestId}</span>
            </p>
          )}
          {error.retryable ? (
            <button className={styles.inlineButton} onClick={run} type="button">
              Try CFOP again
            </button>
          ) : null}
        </div>
      ) : null}

      {status === "SUCCESS" && result !== null ? (
        <div className={styles.cfopResult} data-testid="cfop-result">
          <h4 ref={resultRef} tabIndex={-1}>
            Verified CFOP phase solution
          </h4>
          <CFOPResultContent requestId={committed?.requestId} result={result} />
          <div className={styles.cfopActions}>
            <button
              className={styles.inlineButton}
              disabled={alternativesStatus === "LOADING"}
              onClick={compareAlternatives}
              type="button"
            >
              {alternativesStatus === "SUCCESS"
                ? "Refresh verified alternatives"
                : "Compare verified alternatives"}
            </button>
            {alternativesStatus === "LOADING" ? (
              <button
                className={styles.inlineButton}
                onClick={cancelAlternatives}
                type="button"
              >
                Cancel alternatives request
              </button>
            ) : null}
          </div>
          {alternativesStatus === "LOADING" ? (
            <div className={styles.infoNote} role="status">
              Generating bounded verified alternatives…
            </div>
          ) : null}
          {alternativesStatus === "CANCELLED" ? (
            <div className={styles.infoNote} role="status">
              Alternatives request cancelled. The current solver result remains available.
            </div>
          ) : null}
          {alternativesStatus === "ERROR" && alternativesError !== null ? (
            <div
              className={styles.cfopError}
              ref={alternativesErrorRef}
              role="alert"
              tabIndex={-1}
            >
              <h4>{alternativesError.title}</h4>
              <p>{alternativesError.explanation}</p>
              {alternativesError.retryable ? (
                <button
                  className={styles.inlineButton}
                  onClick={compareAlternatives}
                  type="button"
                >
                  Try alternatives again
                </button>
              ) : null}
            </div>
          ) : null}
          {alternativesStatus === "SUCCESS" && alternatives !== null ? (
            <div ref={alternativesResultRef} tabIndex={-1}>
              <AlternativesComparison result={alternatives} />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
