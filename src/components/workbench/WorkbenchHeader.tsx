import styles from "./workbench.module.css";

export function WorkbenchHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <div>
          <p className={styles.eyebrow}>Manual evaluator workbench</p>
          <h1 className={styles.pageTitle}>HCA Speedcubing Evaluator</h1>
        </div>
        <div className={styles.releaseNote}>
          <p>
            This release analyzes <strong>Domain Demand</strong> for a
            server-verified cube solution. Downstream scoring is not part of
            this release.
          </p>
          <p>Manual cube entry is the current acquisition path.</p>
        </div>
      </div>
    </header>
  );
}
