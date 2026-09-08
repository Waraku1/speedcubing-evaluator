import type {
  UiContinuityPropositionV1,
  UiDemandChannelV1,
  UiDemandPropositionBaseV1,
  UiDemandProvenanceV1,
  UiDomainDemandV1,
  UiFingerPropositionV1,
  UiGovernedStatusV1,
  UiGripPropositionV1,
  UiHumanStateNotObservedWarningV1,
  UiOrientationPropositionV1,
  UiTemporalEvidencePlaneV1,
} from "../../lib/ui/evaluateUiTypesV1";
import { ValidityBadge } from "../status/ValidityBadge";

import { ResultDisclosure } from "./ResultDisclosure";
import styles from "./results.module.css";

type DemandResultsProps = Readonly<{
  demand: UiDomainDemandV1;
  warnings: readonly UiHumanStateNotObservedWarningV1[];
}>;

function ProvenanceFields({
  provenance,
}: Readonly<{ provenance: UiDemandProvenanceV1 }>) {
  const fields = [
    ["Source version ID", provenance.sourceVersionId],
    ["Transition ID", provenance.transitionId],
    ["Before Human-State ref", provenance.beforeHumanStateRef],
    ["After Human-State ref", provenance.afterHumanStateRef],
    ["Event ID", provenance.eventId],
    ["Observation ID", provenance.observationId],
    ["Window ID", provenance.windowId],
  ] as const;

  return (
    <dl className={styles.technicalList}>
      {fields.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd className="mono">{value ?? "Not linked"}</dd>
        </div>
      ))}
    </dl>
  );
}

function GovernedDetail({
  label,
  value,
}: Readonly<{ label: string; value: UiGovernedStatusV1 }>) {
  return (
    <div className={styles.governedDetail}>
      <dt>{label}</dt>
      <dd>
        <ValidityBadge status={value.status} />
        <span>{value.reason}</span>
      </dd>
    </div>
  );
}

function PropositionIdentity({
  proposition,
}: Readonly<{ proposition: UiDemandPropositionBaseV1 }>) {
  return (
    <>
      <div>
        <dt>Proposition ID</dt>
        <dd className="mono">{proposition.propositionId}</dd>
      </div>
      <div>
        <dt>Transition ID</dt>
        <dd className="mono">{proposition.transitionId}</dd>
      </div>
      <div>
        <dt>Event ID</dt>
        <dd className="mono">{proposition.eventId}</dd>
      </div>
      <div>
        <dt>Observation ID</dt>
        <dd className="mono">{proposition.observationId}</dd>
      </div>
      <div>
        <dt>Window ID</dt>
        <dd className="mono">{proposition.windowId}</dd>
      </div>
    </>
  );
}

function StatusOnlyChannel<T>({
  channel,
}: Readonly<{ channel: UiDemandChannelV1<T> }>) {
  const status = channel.statusOnlyRecord;

  if (status === null) {
    return null;
  }

  return (
    <div className={styles.statusOnly} data-testid="status-only-channel">
      <ValidityBadge status={status.status} />
      <p>No Human-State source was provided for this execution.</p>
    </div>
  );
}

function GripDemandPanel({
  channel,
}: Readonly<{ channel: UiDemandChannelV1<UiGripPropositionV1> }>) {
  return (
    <section aria-labelledby="grip-demand-heading" className={styles.channel}>
      <div className={styles.channelHeading}>
        <h4 id="grip-demand-heading">Grip</h4>
        <span className={styles.designation}>T3 · G-H-GR1</span>
      </div>
      {channel.statusOnlyRecord !== null ? (
        <StatusOnlyChannel channel={channel} />
      ) : (
        <ol className={styles.propositionList}>
          {channel.propositionRecords.map((proposition, index) => (
            <li className={styles.proposition} key={proposition.propositionId}>
              <ValidityBadge status={proposition.status} />
              <p>{proposition.reason}</p>
              <dl className={styles.defaultFields}>
                <div><dt>Side</dt><dd>{proposition.side}</dd></div>
                <div><dt>Contact-count direction</dt><dd>{proposition.contactCountDirection}</dd></div>
                <div><dt>Stabilization direction</dt><dd>{proposition.stabilizationDirection}</dd></div>
              </dl>
              <ResultDisclosure label={`Grip proposition ${index + 1} technical details`}>
                <dl className={styles.technicalList}>
                  <PropositionIdentity proposition={proposition} />
                  <div><dt>Source fields</dt><dd className="mono">{proposition.sourceFields.join(", ")}</dd></div>
                  <GovernedDetail label="Contact identity" value={proposition.contactIdentity} />
                  <GovernedDetail label="Attribution" value={proposition.attribution} />
                  <GovernedDetail label="Path" value={proposition.path} />
                </dl>
                <ProvenanceFields provenance={proposition.provenance} />
              </ResultDisclosure>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function FingerDemandPanel({
  channel,
}: Readonly<{ channel: UiDemandChannelV1<UiFingerPropositionV1> }>) {
  return (
    <section aria-labelledby="finger-demand-heading" className={styles.channel}>
      <div className={styles.channelHeading}>
        <h4 id="finger-demand-heading">Finger</h4>
        <span className={styles.designation}>T3 · F-H-FR1</span>
      </div>
      {channel.statusOnlyRecord !== null ? (
        <StatusOnlyChannel channel={channel} />
      ) : (
        <ol className={styles.propositionList}>
          {channel.propositionRecords.map((proposition, index) => {
            const [hand, digit] = proposition.fingerId.split("_");
            return (
              <li className={styles.proposition} key={proposition.propositionId}>
                <ValidityBadge status={proposition.status} />
                <p>{proposition.reason}</p>
                <dl className={styles.defaultFields}>
                  <div><dt>Hand and digit</dt><dd>{hand === "L" ? "Left" : "Right"} · {digit}</dd></div>
                  <div><dt>Resource direction</dt><dd>{proposition.fatigueSourceDirection}</dd></div>
                  <div><dt>Availability direction</dt><dd>{proposition.availabilityDirection}</dd></div>
                </dl>
                <ResultDisclosure label={`Finger proposition ${index + 1} technical details`}>
                  <dl className={styles.technicalList}>
                    <PropositionIdentity proposition={proposition} />
                    <div><dt>Source fields</dt><dd className="mono">{proposition.sourceFields.join(", ")}</dd></div>
                    <GovernedDetail label="Resource semantics" value={proposition.resourceSemantics} />
                    <GovernedDetail label="Path" value={proposition.path} />
                  </dl>
                  <ProvenanceFields provenance={proposition.provenance} />
                </ResultDisclosure>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function OrientationDemandPanel({
  channel,
}: Readonly<{ channel: UiDemandChannelV1<UiOrientationPropositionV1> }>) {
  return (
    <section aria-labelledby="orientation-demand-heading" className={styles.channel}>
      <div className={styles.channelHeading}>
        <h4 id="orientation-demand-heading">Orientation</h4>
        <span className={styles.designation}>T3 · O-H-OR1</span>
      </div>
      {channel.statusOnlyRecord !== null ? (
        <StatusOnlyChannel channel={channel} />
      ) : (
        <ol className={styles.propositionList}>
          {channel.propositionRecords.map((proposition, index) => (
            <li className={styles.proposition} key={proposition.propositionId}>
              <ValidityBadge status={proposition.status} />
              <p>{proposition.reason}</p>
              <dl className={styles.defaultFields}>
                <div><dt>X direction</dt><dd>{proposition.xDirection}</dd></div>
                <div><dt>Y direction</dt><dd>{proposition.yDirection}</dd></div>
                <div><dt>Z direction</dt><dd>{proposition.zDirection}</dd></div>
              </dl>
              <ResultDisclosure label={`Orientation proposition ${index + 1} technical details`}>
                <dl className={styles.technicalList}>
                  <PropositionIdentity proposition={proposition} />
                  <div><dt>Source fields</dt><dd className="mono">{proposition.sourceFields.join(", ")}</dd></div>
                  <GovernedDetail label="Frame" value={proposition.frame} />
                  <GovernedDetail label="Transform" value={proposition.transform} />
                  <GovernedDetail label="Equivalence" value={proposition.equivalence} />
                  <GovernedDetail label="Path" value={proposition.path} />
                </dl>
                <ProvenanceFields provenance={proposition.provenance} />
              </ResultDisclosure>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ContinuityDemandPanel({
  channel,
}: Readonly<{ channel: UiDemandChannelV1<UiContinuityPropositionV1> }>) {
  return (
    <section aria-labelledby="continuity-demand-heading" className={styles.channel}>
      <div className={styles.channelHeading}>
        <h4 id="continuity-demand-heading">Continuity</h4>
        <span className={styles.designation}>T3 · C-H-CR1</span>
      </div>
      {channel.statusOnlyRecord !== null ? (
        <StatusOnlyChannel channel={channel} />
      ) : (
        <ol className={styles.propositionList}>
          {channel.propositionRecords.map((proposition, index) => (
            <li className={styles.proposition} key={proposition.propositionId}>
              <ValidityBadge status={proposition.status} />
              <p>{proposition.reason}</p>
              <dl className={styles.defaultFields}>
                <div><dt>Continuity direction</dt><dd>{proposition.continuityDirection}</dd></div>
              </dl>
              <ResultDisclosure label={`Continuity proposition ${index + 1} technical details`}>
                <dl className={styles.technicalList}>
                  <PropositionIdentity proposition={proposition} />
                  <div><dt>Source fields</dt><dd className="mono">{proposition.sourceFields.join(", ")}</dd></div>
                  <GovernedDetail label="Recovery classification" value={proposition.recoveryClassification} />
                  <GovernedDetail label="Path" value={proposition.path} />
                </dl>
                <ProvenanceFields provenance={proposition.provenance} />
              </ResultDisclosure>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function TemporalPlane({ plane }: Readonly<{ plane: UiTemporalEvidencePlaneV1 }>) {
  return (
    <article className={styles.temporalPlane}>
      <div className={styles.channelHeading}>
        <h4>{plane.plane}</h4>
        <ValidityBadge status={plane.status} />
      </div>
      <p>{plane.reason}</p>
      <ResultDisclosure label={`${plane.plane} provenance`}>
        <dl className={styles.technicalList}>
          <div><dt>Plane ID</dt><dd className="mono">{plane.planeId}</dd></div>
        </dl>
        <ProvenanceFields provenance={plane.provenance} />
      </ResultDisclosure>
    </article>
  );
}

export function DemandResults({ demand, warnings }: DemandResultsProps) {
  const channels = demand.executionEpisode.t3Consequences;
  const hasHumanStateWarning = warnings.some(
    (warning) => warning.code === "HUMAN_STATE_NOT_OBSERVED"
  );

  return (
    <section aria-labelledby="domain-demand-heading" className={styles.section}>
      <p className={styles.sectionLabel}>Typed evidence result</p>
      <h3 id="domain-demand-heading">Domain Demand</h3>
      <p className={styles.supportingCopy}>
        These channels have distinct typed meanings and are not comparable
        measurements. A result may be status-only. Verified moves are solution
        provenance and do not constitute observed human execution.
      </p>

      {hasHumanStateWarning ? (
        <aside className={styles.infoNote} data-testid="human-state-warning">
          <strong>Human-State evidence was not observed</strong>
          <p>
            The solution execution was not observed as Human-State evidence.
            The verified solution remains valid, and the Demand channels stay
            visible with their governed status.
          </p>
        </aside>
      ) : null}

      <div className={styles.channelSequence} data-testid="demand-channel-sequence">
        <GripDemandPanel channel={channels.grip} />
        <FingerDemandPanel channel={channels.finger} />
        <OrientationDemandPanel channel={channels.orientation} />
        <ContinuityDemandPanel channel={channels.continuity} />
      </div>

      <section aria-labelledby="temporal-evidence-heading" className={styles.temporalSection}>
        <h4 id="temporal-evidence-heading">Temporal evidence planes</h4>
        <p className={styles.supportingCopy}>
          T1 and T2 report governed evidence availability independently from
          the T3 channels.
        </p>
        <div className={styles.temporalList}>
          <TemporalPlane plane={demand.t1Plane} />
          <TemporalPlane plane={demand.t2Plane} />
        </div>
      </section>
    </section>
  );
}
