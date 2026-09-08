import type {
  UiContinuityPropositionV1,
  UiDemandPropositionBaseV1,
  UiEvaluateResultV1,
  UiFingerPropositionV1,
  UiGripPropositionV1,
  UiOrientationPropositionV1,
} from "../../lib/ui/evaluateUiTypesV1";
import { ValidityBadge } from "../status/ValidityBadge";

import styles from "./results.module.css";

export const TRACE_PAGE_SIZE_V1 = 50;

type TraceDetailField = Readonly<{
  label: string;
  value: string | number;
}>;

export type TraceRowV1 = Readonly<{
  key: string;
  category: string;
  label: string;
  fields: readonly TraceDetailField[];
}>;

type TraceExplorerProps = Readonly<{
  result: UiEvaluateResultV1;
  expanded: boolean;
  page: number;
  selectedRecordId: string | null;
  onExpandedChange(expanded: boolean): void;
  onPageChange(page: number): void;
  onSelectRecord(recordId: string | null): void;
}>;

type AnyProposition =
  | UiGripPropositionV1
  | UiFingerPropositionV1
  | UiOrientationPropositionV1
  | UiContinuityPropositionV1;

function optionalId(value: string | null): string {
  return value ?? "Not linked";
}

function propositionBaseFields(
  proposition: UiDemandPropositionBaseV1
): TraceDetailField[] {
  return [
    { label: "Proposition ID", value: proposition.propositionId },
    { label: "Transition ID", value: proposition.transitionId },
    { label: "Event ID", value: proposition.eventId },
    { label: "Observation ID", value: proposition.observationId },
    { label: "Window ID", value: proposition.windowId },
    { label: "Validity", value: proposition.status },
    { label: "Reason", value: proposition.reason },
    { label: "Source version ID", value: proposition.provenance.sourceVersionId },
    { label: "Before Human-State ref", value: optionalId(proposition.provenance.beforeHumanStateRef) },
    { label: "After Human-State ref", value: optionalId(proposition.provenance.afterHumanStateRef) },
  ];
}

function propositionFields(proposition: AnyProposition): TraceDetailField[] {
  const base = propositionBaseFields(proposition);

  switch (proposition.semanticOwner) {
    case "G-H-GR1":
      return [
        ...base,
        { label: "Semantic owner", value: proposition.semanticOwner },
        { label: "Side", value: proposition.side },
        { label: "Contact-count direction", value: proposition.contactCountDirection },
        { label: "Stabilization direction", value: proposition.stabilizationDirection },
        { label: "Contact identity validity", value: proposition.contactIdentity.status },
        { label: "Attribution validity", value: proposition.attribution.status },
        { label: "Path validity", value: proposition.path.status },
        { label: "Source fields", value: proposition.sourceFields.join(", ") },
      ];
    case "F-H-FR1":
      return [
        ...base,
        { label: "Semantic owner", value: proposition.semanticOwner },
        { label: "Finger ID", value: proposition.fingerId },
        { label: "Resource direction", value: proposition.fatigueSourceDirection },
        { label: "Availability direction", value: proposition.availabilityDirection },
        { label: "Resource semantics validity", value: proposition.resourceSemantics.status },
        { label: "Path validity", value: proposition.path.status },
        { label: "Source fields", value: proposition.sourceFields.join(", ") },
      ];
    case "O-H-OR1":
      return [
        ...base,
        { label: "Semantic owner", value: proposition.semanticOwner },
        { label: "X direction", value: proposition.xDirection },
        { label: "Y direction", value: proposition.yDirection },
        { label: "Z direction", value: proposition.zDirection },
        { label: "Frame validity", value: proposition.frame.status },
        { label: "Transform validity", value: proposition.transform.status },
        { label: "Equivalence validity", value: proposition.equivalence.status },
        { label: "Path validity", value: proposition.path.status },
        { label: "Source fields", value: proposition.sourceFields.join(", ") },
      ];
    case "C-H-CR1":
      return [
        ...base,
        { label: "Semantic owner", value: proposition.semanticOwner },
        { label: "Continuity direction", value: proposition.continuityDirection },
        { label: "Recovery classification validity", value: proposition.recoveryClassification.status },
        { label: "Path validity", value: proposition.path.status },
        { label: "Source fields", value: proposition.sourceFields.join(", ") },
      ];
  }
}

export function buildTraceRowsV1(result: UiEvaluateResultV1): TraceRowV1[] {
  const rows: TraceRowV1[] = [];
  const { trace, demand } = result;
  const channels = demand.executionEpisode.t3Consequences;

  for (const boundary of trace.cubeStateBoundaries) {
    rows.push({
      key: `cube:${boundary.boundaryId}`,
      category: "Cube-state boundary",
      label: `Boundary ${boundary.ordinal}`,
      fields: [
        { label: "Boundary ID", value: boundary.boundaryId },
        { label: "Ordinal", value: boundary.ordinal },
        { label: "State ID", value: boundary.stateId },
        { label: "Format", value: boundary.format },
      ],
    });
  }

  for (const transition of trace.solutionTransitions) {
    rows.push({
      key: `solution:${transition.transitionId}`,
      category: "Verified solution transition",
      label: `Move ${transition.ordinal + 1}: ${transition.move}`,
      fields: [
        { label: "Transition ID", value: transition.transitionId },
        { label: "Ordinal", value: transition.ordinal },
        { label: "Before cube-state ID", value: transition.beforeCubeStateId },
        { label: "After cube-state ID", value: transition.afterCubeStateId },
        { label: "Move event ID", value: transition.moveEventId },
        { label: "Move", value: transition.move },
      ],
    });
  }

  for (const boundary of trace.humanStateObservationBoundaries) {
    rows.push({
      key: `human:${boundary.boundaryId}`,
      category: "Human-State observation boundary",
      label: `Human-State boundary ${boundary.ordinal}`,
      fields: [
        { label: "Boundary ID", value: boundary.boundaryId },
        { label: "Ordinal", value: boundary.ordinal },
        { label: "Validity", value: boundary.status },
        { label: "Reason", value: boundary.reason },
        { label: "Source version ID", value: boundary.sourceVersionId },
      ],
    });
  }

  for (const plane of [demand.t1Plane, demand.t2Plane]) {
    rows.push({
      key: `plane:${plane.planeId}`,
      category: "Domain Demand provenance",
      label: `${plane.plane} evidence plane`,
      fields: [
        { label: "Plane ID", value: plane.planeId },
        { label: "Plane", value: plane.plane },
        { label: "Validity", value: plane.status },
        { label: "Reason", value: plane.reason },
        { label: "Source version ID", value: plane.provenance.sourceVersionId },
      ],
    });
  }

  for (const [channelName, channel] of [
    ["Grip", channels.grip],
    ["Finger", channels.finger],
    ["Orientation", channels.orientation],
    ["Continuity", channels.continuity],
  ] as const) {
    if (channel.statusOnlyRecord !== null) {
      const record = channel.statusOnlyRecord;
      rows.push({
        key: `status:${record.statusRecordId}`,
        category: "Domain Demand provenance",
        label: `${channelName} status record`,
        fields: [
          { label: "Status record ID", value: record.statusRecordId },
          { label: "Scope", value: record.scope },
          { label: "Semantic owner", value: channel.semanticOwner },
          { label: "Validity", value: record.status },
          { label: "Reason", value: record.reason },
          { label: "Source version ID", value: record.provenance.sourceVersionId },
        ],
      });
    }

    for (const proposition of channel.propositionRecords) {
      rows.push({
        key: `proposition:${proposition.propositionId}`,
        category: "Domain Demand provenance",
        label: `${channelName} proposition`,
        fields: propositionFields(proposition),
      });
    }
  }

  for (const source of demand.executionEpisode.sourceVersionManifest) {
    rows.push({
      key: `source:${source.sourceVersionId}`,
      category: "Domain Demand provenance",
      label: `Source: ${source.sourceName}`,
      fields: [
        { label: "Source version ID", value: source.sourceVersionId },
        { label: "Source name", value: source.sourceName },
        { label: "Source version", value: source.sourceVersion },
        { label: "Role", value: source.role },
      ],
    });
  }

  return rows;
}

export function TraceExplorer({
  result,
  expanded,
  page,
  selectedRecordId,
  onExpandedChange,
  onPageChange,
  onSelectRecord,
}: TraceExplorerProps) {
  const rows = buildTraceRowsV1(result);
  const pageCount = Math.max(1, Math.ceil(rows.length / TRACE_PAGE_SIZE_V1));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(
    safePage * TRACE_PAGE_SIZE_V1,
    (safePage + 1) * TRACE_PAGE_SIZE_V1
  );
  const selected = pageRows.find((row) => row.key === selectedRecordId) ?? null;
  const channels = result.demand.executionEpisode.t3Consequences;
  const humanStatus = result.trace.humanStateObservationBoundaries[0]?.status;

  return (
    <section aria-labelledby="trace-heading" className={styles.section}>
      <p className={styles.sectionLabel}>Evidence separation</p>
      <h3 id="trace-heading">Trace and provenance</h3>
      <p className={styles.supportingCopy}>
        Cube-state transitions and verified solution moves do not prove human
        execution. Human-State boundaries may remain not observed.
      </p>

      <section aria-labelledby="trace-summary-heading" className={styles.traceSummary}>
        <h4 id="trace-summary-heading">Trace Level 1 · Summary</h4>
        <dl className={styles.summaryGrid}>
          <div><dt>Cube-state boundaries</dt><dd>{result.trace.cubeStateBoundaries.length}</dd></div>
          <div><dt>Verified solution transitions</dt><dd>{result.trace.solutionTransitions.length}</dd></div>
          <div><dt>Human-State boundaries</dt><dd>{result.trace.humanStateObservationBoundaries.length}</dd></div>
          <div><dt>Human-State status</dt><dd>{humanStatus === undefined ? "No boundary" : <ValidityBadge status={humanStatus} />}</dd></div>
          <div><dt>Execution ID</dt><dd className="mono">{result.trace.executionId}</dd></div>
          <div><dt>Demand artifact ID</dt><dd className="mono">{result.demand.artifactId}</dd></div>
        </dl>
        <ol aria-label="Domain Demand channel trace counts" className={styles.channelCounts}>
          {([
            ["Grip", channels.grip],
            ["Finger", channels.finger],
            ["Orientation", channels.orientation],
            ["Continuity", channels.continuity],
          ] as const).map(([label, channel]) => (
            <li key={label}>
              <strong>{label}</strong>
              <span>{channel.propositionRecords.length} proposition records</span>
              <span>{channel.statusOnlyRecord === null ? "No status-only record" : "1 status-only record"}</span>
            </li>
          ))}
        </ol>
      </section>

      <button
        aria-controls="trace-level-2"
        aria-expanded={expanded}
        className={styles.disclosureButton}
        onClick={() => onExpandedChange(!expanded)}
        type="button"
      >
        {expanded ? "Hide" : "Show"} Trace Level 2 identifiers
      </button>

      {expanded ? (
        <section aria-labelledby="trace-level-2-heading" className={styles.traceLevel} id="trace-level-2">
          <div className={styles.headingRow}>
            <h4 id="trace-level-2-heading">Trace Level 2 · Identifiers</h4>
            <span>{rows.length} records</span>
          </div>
          <ol className={styles.traceRows} start={safePage * TRACE_PAGE_SIZE_V1 + 1}>
            {pageRows.map((row) => (
              <li data-testid="trace-row" data-trace-row="true" key={row.key}>
                <span className={styles.traceCategory}>{row.category}</span>
                <strong>{row.label}</strong>
                <button
                  aria-pressed={selectedRecordId === row.key}
                  className={styles.inlineButton}
                  onClick={() => onSelectRecord(row.key)}
                  type="button"
                >
                  View technical details for {row.label}
                </button>
              </li>
            ))}
          </ol>
          <nav aria-label="Trace pages" className={styles.pagination}>
            <button
              className={styles.inlineButton}
              disabled={safePage === 0}
              onClick={() => onPageChange(safePage - 1)}
              type="button"
            >
              Previous trace page
            </button>
            <span>Page {safePage + 1} of {pageCount}</span>
            <button
              className={styles.inlineButton}
              disabled={safePage >= pageCount - 1}
              onClick={() => onPageChange(safePage + 1)}
              type="button"
            >
              Next trace page
            </button>
          </nav>
        </section>
      ) : null}

      {expanded && selected !== null ? (
        <section aria-labelledby="trace-level-3-heading" className={styles.traceLevel} data-testid="trace-level-3">
          <div className={styles.headingRow}>
            <h4 id="trace-level-3-heading">Trace Level 3 · Selected provenance</h4>
            <button className={styles.inlineButton} onClick={() => onSelectRecord(null)} type="button">
              Close selected detail
            </button>
          </div>
          <p><strong>{selected.category}:</strong> {selected.label}</p>
          <dl className={styles.technicalList}>
            {selected.fields.map((field) => (
              <div key={field.label}>
                <dt>{field.label}</dt>
                <dd className={typeof field.value === "string" && field.label.includes("ID") ? "mono" : undefined}>
                  {field.value}
                </dd>
              </div>
            ))}
            <div><dt>Request ID</dt><dd className="mono">{result.requestId}</dd></div>
            <div><dt>Build commit</dt><dd className="mono">{result.build.commit}</dd></div>
          </dl>
        </section>
      ) : null}
    </section>
  );
}
