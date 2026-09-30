import Link from "next/link";

import { AccountControl } from "../auth/AccountControl";
import type { AuthUserV1 } from "../../lib/auth/authV1";
import styles from "./workbench.module.css";

export function WorkbenchHeader({
  authUser,
  callbackUrl = "/",
}: Readonly<{ authUser: AuthUserV1 | null; callbackUrl?: string }>) {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <div className={styles.brandBlock}>
          <h1 aria-label="Algorithm Evaluator for Speedcubing" className={styles.pageTitle}>
            <Link aria-label="AES home" href="/">
              <span aria-hidden="true" data-product-name="full">AES</span>
              <span
                aria-hidden="true"
                className={styles.compactProductName}
                data-product-name="compact"
              >
                AES
              </span>
            </Link>
          </h1>
          <span className={styles.productDescriptor}>Algorithm Evaluator for Speedcubing</span>
        </div>
        <nav aria-label="Primary" className={styles.primaryNav}>
          <Link href="/">Evaluate</Link>
          <Link href="/detect" prefetch={false}>Scanner</Link>
          <Link href="/saved">Saved</Link>
          <Link href="/logs">Procedures</Link>
        </nav>
        <div className={styles.accountRow}>
          <span className={styles.accountLabel}>Account</span>
          <AccountControl authUser={authUser} callbackUrl={callbackUrl} />
        </div>
      </div>
    </header>
  );
}
