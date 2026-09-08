import type { Metadata } from "next";

import { ScannerController } from "../../components/scanner/ScannerController";
import styles from "../../components/scanner/scanner.module.css";

export const metadata: Metadata = {
  title: "Optional cube scanner · HCA Speedcubing Evaluator",
  description: "Review a local two-pose camera draft before manual confirmation.",
};

export default function DetectPage() {
  return (
    <>
      <a className="skip-link" href="#scanner-main">
        Skip to optional cube scanner
      </a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <p className={styles.eyebrow}>Optional local acquisition</p>
          <h1>Reviewable cube camera draft</h1>
          <p>
            Two camera poses create an editable suggestion. Nothing is sent for
            solving or evaluation from this page.
          </p>
        </div>
      </header>
      <main className="app-main" id="scanner-main">
        <ScannerController />
      </main>
    </>
  );
}
