"use client";

import { signIn, signOut } from "next-auth/react";
import { useState } from "react";

import type { AuthUserV1 } from "../../lib/auth/authV1";
import styles from "./auth.module.css";

export function AccountControl({
  authUser,
}: Readonly<{ authUser: AuthUserV1 | null }>) {
  const [pending, setPending] = useState<"SIGN_IN" | "SIGN_OUT" | null>(null);

  if (authUser === null) {
    return (
      <div className={styles.accountControl} data-auth-state="signed-out">
        <button
          className={styles.accountButton}
          disabled={pending !== null}
          onClick={() => {
            setPending("SIGN_IN");
            void signIn("github", { callbackUrl: "/" }).finally(() => setPending(null));
          }}
          type="button"
        >
          {pending === "SIGN_IN" ? "Opening GitHub…" : "Sign in to save analyses"}
        </button>
      </div>
    );
  }

  const label = authUser.displayName || authUser.email || "GitHub account";

  return (
    <div className={styles.accountControl} data-auth-state="signed-in">
      {authUser.image ? (
        // GitHub is the only V1 provider. The URL is projected by the server session callback.
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className={styles.avatar} height={36} src={authUser.image} width={36} />
      ) : null}
      <span className={styles.accountName}>{label}</span>
      <button
        className={styles.accountButton}
        disabled={pending !== null}
        onClick={() => {
          setPending("SIGN_OUT");
          void signOut({ callbackUrl: "/" }).finally(() => setPending(null));
        }}
        type="button"
      >
        {pending === "SIGN_OUT" ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
