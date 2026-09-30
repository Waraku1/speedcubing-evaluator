"use client";

import { useEffect, useRef, useState } from "react";

import type {
  CFOPPhaseResultV1,
  CFOPResultV1,
} from "../../types/cfop-v1";
import {
  normalizeUiCFOPErrorV1,
  requestCFOPSolution,
  type CFOPCubeOperationV1,
  type UiCFOPPublicErrorV1,
} from "../../lib/ui/cfopCube";
import styles from "./results.module.css";

type HumanStyleSolutionPanelProps = Readonly<{
  facelets: string;
}>;

type CommittedResult = Readonly<{
  requestId: string;
  result: CFOPResultV1;
}>;

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
  const operationRef = useRef<CFOPCubeOperationV1 | null>(null);
  const epochRef = useRef(0);
  const resultRef = useRef<HTMLHeadingElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const runRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    return () => {
      epochRef.current += 1;
      operationRef.current?.cancel();
      operationRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (status === "SUCCESS") resultRef.current?.focus();
    if (status === "ERROR") errorRef.current?.focus();
    if (status === "CANCELLED") runRef.current?.focus();
  }, [status]);

  function run(): void {
    if (operationRef.current !== null) return;

    const epoch = epochRef.current + 1;
    epochRef.current = epoch;
    const operation = requestCFOPSolution({ facelets });
    operationRef.current = operation;
    setCommitted(null);
    setError(null);
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
        </div>
      ) : null}
    </section>
  );
}
