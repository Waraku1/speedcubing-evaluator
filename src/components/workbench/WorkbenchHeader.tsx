import Link from "next/link";

import { AccountControl } from "../auth/AccountControl";
import type { AuthUserV1 } from "../../lib/auth/authV1";
import styles from "./workbench.module.css";

export function WorkbenchHeader({
  authUser,
}: Readonly<{ authUser: AuthUserV1 | null }>) {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <div>
          <p className={styles.eyebrow}>Manual evaluator workbench</p>
          <h1
            aria-label="Algorithm Evaluator for Speedcubing"
            className={styles.pageTitle}
          >
            <span aria-hidden="true" data-product-name="full">
              Algorithm Evaluator for Speedcubing (AES)
            </span>
            <span
              aria-hidden="true"
              className={styles.compactProductName}
              data-product-name="compact"
            >
              AES
            </span>
          </h1>
        </div>
        <div className={styles.headerAside}>
          <div className={styles.accountRow}>
            {authUser === null ? null : (
              <Link className={styles.savedLink} href="/saved">
                Saved analyses
              </Link>
            )}
            <AccountControl authUser={authUser} />
          </div>
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
