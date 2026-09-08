"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef } from "react";

import {
  evaluateCube,
  normalizeUiEvaluateErrorV1,
  type EvaluateCubeOperationV1,
} from "../../lib/ui/evaluateCube";
import {
  serializeCubeDraftV1,
  type CubeDraftTokenV1,
} from "../../lib/ui/cubeDraftV1";
import {
  createInitialWorkbenchStateV1,
  workbenchReducerV1,
} from "../../lib/ui/workbenchStateV1";
import { consumeScannerDraftHandoffV1 } from "../../lib/ui/scannerDraftHandoffV1";
import { EvaluationResultPanel } from "../results/EvaluationResultPanel";
import { CubeInputPanel } from "./CubeInputPanel";
import styles from "./workbench.module.css";

type ActiveOperation = Readonly<{
  epoch: number;
  operation: EvaluateCubeOperationV1;
}>;

export function EvaluatorWorkbench() {
  const [state, dispatch] = useReducer(
    workbenchReducerV1,
    undefined,
    createInitialWorkbenchStateV1
  );
  const operationRef = useRef<ActiveOperation | null>(null);
  const epochRef = useRef(0);
  const validationRef = useRef<HTMLDivElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const resultRef = useRef<HTMLHeadingElement | null>(null);
  const runRef = useRef<HTMLButtonElement | null>(null);
  const submitting = state.phase === "SUBMITTING";
  const ready = state.validation.state === "READY";

  useEffect(() => {
    return () => {
      const active = operationRef.current;
      operationRef.current = null;

      if (active !== null) {
        epochRef.current = Math.max(epochRef.current, active.epoch) + 1;
        active.operation.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (state.phase === "SUCCESS") {
      resultRef.current?.focus();
    } else if (state.phase === "ERROR") {
      switch (state.error?.focus) {
        case "CUBE_VALIDATION":
          validationRef.current?.focus();
          break;
        case "RUN_BUTTON":
          runRef.current?.focus();
          break;
        case "ERROR_SUMMARY":
          errorRef.current?.focus();
          break;
      }
    } else if (state.phase === "CANCELLED") {
      runRef.current?.focus();
    }
  }, [state.error?.focus, state.phase]);

  function focusSticker(index: number): void {
    const sticker = document.querySelector<HTMLButtonElement>(
      `[data-sticker-index="${index}"]`
    );
    sticker?.focus();
  }

  useEffect(() => {
    const draft = consumeScannerDraftHandoffV1(window.sessionStorage);
    if (draft === null) return;

    window.setTimeout(() => {
      dispatch({ type: "IMPORT_SCANNER_DRAFT", draft });
      window.setTimeout(() => focusSticker(0), 0);
    }, 0);
  }, []);

  function focusValidationProblem(): void {
    const index = state.validation.firstProblemIndex;
    validationRef.current?.focus();
    if (index !== null) {
      dispatch({ type: "SET_ACTIVE_STICKER", index });
      window.setTimeout(() => focusSticker(index), 0);
    }
  }

  function confirmDraftReplacement(action: "example" | "reset"): boolean {
    if (state.draftRevision === 0) {
      return true;
    }

    const description = action === "example" ? "load the solved example" : "reset the cube";
    return window.confirm(
      `Your current draft will be replaced. Continue and ${description}?`
    );
  }

  function handleRun(): void {
    if (operationRef.current !== null) {
      return;
    }

    if (!ready) {
      focusValidationProblem();
      return;
    }

    const epoch = Math.max(epochRef.current, state.requestEpoch) + 1;
    epochRef.current = epoch;
    const operation = evaluateCube({
      facelets: serializeCubeDraftV1(state.draft),
    });
    operationRef.current = { epoch, operation };
    dispatch({ type: "BEGIN_SUBMIT", epoch });

    void operation.result.then(
      (result) => {
        if (operationRef.current?.epoch !== epoch) {
          return;
        }
        operationRef.current = null;
        dispatch({ type: "RECEIVE_SUCCESS", epoch, result });
      },
      (error: unknown) => {
        if (operationRef.current?.epoch !== epoch) {
          return;
        }
        operationRef.current = null;
        dispatch({
          type: "RECEIVE_ERROR",
          epoch,
          error: normalizeUiEvaluateErrorV1(error),
        });
      }
    );
  }

  function handleCancel(): void {
    const active = operationRef.current;
    if (active === null) {
      return;
    }

    operationRef.current = null;
    active.operation.cancel();
    dispatch({ type: "CANCEL", epoch: active.epoch });
  }

  function liveMessage(): string {
    switch (state.phase) {
      case "SUBMITTING":
        return "Solving and generating Demand";
      case "SUCCESS":
        return "Evaluation result ready";
      case "ERROR":
        return state.error?.explanation ?? "The evaluation request failed.";
      case "CANCELLED":
        return "Request cancelled. Cube draft preserved.";
      default:
        return state.acquisitionMessage ?? state.validation.message;
    }
  }

  return (
    <div
      className={styles.workbench}
      data-has-result={state.phase === "SUCCESS"}
      data-phase={state.phase}
    >
      <p aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        {liveMessage()}
      </p>

      <section aria-labelledby="acquisition-heading" className={styles.acquisitionPanel}>
        <div>
          <p className={styles.stepLabel}>Optional helper</p>
          <h2 id="acquisition-heading">Prefer a camera-assisted draft?</h2>
          <p>
            Scan two poses locally, review every sticker, then return here for the
            same manual confirmation and Run evaluation step.
          </p>
        </div>
        <Link className={styles.scannerLink} href="/detect" prefetch={false}>
          Open optional camera scanner
        </Link>
      </section>

      <CubeInputPanel
        activeStickerIndex={state.activeStickerIndex}
        disabled={submitting}
        draft={state.draft}
        onActivateSticker={(index) =>
          dispatch({ type: "SET_ACTIVE_STICKER", index })
        }
        onEditSticker={(index, token) =>
          dispatch({ type: "EDIT_STICKER", index, token })
        }
        onFocusProblem={focusValidationProblem}
        onSelectToken={(token: CubeDraftTokenV1) =>
          dispatch({ type: "SELECT_TOKEN", token })
        }
        selectedToken={state.selectedToken}
        validation={state.validation}
        validationRef={validationRef}
      />

      <section aria-labelledby="submit-heading" className={styles.actionPanel}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.stepLabel}>Step 2</p>
            <h2 id="submit-heading">Run server analysis</h2>
          </div>
        </div>
        <p className={styles.sectionIntro}>
          The server checks physical cube validity, verifies the solution, and
          produces the bounded Domain Demand artifact.
        </p>

        <div className={styles.utilityActions}>
          <button
            className={styles.secondaryButton}
            disabled={submitting}
            onClick={() => {
              if (confirmDraftReplacement("example")) {
                dispatch({ type: "LOAD_SOLVED" });
              }
            }}
            type="button"
          >
            Load solved example
          </button>
          <button
            className={styles.secondaryButton}
            disabled={submitting}
            onClick={() => {
              if (confirmDraftReplacement("reset")) {
                dispatch({ type: "RESET" });
              }
            }}
            type="button"
          >
            Reset cube
          </button>
        </div>
        <p className={styles.exampleNote}>
          The solved cube is an input example only; it is not observed,
          detected, scanned, or human evidence.
        </p>

        <div className={styles.submitActions}>
          <button
            className={styles.primaryButton}
            disabled={!ready || submitting}
            onClick={handleRun}
            ref={runRef}
            type="button"
          >
            Run evaluation
          </button>
          {submitting ? (
            <button
              className={styles.cancelButton}
              onClick={handleCancel}
              type="button"
            >
              Cancel request
            </button>
          ) : null}
        </div>

        {submitting ? (
          <div className={styles.requestStatus} data-testid="request-status">
            <span aria-hidden="true" className={styles.statusMarker} />
            <div>
              <strong>Solving and generating Demand</strong>
              <p>One evaluation request is active. Draft editing is paused.</p>
            </div>
          </div>
        ) : null}

        {state.phase === "CANCELLED" ? (
          <div className={styles.cancelledStatus} data-testid="cancelled-status">
            <strong>Request cancelled</strong>
            <p>Your cube draft is unchanged and ready to submit again.</p>
          </div>
        ) : null}

        {state.phase === "ERROR" && state.error !== null ? (
          <div
            className={styles.errorSummary}
            data-testid="error-summary"
            ref={errorRef}
            role="alert"
            tabIndex={-1}
          >
            <p className={styles.errorCode}>{state.error.code}</p>
            <h3>{state.error.title}</h3>
            <p>{state.error.explanation}</p>
            <p>Your cube draft has been preserved.</p>
            {state.error.requestId !== undefined ? (
              <p>
                Support request ID:{" "}
                <span className="mono">{state.error.requestId}</span>
              </p>
            ) : null}
            {state.error.retryable ? (
              <button
                className={styles.secondaryButton}
                onClick={handleRun}
                type="button"
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      {state.phase === "SUCCESS" && state.result !== null ? (
        <EvaluationResultPanel
          onSelectTraceRecord={(recordId) =>
            dispatch({ type: "SELECT_TRACE_RECORD", recordId })
          }
          onTraceExpandedChange={(expanded) =>
            dispatch({ type: "SET_RESULT_DETAILS", expanded })
          }
          onTracePageChange={(page) =>
            dispatch({ type: "SET_TRACE_PAGE", page })
          }
          ref={resultRef}
          result={state.result}
          selectedTraceRecordId={state.selectedTraceRecordId}
          traceExpanded={state.resultDetailsExpanded}
          tracePage={state.tracePage}
        />
      ) : null}
    </div>
  );
}
