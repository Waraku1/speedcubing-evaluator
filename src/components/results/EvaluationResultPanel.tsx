import { forwardRef } from "react";

import type { UiEvaluateResultV1 } from "../../lib/ui/evaluateUiTypesV1";

import { DemandResults } from "./DemandResults";
import { TraceExplorer } from "./TraceExplorer";
import { UnavailableStagesPanel } from "./UnavailableStagesPanel";
import { VerifiedSolutionPanel } from "./VerifiedSolutionPanel";
import styles from "./results.module.css";

type EvaluationResultPanelProps = Readonly<{
  result: UiEvaluateResultV1;
  traceExpanded: boolean;
  tracePage: number;
  selectedTraceRecordId: string | null;
  onTraceExpandedChange(expanded: boolean): void;
  onTracePageChange(page: number): void;
  onSelectTraceRecord(recordId: string | null): void;
}>;

export const EvaluationResultPanel = forwardRef<
  HTMLHeadingElement,
  EvaluationResultPanelProps
>(function EvaluationResultPanel(
  {
    result,
    traceExpanded,
    tracePage,
    selectedTraceRecordId,
    onTraceExpandedChange,
    onTracePageChange,
    onSelectTraceRecord,
  },
  ref
) {
  return (
    <section
      aria-labelledby="result-heading"
      className={styles.resultPanel}
      data-testid="result-shell"
    >
      <p className={styles.eyebrow}>Server response</p>
      <h2 id="result-heading" ref={ref} tabIndex={-1}>
        Evaluation result
      </h2>
      <p className={styles.resultIntro}>
        Verified solution provenance, typed Domain Demand, semantic
        availability, and bounded trace records for this request.
      </p>
      <dl className={styles.requestMetadata}>
        <div>
          <dt>Request ID</dt>
          <dd className="mono">{result.requestId}</dd>
        </div>
        <div>
          <dt>Build</dt>
          <dd className="mono">{result.build.commit}</dd>
        </div>
      </dl>

      <VerifiedSolutionPanel
        solution={result.solution}
        solverDurationMs={result.timings.solverDurationMs}
      />
      <DemandResults demand={result.demand} warnings={result.warnings} />
      <UnavailableStagesPanel availability={result.availability} />
      <TraceExplorer
        expanded={traceExpanded}
        onExpandedChange={onTraceExpandedChange}
        onPageChange={onTracePageChange}
        onSelectRecord={onSelectTraceRecord}
        page={tracePage}
        result={result}
        selectedRecordId={selectedTraceRecordId}
      />
    </section>
  );
});
