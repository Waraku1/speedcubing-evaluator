import type { UiSolutionV1 } from "../../lib/ui/evaluateUiTypesV1";

import { ResultDisclosure } from "./ResultDisclosure";
import styles from "./results.module.css";

type VerifiedSolutionPanelProps = Readonly<{
  solution: UiSolutionV1;
  solverDurationMs: number;
}>;

export function VerifiedSolutionPanel({
  solution,
  solverDurationMs,
}: VerifiedSolutionPanelProps) {
  return (
    <section aria-labelledby="verified-solution-heading" className={styles.section}>
      <div className={styles.headingRow}>
        <div>
          <p className={styles.sectionLabel}>Solution provenance</p>
          <h3 id="verified-solution-heading">Verified solution</h3>
        </div>
        <span aria-label="Solution verification: Verified" className={styles.verifiedBadge}>
          <span aria-hidden="true">✓</span> Verified
        </span>
      </div>

      {solution.moves.length === 0 ? (
        <p className={styles.emptySequence}>No moves required</p>
      ) : (
        <ol aria-label="Ordered verified solution moves" className={styles.moveList}>
          {solution.moves.map((move, index) => (
            <li
              className={styles.moveToken}
              data-move-index={index}
              data-move-token={move}
              key={`${index}:${move}`}
            >
              <span className="sr-only">Move {index + 1}: </span>
              {move}
            </li>
          ))}
        </ol>
      )}

      <dl className={styles.compactMetrics}>
        <div>
          <dt>HTM</dt>
          <dd>{solution.htm}</dd>
        </div>
        <div>
          <dt>QTM</dt>
          <dd>{solution.qtm}</dd>
        </div>
      </dl>

      <ResultDisclosure label="solution technical details">
        <dl className={styles.technicalList}>
          <div>
            <dt>Solution ID</dt>
            <dd className="mono">{solution.solutionId}</dd>
          </div>
          <div>
            <dt>Solver run ID</dt>
            <dd className="mono">{solution.solver.solverRunId}</dd>
          </div>
          <div>
            <dt>Engine</dt>
            <dd>{solution.solver.id}</dd>
          </div>
          <div>
            <dt>Engine version</dt>
            <dd>{solution.solver.version}</dd>
          </div>
          <div>
            <dt>Adapter version</dt>
            <dd>{solution.solver.adapterVersion}</dd>
          </div>
          <div>
            <dt>Cache hit</dt>
            <dd>{solution.solver.cacheHit ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt>Cache key version</dt>
            <dd>{solution.solver.cacheKeyVersion}</dd>
          </div>
          <div>
            <dt>Solver duration</dt>
            <dd>{solverDurationMs} ms</dd>
          </div>
        </dl>
      </ResultDisclosure>
    </section>
  );
}
