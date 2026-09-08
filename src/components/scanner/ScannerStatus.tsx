import type { ScannerStateV1 } from "./ScannerController";
import styles from "./scanner.module.css";

type ScannerStatusProps = Readonly<{
  state: ScannerStateV1;
  message: string;
  acceptedSamples: number;
  requiredSamples: number;
}>;

export function ScannerStatus({
  state,
  message,
  acceptedSamples,
  requiredSamples,
}: ScannerStatusProps) {
  const scanning =
    state === "SCANNING_POSE_1" || state === "SCANNING_POSE_2";

  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className={styles.status}
      data-state={state}
      role={state === "ERROR" ? "alert" : "status"}
    >
      <strong>{state.replaceAll("_", " ")}</strong>
      <p>{message}</p>
      {scanning ? (
        <p className={styles.sampleProgress}>
          Stable samples: {acceptedSamples} of {requiredSamples}
        </p>
      ) : null}
    </div>
  );
}
