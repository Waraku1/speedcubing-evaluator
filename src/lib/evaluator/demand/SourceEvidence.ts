import {
  DOMAIN_DEMAND_VALIDITY_STATUSES,
  type DomainDemandProvenance,
  type DomainDemandValidityStatus,
  type GovernedStatus,
  type GovernedValue,
  type JsonScalar,
} from "./DomainDemandV1";

type GovernedValueInput = {
  rawValue: unknown;
  sourceField: string;
  provenance: DomainDemandProvenance;
  declaredStatus?: DomainDemandValidityStatus;
  declaredReason?: string;
};

export function isValidityStatus(
  value: unknown
): value is DomainDemandValidityStatus {
  return DOMAIN_DEMAND_VALIDITY_STATUSES.some(
    (status) => status === value
  );
}

function isJsonScalar(value: unknown): value is Exclude<JsonScalar, null> {
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

export function createGovernedValue({
  rawValue,
  sourceField,
  provenance,
  declaredStatus,
  declaredReason,
}: GovernedValueInput): GovernedValue {
  if (rawValue === undefined || rawValue === null) {
    const status =
      declaredStatus && declaredStatus !== "VALID"
        ? declaredStatus
        : "MISSING";

    return {
      status,
      reason:
        declaredReason ??
        `${sourceField} is absent from its governed source.`,
      provenance,
      value: null,
    };
  }

  if (!isJsonScalar(rawValue)) {
    return {
      status: "INVALID",
      reason: `${sourceField} is not a finite JSON scalar.`,
      provenance,
      value: null,
    };
  }

  const status = declaredStatus ?? "VALID";

  return {
    status,
    reason:
      declaredReason ??
      `${sourceField} is present as source evidence.`,
    provenance,
    value: rawValue,
  };
}

export function createGovernedStatus(
  status: DomainDemandValidityStatus,
  reason: string,
  provenance: DomainDemandProvenance
): GovernedStatus {
  return {
    status,
    reason,
    provenance,
  };
}

const STATUS_PRIORITY: Record<DomainDemandValidityStatus, number> = {
  VALID: 0,
  NOT_OBSERVED: 1,
  QUALITY_UNKNOWN: 2,
  PATH_UNKNOWN: 3,
  SATURATED: 4,
  CENSORED: 5,
  MISSING: 6,
  INVALID: 7,
};

export function mostSevereStatus(
  records: ReadonlyArray<GovernedStatus>
): DomainDemandValidityStatus {
  return records.reduce<DomainDemandValidityStatus>(
    (selected, record) =>
      STATUS_PRIORITY[record.status] > STATUS_PRIORITY[selected]
        ? record.status
        : selected,
    "VALID"
  );
}
