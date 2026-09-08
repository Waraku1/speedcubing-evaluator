import type { UiDownstreamAvailabilityV1 } from "../../lib/ui/evaluateUiTypesV1";

import styles from "./results.module.css";

type UnavailableStagesPanelProps = Readonly<{
  availability: UiDownstreamAvailabilityV1;
}>;

export function UnavailableStagesPanel({
  availability,
}: UnavailableStagesPanelProps) {
  return (
    <section aria-labelledby="availability-heading" className={styles.section}>
      <p className={styles.sectionLabel}>Semantic boundary</p>
      <h3 id="availability-heading">Downstream availability</h3>
      <dl className={styles.availabilityList}>
        <div>
          <dt>Demand analysis</dt>
          <dd><span aria-hidden="true">✓</span> Available</dd>
        </div>
        <div>
          <dt>Entropy</dt>
          <dd><span aria-hidden="true">—</span> Not semantically available</dd>
        </div>
        <div>
          <dt>Interpretation</dt>
          <dd><span aria-hidden="true">—</span> Not semantically available</dd>
        </div>
        <div>
          <dt>Evaluation</dt>
          <dd><span aria-hidden="true">—</span> Not semantically available</dd>
        </div>
      </dl>
      <p className={styles.reasonLine}>
        Reason: <span className="mono">{availability.entropy.reason}</span>
      </p>
      <p className={styles.supportingCopy}>
        This release provides typed Demand analysis and its trace. Entropy,
        interpretation, and evaluation are not shown because their semantics
        are not yet authorized. No score has been substituted.
      </p>
    </section>
  );
}
