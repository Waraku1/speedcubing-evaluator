"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useId, useState } from "react";

import type { MoveV1 } from "../../types/solver-v1";
import {
  createProcedureLogV1,
  ProcedureLogClientErrorV1,
} from "../../lib/ui/procedureLogClientV1";
import { useSavedAnalysisAuth } from "../saved/SavedAnalysisAuthContext";
import styles from "./procedures.module.css";

type SaveProcedureControlsProps = Readonly<{
  facelets: string;
  moves: readonly MoveV1[];
  suggestedLabel?: string;
}>;

export function SaveProcedureControls({
  facelets,
  moves,
  suggestedLabel = "",
}: SaveProcedureControlsProps) {
  const authenticated = useSavedAnalysisAuth();
  const labelId = useId();
  const [label, setLabel] = useState(suggestedLabel);
  const [status, setStatus] = useState<
    "IDLE" | "SAVING" | "SUCCESS" | "ERROR"
  >("IDLE");
  const [saved, setSaved] = useState<Readonly<{
    id: string;
    moveCount: number;
    htm: number;
    qtm: number;
  }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const characterCount = Array.from(label.trim()).length;

  if (!authenticated) {
    return (
      <div className={styles.saveControl} data-testid="save-procedure-control">
        <p className={styles.saveTitle}>Save procedure</p>
        <p className={styles.saveCopy}>
          Sign in with GitHub to store this complete verified move sequence.
        </p>
        <div className={styles.actions}>
          <button
            className={styles.secondaryButton}
            onClick={() => void signIn("github", { callbackUrl: "/" })}
            type="button"
          >
            Sign in to save procedure
          </button>
        </div>
      </div>
    );
  }

  async function save(): Promise<void> {
    if (status === "SAVING" || characterCount > 120) return;
    setStatus("SAVING");
    setSaved(null);
    setError(null);
    try {
      const procedure = await createProcedureLogV1({
        facelets,
        moves,
        ...(label.trim() === "" ? {} : { label }),
      });
      setSaved({
        id: procedure.id,
        moveCount: procedure.moveCount,
        htm: procedure.htm,
        qtm: procedure.qtm,
      });
      setStatus("SUCCESS");
    } catch (reason) {
      setError(
        reason instanceof ProcedureLogClientErrorV1
          ? reason.message
          : "Procedure-log storage could not be reached.",
      );
      setStatus("ERROR");
    }
  }

  return (
    <div className={styles.saveControl} data-testid="save-procedure-control">
      <p className={styles.saveTitle}>Save procedure</p>
      <p className={styles.saveCopy}>
        The server replays the complete sequence and derives its identity and metrics.
      </p>
      <label className={styles.field} htmlFor={labelId}>
        Optional label
        <input
          aria-describedby={`${labelId}-count`}
          disabled={status === "SAVING"}
          id={labelId}
          onChange={(event) => setLabel(event.target.value)}
          value={label}
        />
      </label>
      <p
        className={characterCount > 120 ? styles.fieldError : styles.fieldHint}
        id={`${labelId}-count`}
      >
        {characterCount} of 120 Unicode characters
      </p>
      <div className={styles.actions}>
        <button
          className={styles.primaryButton}
          disabled={status === "SAVING" || characterCount > 120}
          onClick={() => void save()}
          type="button"
        >
          {status === "SAVING" ? "Saving procedure…" : "Save procedure"}
        </button>
        <Link href="/logs">View saved procedures</Link>
      </div>
      <div aria-live="polite">
        {status === "SUCCESS" && saved !== null ? (
          <p className={`${styles.feedback} ${styles.successMessage}`}>
            Saved with server metrics: {saved.moveCount} moves · {saved.htm} HTM · {saved.qtm} QTM. {" "}
            <Link href={`/logs/${saved.id}`}>Open saved procedure</Link>
          </p>
        ) : null}
        {status === "ERROR" && error !== null ? (
          <p className={`${styles.feedback} ${styles.errorMessage}`} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
