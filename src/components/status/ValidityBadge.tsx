import type { UiDemandValidityStatusV1 } from "../../lib/ui/evaluateUiTypesV1";

import styles from "./validityBadge.module.css";

export const VALIDITY_PRESENTATION_V1: Readonly<
  Record<UiDemandValidityStatusV1, Readonly<{ label: string; cue: string }>>
> = Object.freeze({
  VALID: { label: "Observed", cue: "●" },
  MISSING: { label: "Missing evidence", cue: "—" },
  INVALID: { label: "Invalid evidence", cue: "!" },
  CENSORED: { label: "Censored", cue: "×" },
  SATURATED: { label: "Saturated", cue: "▲" },
  NOT_OBSERVED: { label: "Not observed", cue: "○" },
  PATH_UNKNOWN: { label: "Path unknown", cue: "?" },
  QUALITY_UNKNOWN: { label: "Quality unknown", cue: "◇" },
});

type ValidityBadgeProps = Readonly<{
  status: UiDemandValidityStatusV1;
}>;

export function ValidityBadge({ status }: ValidityBadgeProps) {
  const presentation = VALIDITY_PRESENTATION_V1[status];

  return (
    <span
      aria-label={`Validity: ${presentation.label}`}
      className={styles.badge}
      data-status={status}
    >
      <span aria-hidden="true" className={styles.cue}>
        {presentation.cue}
      </span>
      {presentation.label}
    </span>
  );
}
