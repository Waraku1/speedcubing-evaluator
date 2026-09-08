import { forwardRef } from "react";

import {
  CUBE_DRAFT_FACES_V1,
  type LocalCubeValidationV1,
} from "../../lib/ui/cubeDraftV1";
import styles from "./cube.module.css";

type CubeValidationSummaryProps = Readonly<{
  validation: LocalCubeValidationV1;
  onFocusProblem(): void;
}>;

export const CubeValidationSummary = forwardRef<
  HTMLDivElement,
  CubeValidationSummaryProps
>(function CubeValidationSummary({ validation, onFocusProblem }, ref) {
  const isInvalid = validation.state === "INVALID";

  return (
    <div
      className={styles.validationSummary}
      data-state={validation.state}
      ref={ref}
      role={isInvalid ? "alert" : undefined}
      tabIndex={-1}
    >
      <div className={styles.validationHeadingRow}>
        <div>
          <p className={styles.validationLabel}>Local draft status</p>
          <p className={styles.validationState}>{validation.state}</p>
        </div>
        <span className={styles.unknownBadge}>
          {validation.unknownCount} unknown
        </span>
      </div>
      <p className={styles.validationMessage}>{validation.message}</p>
      <ul className={styles.countList} aria-label="Known sticker counts">
        {CUBE_DRAFT_FACES_V1.map((face) => (
          <li key={face}>
            <span>{face}</span>
            <strong>{validation.counts[face]}/9</strong>
          </li>
        ))}
      </ul>
      {validation.firstProblemIndex !== null ? (
        <button
          className={styles.problemButton}
          onClick={onFocusProblem}
          type="button"
        >
          Go to next sticker
        </button>
      ) : null}
      <p className={styles.serverNote}>
        Physical solvability is checked only after submission by the server.
      </p>
    </div>
  );
});
