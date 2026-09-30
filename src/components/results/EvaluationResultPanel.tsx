import { forwardRef } from "react";

import type { UiEvaluateResultV1 } from "../../lib/ui/evaluateUiTypesV1";
import type { CFOPResultV1 } from "../../types/cfop-v1";

import { DemandResults } from "./DemandResults";
import {
  HumanStyleSolutionPanel,
  SavedHumanStyleSolutionPanel,
} from "./HumanStyleSolutionPanel";
import { TraceExplorer } from "./TraceExplorer";
import { UnavailableStagesPanel } from "./UnavailableStagesPanel";
import { VerifiedSolutionPanel } from "./VerifiedSolutionPanel";
import styles from "./results.module.css";

type EvaluationResultPanelProps = Readonly<{
  facelets: string;
  result: UiEvaluateResultV1;
  traceExpanded: boolean;
  tracePage: number;
  selectedTraceRecordId: string | null;
  onTraceExpandedChange(expanded: boolean): void;
  onTracePageChange(page: number): void;
  onSelectTraceRecord(recordId: string | null): void;
  snapshot?: Readonly<{
    id: string;
    createdAt: string;
    cfop?: CFOPResultV1;
  }>;
}>;

export const EvaluationResultPanel = forwardRef<
  HTMLHeadingElement,
  EvaluationResultPanelProps
>(function EvaluationResultPanel(
  {
    result,
    facelets,
    traceExpanded,
    tracePage,
    selectedTraceRecordId,
    onTraceExpandedChange,
    onTracePageChange,
    onSelectTraceRecord,
    snapshot,
  },
  ref
) {
  return (
    <section
      aria-labelledby="result-heading"
      className={styles.resultPanel}
      data-testid="result-shell"
    >
      <p className={styles.eyebrow}>
        {snapshot === undefined ? "Current live evaluation" : "Saved snapshot"}
      </p>
      <h2 id="result-heading" ref={ref} tabIndex={-1}>
        {snapshot === undefined ? "Evaluation result" : "Saved analysis snapshot"}
      </h2>
      <p className={styles.resultIntro}>
        {snapshot === undefined
          ? "Verified solution provenance, typed Domain Demand, semantic availability, and bounded trace records for this request."
          : "This immutable stored result is rendered without re-running evaluation or CFOP."}
      </p>
      <dl className={styles.requestMetadata}>
        <div>
          <dt>{snapshot === undefined ? "Request ID" : "Saved record ID"}</dt>
          <dd className="mono">{snapshot?.id ?? result.requestId}</dd>
        </div>
        <div>
          <dt>{snapshot === undefined ? "Build" : "Saved at"}</dt>
          <dd className={snapshot === undefined ? "mono" : undefined}>
            {snapshot === undefined
              ? result.build.commit
              : new Date(snapshot.createdAt).toLocaleString()}
          </dd>
        </div>
      </dl>

      <div className={styles.solutionGrid}>
        <VerifiedSolutionPanel
          facelets={facelets}
          showSaveProcedure={snapshot === undefined}
          solution={result.solution}
          solverDurationMs={result.timings.solverDurationMs}
        />
        {snapshot === undefined ? (
          <HumanStyleSolutionPanel facelets={facelets} />
        ) : (
          <SavedHumanStyleSolutionPanel result={snapshot.cfop} />
        )}
      </div>
      <section aria-labelledby="analysis-heading" className={styles.analysisRegion}>
        <p className={styles.eyebrow}>Analysis</p>
        <h3 id="analysis-heading">Evaluation analysis and provenance</h3>
        <p className={styles.supportingCopy}>
          This governed analysis remains attached to the current server-produced evaluation artifact.
        </p>
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
    </section>
  );
});
