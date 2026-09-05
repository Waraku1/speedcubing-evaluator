import type { Transition } from "../transition/Transition";

import {
  type AvailabilityDirection,
  type ChannelStatusOnlyRecord,
  type ContinuityDirection,
  type ContinuityProposition,
  type DemandGovernedTransition,
  type DomainDemandProvenance,
  type DomainDemandV1,
  type DomainDemandValidityStatus,
  type EvidenceEdge,
  type ExecutionEventRecord,
  type FingerId,
  type FingerProposition,
  type FingerResourceDirection,
  type GovernedStatus,
  type GovernedValue,
  type GripProposition,
  type NumericDirection,
  type ObservationFieldRecord,
  type ObservationRecord,
  type ObservationScope,
  type OrientationProposition,
  type SourceValidityDeclaration,
  type SourceVersionRecord,
  type StabilizationDirection,
  type T3Consequences,
  type TransitionDemandEvidence,
  type TransitionReference,
  type WindowRecord,
} from "./DomainDemandV1";
import {
  createGovernedStatus,
  createGovernedValue,
  isValidityStatus,
  mostSevereStatus,
} from "./SourceEvidence";
import {
  canonicalIdentityContent,
  stableIdentity,
} from "./StableIdentity";

const HUMAN_STATE_SOURCE: SourceVersionRecord = {
  sourceVersionId: stableIdentity("source-version", {
    sourceName: "HumanState",
    sourceVersion: "1.0",
  }),
  sourceName: "HumanState",
  sourceVersion: "1.0",
  role: "HUMAN_STATE_SOURCE",
};

const TRANSITION_SOURCE: SourceVersionRecord = {
  sourceVersionId: stableIdentity("source-version", {
    sourceName: "Transition",
    sourceVersion: "1.0",
  }),
  sourceName: "Transition",
  sourceVersion: "1.0",
  role: "TRANSITION_SOURCE",
};

const DOMAIN_DERIVATION_SOURCE: SourceVersionRecord = {
  sourceVersionId: stableIdentity("source-version", {
    sourceName: "TransitionDemandExtractor",
    sourceVersion: "SPEC-DM-001/1.0",
  }),
  sourceName: "TransitionDemandExtractor",
  sourceVersion: "SPEC-DM-001/1.0",
  role: "DOMAIN_DERIVATION",
};

const FINGER_IDS: FingerId[] = [
  "L_THUMB",
  "L_INDEX",
  "L_MIDDLE",
  "R_THUMB",
  "R_INDEX",
  "R_MIDDLE",
];

const OBSERVATION_FIELDS: Record<ObservationScope, string[]> = {
  GRIP_ENDPOINTS: [
    "grip.leftContactCount",
    "grip.leftStabilizing",
    "grip.rightContactCount",
    "grip.rightStabilizing",
  ],
  FINGER_ENDPOINTS: [
    ...FINGER_IDS.map((fingerId) => `fingers.fatigue.${fingerId}`),
    ...FINGER_IDS.map((fingerId) => `fingers.available.${fingerId}`),
    "fingers.coordination",
  ],
  ORIENTATION_CONFIGURATION_ENDPOINTS: [
    "orientation.x",
    "orientation.y",
    "orientation.z",
  ],
  ORIENTATION_CERTAINTY_QUARANTINE: ["orientation.certainty"],
  CONTINUITY_ENDPOINTS: ["momentum.continuity"],
  VELOCITY_QUARANTINE: ["momentum.velocity"],
};

const OBSERVATION_ORDER: ObservationScope[] = [
  "GRIP_ENDPOINTS",
  "FINGER_ENDPOINTS",
  "ORIENTATION_CONFIGURATION_ENDPOINTS",
  "ORIENTATION_CERTAINTY_QUARANTINE",
  "CONTINUITY_ENDPOINTS",
  "VELOCITY_QUARANTINE",
];

type IdentifiedTransition = {
  transition: Transition & DemandGovernedTransition;
  transitionRef: TransitionReference;
  eventId: string;
  window: WindowRecord;
  supplementalSource: SourceVersionRecord | null;
};

function provenance(
  sourceVersionId: string,
  values: Partial<DomainDemandProvenance> = {}
): DomainDemandProvenance {
  return {
    sourceVersionId,
    transitionId: values.transitionId ?? null,
    beforeHumanStateRef: values.beforeHumanStateRef ?? null,
    afterHumanStateRef: values.afterHumanStateRef ?? null,
    eventId: values.eventId ?? null,
    observationId: values.observationId ?? null,
    windowId: values.windowId ?? null,
  };
}

function readPath(root: unknown, sourceField: string): unknown {
  let value = root;

  for (const segment of sourceField.split(".")) {
    if (
      value === null ||
      typeof value !== "object" ||
      !(segment in value)
    ) {
      return undefined;
    }

    value = (value as Record<string, unknown>)[segment];
  }

  return value;
}

function normalizedEvidence(
  evidence: TransitionDemandEvidence | undefined
): unknown {
  if (!evidence) {
    return null;
  }

  return {
    sourceName: evidence.sourceName,
    sourceVersion: evidence.sourceVersion,
    fieldValidity: [...evidence.fieldValidity].sort((left, right) =>
      canonicalIdentityContent(left).localeCompare(
        canonicalIdentityContent(right)
      )
    ),
    path: evidence.path,
    window: evidence.window,
  };
}

function supplementalSourceFor(
  evidence: TransitionDemandEvidence | undefined
): SourceVersionRecord | null {
  if (!evidence) {
    return null;
  }

  const sourceName =
    typeof evidence.sourceName === "string" && evidence.sourceName.length > 0
      ? evidence.sourceName
      : "INVALID_SUPPLEMENTAL_SOURCE";
  const sourceVersion =
    typeof evidence.sourceVersion === "string" &&
    evidence.sourceVersion.length > 0
      ? evidence.sourceVersion
      : "INVALID_VERSION";

  return {
    sourceVersionId: stableIdentity("source-version", {
      sourceName,
      sourceVersion,
    }),
    sourceName,
    sourceVersion,
    role: "SUPPLEMENTAL_EVIDENCE",
  };
}

function declarationsFor(
  evidence: TransitionDemandEvidence | undefined,
  phase: "BEFORE" | "AFTER",
  sourceField: string
): SourceValidityDeclaration[] {
  if (!evidence || !Array.isArray(evidence.fieldValidity)) {
    return [];
  }

  return evidence.fieldValidity
    .filter(
      (declaration) =>
        declaration.phase === phase &&
        declaration.sourceField === sourceField
    )
    .sort((left, right) =>
      canonicalIdentityContent(left).localeCompare(
        canonicalIdentityContent(right)
      )
    );
}

function sourceDeclaration(
  evidence: TransitionDemandEvidence | undefined,
  phase: "BEFORE" | "AFTER",
  sourceField: string
): {
  status: DomainDemandValidityStatus;
  reason: string;
} | null {
  const declarations = declarationsFor(evidence, phase, sourceField);

  if (declarations.length === 0) {
    return null;
  }

  const distinct = new Set(
    declarations.map((declaration) =>
      canonicalIdentityContent(declaration)
    )
  );

  if (distinct.size > 1) {
    return {
      status: "INVALID",
      reason:
        `${sourceField} has conflicting governed validity declarations.`,
    };
  }

  const declaration = declarations[0];

  if (!isValidityStatus(declaration.status)) {
    return {
      status: "INVALID",
      reason: `${sourceField} has an invalid validity declaration.`,
    };
  }

  return {
    status: declaration.status,
    reason:
      typeof declaration.reason === "string" && declaration.reason.length > 0
        ? declaration.reason
        : `${sourceField} has a source declaration without a reason.`,
  };
}

function direction(
  before: GovernedValue,
  after: GovernedValue
): NumericDirection {
  if (
    before.status !== "VALID" ||
    after.status !== "VALID" ||
    typeof before.value !== "number" ||
    typeof after.value !== "number"
  ) {
    return "UNKNOWN";
  }

  if (after.value > before.value) {
    return "INCREASE";
  }

  if (after.value < before.value) {
    return "DECREASE";
  }

  return "UNCHANGED";
}

function booleanDirection(
  before: GovernedValue,
  after: GovernedValue
): AvailabilityDirection {
  if (
    before.status !== "VALID" ||
    after.status !== "VALID" ||
    typeof before.value !== "boolean" ||
    typeof after.value !== "boolean"
  ) {
    return "UNKNOWN";
  }

  if (!before.value && after.value) {
    return "GAINED";
  }

  if (before.value && !after.value) {
    return "LOST";
  }

  return "UNCHANGED";
}

function fingerDirection(
  before: GovernedValue,
  after: GovernedValue
): FingerResourceDirection {
  const sourceDirection = direction(before, after);

  if (sourceDirection === "INCREASE") {
    return "DEPLETION";
  }

  if (sourceDirection === "DECREASE") {
    return "RECOVERY";
  }

  return sourceDirection;
}

function continuityDirection(
  before: GovernedValue,
  after: GovernedValue
): ContinuityDirection {
  const sourceDirection = direction(before, after);

  if (sourceDirection === "DECREASE") {
    return "LOSS";
  }

  if (sourceDirection === "INCREASE") {
    return "GAIN_OR_RECOVERY";
  }

  return sourceDirection;
}

function statusReason(
  status: DomainDemandValidityStatus,
  scope: string
): string {
  return status === "VALID"
    ? `${scope} preserves its before/after source evidence without scalar aggregation.`
    : `${scope} retains ${status} source qualification without imputation.`;
}

function identifyTransitions(
  transitions: readonly Transition[]
): {
  identified: IdentifiedTransition[];
  manifest: SourceVersionRecord[];
} {
  const occurrenceByContent = new Map<string, number>();
  const supplementalSources = new Map<string, SourceVersionRecord>();

  const identified = transitions.map((transition, ordinal) => {
    const governed = transition as Transition & DemandGovernedTransition;
    const supplementalSource = supplementalSourceFor(
      governed.domainDemandEvidence
    );

    if (supplementalSource) {
      supplementalSources.set(
        supplementalSource.sourceVersionId,
        supplementalSource
      );
    }

    const beforeHumanStateRef = stableIdentity(
      "human-state",
      transition.before
    );
    const afterHumanStateRef = stableIdentity(
      "human-state",
      transition.after
    );
    const sourceContentId = stableIdentity("transition-content", {
      before: transition.before,
      move: transition.move,
      after: transition.after,
      domainDemandEvidence: normalizedEvidence(
        governed.domainDemandEvidence
      ),
    });
    const occurrence = occurrenceByContent.get(sourceContentId) ?? 0;

    occurrenceByContent.set(sourceContentId, occurrence + 1);

    const transitionId = stableIdentity("transition", {
      sourceVersionId: TRANSITION_SOURCE.sourceVersionId,
      sourceContentId,
      occurrence,
    });
    const eventId = stableIdentity("event", {
      eventType: "TRANSITION_OCCURRENCE",
      transitionId,
    });
    const transitionRef: TransitionReference = {
      transitionId,
      ordinal,
      beforeHumanStateRef,
      afterHumanStateRef,
      sourceVersionId: TRANSITION_SOURCE.sourceVersionId,
    };
    const window = createWindow(
      governed,
      transitionRef,
      eventId,
      supplementalSource
    );

    return {
      transition: governed,
      transitionRef,
      eventId,
      window,
      supplementalSource,
    };
  });

  const manifest = [
    HUMAN_STATE_SOURCE,
    TRANSITION_SOURCE,
    DOMAIN_DERIVATION_SOURCE,
    ...[...supplementalSources.values()].sort((left, right) =>
      left.sourceVersionId.localeCompare(right.sourceVersionId)
    ),
  ];

  return { identified, manifest };
}

function createWindow(
  transition: Transition & DemandGovernedTransition,
  transitionRef: TransitionReference,
  eventId: string,
  supplementalSource: SourceVersionRecord | null
): WindowRecord {
  const evidence = transition.domainDemandEvidence;
  const windowDeclaration = evidence?.window ?? null;
  const pathDeclaration = evidence?.path ?? null;
  const declaredStatus =
    windowDeclaration?.status ?? pathDeclaration?.status ?? "PATH_UNKNOWN";
  const status = isValidityStatus(declaredStatus)
    ? declaredStatus
    : "INVALID";
  const startBoundaryId =
    windowDeclaration?.startBoundaryId ||
    transitionRef.beforeHumanStateRef;
  const endBoundaryId =
    windowDeclaration?.endBoundaryId ||
    transitionRef.afterHumanStateRef;
  const pathIdentity =
    typeof pathDeclaration?.pathIdentity === "string"
      ? pathDeclaration.pathIdentity
      : null;
  const sourceVersionId =
    windowDeclaration || pathDeclaration
      ? supplementalSource?.sourceVersionId ??
        DOMAIN_DERIVATION_SOURCE.sourceVersionId
      : TRANSITION_SOURCE.sourceVersionId;
  const reason =
    windowDeclaration?.reason ??
    pathDeclaration?.reason ??
    "Transition supplies endpoints but no within-transition path observation.";
  const windowId = stableIdentity("window", {
    transitionId: transitionRef.transitionId,
    startBoundaryId,
    endBoundaryId,
    pathIdentity,
    status,
    sourceVersionId,
  });

  return {
    windowId,
    transitionId: transitionRef.transitionId,
    eventId,
    startBoundaryId,
    endBoundaryId,
    pathIdentity,
    status,
    reason:
      typeof reason === "string" && reason.length > 0
        ? reason
        : "Window evidence has no source-specific reason.",
    provenance: provenance(sourceVersionId, {
      transitionId: transitionRef.transitionId,
      beforeHumanStateRef: transitionRef.beforeHumanStateRef,
      afterHumanStateRef: transitionRef.afterHumanStateRef,
      eventId,
      windowId,
    }),
  };
}

function createEvent(item: IdentifiedTransition): ExecutionEventRecord {
  const { transitionRef, eventId, window } = item;

  return {
    eventId,
    eventType: "TRANSITION_OCCURRENCE",
    transitionId: transitionRef.transitionId,
    ordinal: transitionRef.ordinal,
    beforeHumanStateRef: transitionRef.beforeHumanStateRef,
    afterHumanStateRef: transitionRef.afterHumanStateRef,
    status: "VALID",
    reason: "One governed Transition occurrence defines this shared event.",
    provenance: provenance(TRANSITION_SOURCE.sourceVersionId, {
      transitionId: transitionRef.transitionId,
      beforeHumanStateRef: transitionRef.beforeHumanStateRef,
      afterHumanStateRef: transitionRef.afterHumanStateRef,
      eventId,
      windowId: window.windowId,
    }),
  };
}

function createObservation(
  item: IdentifiedTransition,
  scope: ObservationScope
): ObservationRecord {
  const { transition, transitionRef, eventId, window } = item;
  const observationId = stableIdentity("observation", {
    eventId,
    scope,
  });
  const fields: ObservationFieldRecord[] = OBSERVATION_FIELDS[scope].map(
    (sourceField) => {
      const beforeDeclaration = sourceDeclaration(
        transition.domainDemandEvidence,
        "BEFORE",
        sourceField
      );
      const afterDeclaration = sourceDeclaration(
        transition.domainDemandEvidence,
        "AFTER",
        sourceField
      );
      const commonProvenance = {
        transitionId: transitionRef.transitionId,
        beforeHumanStateRef: transitionRef.beforeHumanStateRef,
        afterHumanStateRef: transitionRef.afterHumanStateRef,
        eventId,
        observationId,
        windowId: window.windowId,
      };

      return {
        sourceField,
        before: createGovernedValue({
          rawValue: readPath(transition.before, sourceField),
          sourceField: `before.${sourceField}`,
          declaredStatus: beforeDeclaration?.status,
          declaredReason: beforeDeclaration?.reason,
          provenance: provenance(
            beforeDeclaration
              ? item.supplementalSource?.sourceVersionId ??
                  DOMAIN_DERIVATION_SOURCE.sourceVersionId
              : HUMAN_STATE_SOURCE.sourceVersionId,
            commonProvenance
          ),
        }),
        after: createGovernedValue({
          rawValue: readPath(transition.after, sourceField),
          sourceField: `after.${sourceField}`,
          declaredStatus: afterDeclaration?.status,
          declaredReason: afterDeclaration?.reason,
          provenance: provenance(
            afterDeclaration
              ? item.supplementalSource?.sourceVersionId ??
                  DOMAIN_DERIVATION_SOURCE.sourceVersionId
              : HUMAN_STATE_SOURCE.sourceVersionId,
            commonProvenance
          ),
        }),
      };
    }
  );
  const status = mostSevereStatus(
    fields.flatMap((record) => [record.before, record.after])
  );
  const quarantined =
    scope === "ORIENTATION_CERTAINTY_QUARANTINE" ||
    scope === "VELOCITY_QUARANTINE";

  return {
    observationId,
    eventId,
    transitionId: transitionRef.transitionId,
    scope,
    semanticUse: quarantined ? "QUARANTINED_CONTEXT" : "T3_EVIDENCE",
    fields,
    status,
    reason: quarantined
      ? `${scope} is retained as source context and cannot realize a T3 proposition.`
      : statusReason(status, scope),
    provenance: provenance(HUMAN_STATE_SOURCE.sourceVersionId, {
      transitionId: transitionRef.transitionId,
      beforeHumanStateRef: transitionRef.beforeHumanStateRef,
      afterHumanStateRef: transitionRef.afterHumanStateRef,
      eventId,
      observationId,
      windowId: window.windowId,
    }),
  };
}

function field(
  observation: ObservationRecord,
  sourceField: string
): ObservationFieldRecord {
  const found = observation.fields.find(
    (candidate) => candidate.sourceField === sourceField
  );

  if (!found) {
    throw new Error(`Missing governed observation field: ${sourceField}`);
  }

  return found;
}

function propositionStatus(
  fields: readonly ObservationFieldRecord[]
): DomainDemandValidityStatus {
  return mostSevereStatus(
    fields.flatMap((record) => [record.before, record.after])
  );
}

function propositionProvenance(
  item: IdentifiedTransition,
  observationId: string
): DomainDemandProvenance {
  return provenance(DOMAIN_DERIVATION_SOURCE.sourceVersionId, {
    transitionId: item.transitionRef.transitionId,
    beforeHumanStateRef: item.transitionRef.beforeHumanStateRef,
    afterHumanStateRef: item.transitionRef.afterHumanStateRef,
    eventId: item.eventId,
    observationId,
    windowId: item.window.windowId,
  });
}

function pathStatus(item: IdentifiedTransition): GovernedStatus {
  return createGovernedStatus(
    item.window.status,
    item.window.reason,
    item.window.provenance
  );
}

function createGripPropositions(
  item: IdentifiedTransition,
  observation: ObservationRecord
): GripProposition[] {
  return (["LEFT", "RIGHT"] as const).map((side) => {
    const prefix = side === "LEFT" ? "left" : "right";
    const contactFieldName = `grip.${prefix}ContactCount`;
    const stabilizingFieldName = `grip.${prefix}Stabilizing`;
    const contact = field(observation, contactFieldName);
    const stabilizing = field(observation, stabilizingFieldName);
    const status = propositionStatus([contact, stabilizing]);
    const propositionId = stableIdentity("proposition", {
      semanticOwner: "G-H-GR1",
      transitionId: item.transitionRef.transitionId,
      side,
    });
    const recordProvenance = propositionProvenance(
      item,
      observation.observationId
    );

    return {
      propositionId,
      semanticOwner: "G-H-GR1",
      transitionId: item.transitionRef.transitionId,
      eventId: item.eventId,
      observationId: observation.observationId,
      windowId: item.window.windowId,
      side,
      contactCountDirection: direction(contact.before, contact.after),
      stabilizationDirection: booleanDirection(
        stabilizing.before,
        stabilizing.after
      ) as StabilizationDirection,
      sourceFields: [contactFieldName, stabilizingFieldName],
      contactIdentity: createGovernedStatus(
        "QUALITY_UNKNOWN",
        `${side} individual contact identities are unavailable in HumanState.`,
        recordProvenance
      ),
      attribution: createGovernedStatus(
        "QUALITY_UNKNOWN",
        `${side} causal attribution is unavailable in HumanState.`,
        recordProvenance
      ),
      path: pathStatus(item),
      status,
      reason: statusReason(status, `${side} grip displacement`),
      provenance: recordProvenance,
    };
  });
}

function createFingerPropositions(
  item: IdentifiedTransition,
  observation: ObservationRecord
): FingerProposition[] {
  return FINGER_IDS.map((fingerId) => {
    const fatigueFieldName = `fingers.fatigue.${fingerId}`;
    const availabilityFieldName = `fingers.available.${fingerId}`;
    const fatigue = field(observation, fatigueFieldName);
    const availability = field(observation, availabilityFieldName);
    const status = propositionStatus([fatigue, availability]);
    const propositionId = stableIdentity("proposition", {
      semanticOwner: "F-H-FR1",
      transitionId: item.transitionRef.transitionId,
      fingerId,
    });
    const recordProvenance = propositionProvenance(
      item,
      observation.observationId
    );

    return {
      propositionId,
      semanticOwner: "F-H-FR1",
      transitionId: item.transitionRef.transitionId,
      eventId: item.eventId,
      observationId: observation.observationId,
      windowId: item.window.windowId,
      fingerId,
      fatigueSourceDirection: fingerDirection(
        fatigue.before,
        fatigue.after
      ),
      availabilityDirection: booleanDirection(
        availability.before,
        availability.after
      ),
      sourceFields: [fatigueFieldName, availabilityFieldName],
      resourceSemantics: createGovernedStatus(
        "QUALITY_UNKNOWN",
        "HumanState's fatigue label is preserved as source evidence, not validated as physiological truth.",
        recordProvenance
      ),
      path: pathStatus(item),
      status,
      reason: statusReason(status, `${fingerId} resource displacement`),
      provenance: recordProvenance,
    };
  });
}

function createOrientationProposition(
  item: IdentifiedTransition,
  observation: ObservationRecord
): OrientationProposition {
  const x = field(observation, "orientation.x");
  const y = field(observation, "orientation.y");
  const z = field(observation, "orientation.z");
  const status = propositionStatus([x, y, z]);
  const propositionId = stableIdentity("proposition", {
    semanticOwner: "O-H-OR1",
    transitionId: item.transitionRef.transitionId,
  });
  const recordProvenance = propositionProvenance(
    item,
    observation.observationId
  );

  return {
    propositionId,
    semanticOwner: "O-H-OR1",
    transitionId: item.transitionRef.transitionId,
    eventId: item.eventId,
    observationId: observation.observationId,
    windowId: item.window.windowId,
    xDirection: direction(x.before, x.after),
    yDirection: direction(y.before, y.after),
    zDirection: direction(z.before, z.after),
    sourceFields: ["orientation.x", "orientation.y", "orientation.z"],
    frame: createGovernedStatus(
      "QUALITY_UNKNOWN",
      "HumanState does not identify the orientation frame.",
      recordProvenance
    ),
    transform: createGovernedStatus(
      "QUALITY_UNKNOWN",
      "HumanState supplies no governed frame transform.",
      recordProvenance
    ),
    equivalence: createGovernedStatus(
      "QUALITY_UNKNOWN",
      "No orientation-configuration equivalence semantics are supplied.",
      recordProvenance
    ),
    path: pathStatus(item),
    status,
    reason: statusReason(status, "Orientation configuration displacement"),
    provenance: recordProvenance,
  };
}

function createContinuityProposition(
  item: IdentifiedTransition,
  observation: ObservationRecord
): ContinuityProposition {
  const continuity = field(observation, "momentum.continuity");
  const status = propositionStatus([continuity]);
  const propositionId = stableIdentity("proposition", {
    semanticOwner: "C-H-CR1",
    transitionId: item.transitionRef.transitionId,
  });
  const recordProvenance = propositionProvenance(
    item,
    observation.observationId
  );

  return {
    propositionId,
    semanticOwner: "C-H-CR1",
    transitionId: item.transitionRef.transitionId,
    eventId: item.eventId,
    observationId: observation.observationId,
    windowId: item.window.windowId,
    continuityDirection: continuityDirection(
      continuity.before,
      continuity.after
    ),
    sourceFields: ["momentum.continuity"],
    recoveryClassification: createGovernedStatus(
      "QUALITY_UNKNOWN",
      "An endpoint gain is retained separately but cannot be classified as recovery without governed history semantics.",
      recordProvenance
    ),
    path: pathStatus(item),
    status,
    reason: statusReason(status, "Continuity-state displacement"),
    provenance: recordProvenance,
  };
}

function createEvidenceEdge(
  item: IdentifiedTransition,
  proposition:
    | GripProposition
    | FingerProposition
    | OrientationProposition
    | ContinuityProposition
): EvidenceEdge {
  const evidenceEdgeId = stableIdentity("evidence-edge", {
    role: "REALIZES",
    propositionId: proposition.propositionId,
    observationId: proposition.observationId,
    eventId: proposition.eventId,
  });

  return {
    evidenceEdgeId,
    role: "REALIZES",
    eventId: proposition.eventId,
    observationId: proposition.observationId,
    propositionId: proposition.propositionId,
    transitionId: proposition.transitionId,
    beforeHumanStateRef: item.transitionRef.beforeHumanStateRef,
    afterHumanStateRef: item.transitionRef.afterHumanStateRef,
    status: proposition.status,
    reason:
      "This edge alone asserts membership of source evidence in the owned T3 proposition.",
    provenance: proposition.provenance,
  };
}

function statusOnlyRecord(
  scope: ChannelStatusOnlyRecord["scope"],
  semanticOwner: string,
  executionId: string
): ChannelStatusOnlyRecord {
  const statusRecordId = stableIdentity("status-only", {
    scope,
    semanticOwner,
    executionId,
  });

  return {
    statusRecordId,
    scope,
    status: "NOT_OBSERVED",
    reason: `No Transition occurrence was supplied for the ${scope} scope.`,
    provenance: provenance(DOMAIN_DERIVATION_SOURCE.sourceVersionId),
  };
}

export class TransitionDemandExtractor {
  extract(transitions: readonly Transition[]): DomainDemandV1 {
    const { identified, manifest } = identifyTransitions(transitions);
    const transitionRefs = identified.map((item) => item.transitionRef);
    const executionId = stableIdentity("execution", {
      architecture: "P-C",
      schemaId: "SPEC-DM-001",
      schemaVersion: "1.0",
      orderedTransitionIds: transitionRefs.map(
        (reference) => reference.transitionId
      ),
      sourceVersionIds: manifest.map((source) => source.sourceVersionId),
    });
    const eventRecords = identified.map(createEvent);
    const windowRecords = identified.map((item) => item.window);
    const observationRecords: ObservationRecord[] = [];
    const evidenceEdges: EvidenceEdge[] = [];
    const gripPropositions: GripProposition[] = [];
    const fingerPropositions: FingerProposition[] = [];
    const orientationPropositions: OrientationProposition[] = [];
    const continuityPropositions: ContinuityProposition[] = [];

    for (const item of identified) {
      const observations = new Map<ObservationScope, ObservationRecord>();

      for (const scope of OBSERVATION_ORDER) {
        const observation = createObservation(item, scope);

        observations.set(scope, observation);
        observationRecords.push(observation);
      }

      const grip = createGripPropositions(
        item,
        observations.get("GRIP_ENDPOINTS") as ObservationRecord
      );
      const finger = createFingerPropositions(
        item,
        observations.get("FINGER_ENDPOINTS") as ObservationRecord
      );
      const orientation = createOrientationProposition(
        item,
        observations.get(
          "ORIENTATION_CONFIGURATION_ENDPOINTS"
        ) as ObservationRecord
      );
      const continuity = createContinuityProposition(
        item,
        observations.get("CONTINUITY_ENDPOINTS") as ObservationRecord
      );

      gripPropositions.push(...grip);
      fingerPropositions.push(...finger);
      orientationPropositions.push(orientation);
      continuityPropositions.push(continuity);

      for (const proposition of [
        ...grip,
        ...finger,
        orientation,
        continuity,
      ]) {
        evidenceEdges.push(createEvidenceEdge(item, proposition));
      }
    }

    const noTransitions = identified.length === 0;
    const t3Consequences: T3Consequences = {
      grip: {
        semanticOwner: "G-H-GR1",
        propositionRecords: gripPropositions,
        statusOnlyRecord: noTransitions
          ? statusOnlyRecord("grip", "G-H-GR1", executionId)
          : null,
      },
      finger: {
        semanticOwner: "F-H-FR1",
        propositionRecords: fingerPropositions,
        statusOnlyRecord: noTransitions
          ? statusOnlyRecord("finger", "F-H-FR1", executionId)
          : null,
      },
      orientation: {
        semanticOwner: "O-H-OR1",
        propositionRecords: orientationPropositions,
        statusOnlyRecord: noTransitions
          ? statusOnlyRecord("orientation", "O-H-OR1", executionId)
          : null,
      },
      continuity: {
        semanticOwner: "C-H-CR1",
        propositionRecords: continuityPropositions,
        statusOnlyRecord: noTransitions
          ? statusOnlyRecord("continuity", "C-H-CR1", executionId)
          : null,
      },
    };
    const planeProvenance = provenance(
      DOMAIN_DERIVATION_SOURCE.sourceVersionId
    );
    const t1Plane = {
      planeId: stableIdentity("plane", { executionId, plane: "T1" }),
      plane: "T1" as const,
      status: "NOT_OBSERVED" as const,
      reason:
        "No independently sourced prospective-requirement evidence was supplied.",
      provenance: planeProvenance,
    };
    const t2Plane = {
      planeId: stableIdentity("plane", { executionId, plane: "T2" }),
      plane: "T2" as const,
      status: "NOT_OBSERVED" as const,
      reason:
        "No independently sourced transactional-burden evidence was supplied.",
      provenance: planeProvenance,
    };
    const artifactId = stableIdentity("domain-demand", {
      executionId,
      schemaId: "SPEC-DM-001",
      schemaVersion: "1.0",
      architecture: "P-C",
      claimClass: "T3_BOUNDED_DOMAIN_DEMAND",
    });

    return {
      artifactId,
      schemaId: "SPEC-DM-001",
      schemaVersion: "1.0",
      architecture: "P-C",
      claimClass: "T3_BOUNDED_DOMAIN_DEMAND",
      executionEpisode: {
        executionId,
        transitionRefs,
        eventRecords,
        observationRecords,
        windowRecords,
        evidenceEdges,
        t3Consequences,
        sourceVersionManifest: manifest,
      },
      t1Plane,
      t2Plane,
    };
  }
}
