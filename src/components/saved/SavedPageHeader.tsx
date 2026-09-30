import Link from "next/link";

import type { AuthUserV1 } from "../../lib/auth/authV1";
import { AccountControl } from "../auth/AccountControl";
import styles from "./saved.module.css";

export function SavedPageHeader({
  authUser,
  callbackUrl = "/saved",
}: Readonly<{ authUser: AuthUserV1 | null; callbackUrl?: string }>) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeaderInner}>
        <div>
          <p className={styles.eyebrow}>Algorithm Evaluator for Speedcubing</p>
          <h1>Saved analyses</h1>
        </div>
        <div className={styles.headerActions}>
          <Link href="/">Current live evaluation</Link>
          <AccountControl authUser={authUser} callbackUrl={callbackUrl} />
        </div>
      </div>
    </header>
  );
}
