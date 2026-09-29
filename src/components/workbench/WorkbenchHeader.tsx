import { AccountControl } from "../auth/AccountControl";
import { getAuthUserV1 } from "../../lib/auth/getAuthUserV1";
import styles from "./workbench.module.css";

export async function WorkbenchHeader() {
  const authUser = await getAuthUserV1();

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <div>
          <p className={styles.eyebrow}>Manual evaluator workbench</p>
          <h1 className={styles.pageTitle}>HCA Speedcubing Evaluator</h1>
        </div>
        <div className={styles.headerAside}>
          <AccountControl authUser={authUser} />
          <div className={styles.releaseNote}>
            <p>
              This release analyzes <strong>Domain Demand</strong> for a
              server-verified cube solution. Downstream scoring is not part of
              this release.
            </p>
            <p>Manual entry is primary; an optional reviewed camera draft is available.</p>
          </div>
        </div>
      </div>
    </header>
  );
}
