import styles from "./scanner.module.css";

type ScannerLauncherProps = Readonly<{
  disabled: boolean;
  onStart(): void;
}>;

export function ScannerLauncher({ disabled, onStart }: ScannerLauncherProps) {
  return (
    <section aria-labelledby="scanner-start-heading" className={styles.launcher}>
      <p className={styles.stepLabel}>Optional acquisition</p>
      <h2 id="scanner-start-heading">Use this device&apos;s camera</h2>
      <p>
        Nothing is captured or loaded until you choose Start camera. Frames stay
        on this device and are used only to suggest a cube draft.
      </p>
      <button
        className={styles.primaryButton}
        disabled={disabled}
        onClick={onStart}
        type="button"
      >
        Start camera
      </button>
    </section>
  );
}
