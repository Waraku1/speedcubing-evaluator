"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";

import { useSavedAnalysisAuth } from "./SavedAnalysisAuthContext";
import styles from "./saved.module.css";

class SaveAnalysisError extends Error {}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new SaveAnalysisError("The save response was incompatible.");
  }
}

export function SaveAnalysisControls({ facelets }: Readonly<{ facelets: string }>) {
  const authenticated = useSavedAnalysisAuth();
  const [label, setLabel] = useState("");
  const [includeCfop, setIncludeCfop] = useState(false);
  const [status, setStatus] = useState<"IDLE" | "SAVING" | "SAVED" | "ERROR">("IDLE");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const characterCount = Array.from(label.trim()).length;

  useEffect(() => {
    setStatus("IDLE");
    setSavedId(null);
    setError(null);
  }, [facelets]);

  if (!authenticated) {
    return (
      <section aria-labelledby="save-analysis-heading" className={styles.savePanel}>
        <h3 id="save-analysis-heading">Save this analysis</h3>
        <p>Sign in with GitHub to keep this verified result as an immutable snapshot.</p>
        <button
          className={styles.primaryButton}
          onClick={() => void signIn("github", { callbackUrl: "/" })}
          type="button"
        >
          Sign in to save analyses
        </button>
      </section>
    );
  }

  async function save(): Promise<void> {
    if (status === "SAVING" || characterCount > 120) return;
    setStatus("SAVING");
    setError(null);
    setSavedId(null);
    try {
      const normalizedLabel = label.trim();
      const response = await fetch("/api/saved-analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersion: "1.0",
          cubeState: { format: "URFDLB_FACELETS_V1", facelets },
          includeCfop,
          ...(normalizedLabel === "" ? {} : { label: normalizedLabel }),
        }),
      });
      const payload = await responseJson(response);
      if (!response.ok) {
        if (
          typeof payload === "object" && payload !== null &&
          "error" in payload && typeof payload.error === "object" && payload.error !== null &&
          "message" in payload.error && typeof payload.error.message === "string"
        ) {
          throw new SaveAnalysisError(payload.error.message);
        }
        throw new SaveAnalysisError("The analysis could not be saved.");
      }
      if (
        typeof payload !== "object" || payload === null ||
        !("savedAnalysis" in payload) ||
        typeof payload.savedAnalysis !== "object" || payload.savedAnalysis === null ||
        !("id" in payload.savedAnalysis) || typeof payload.savedAnalysis.id !== "string"
      ) {
        throw new SaveAnalysisError("The save response was incompatible.");
      }
      setSavedId(payload.savedAnalysis.id);
      setStatus("SAVED");
    } catch (reason) {
      setError(
        reason instanceof SaveAnalysisError
          ? reason.message
          : "Saved-analysis storage could not be reached."
      );
      setStatus("ERROR");
    }
  }

  return (
    <section aria-labelledby="save-analysis-heading" className={styles.savePanel}>
      <h3 id="save-analysis-heading">Save this analysis</h3>
      <p>Store a server-produced snapshot under your signed-in account.</p>
      <label className={styles.field}>
        <span>Optional label</span>
        <input
          aria-describedby="saved-label-count"
          disabled={status === "SAVING"}
          onChange={(event) => setLabel(event.target.value)}
          value={label}
        />
      </label>
      <p className={characterCount > 120 ? styles.fieldError : styles.fieldHint} id="saved-label-count">
        {characterCount} of 120 Unicode characters
      </p>
      <label className={styles.checkField}>
        <input
          checked={includeCfop}
          disabled={status === "SAVING"}
          onChange={(event) => setIncludeCfop(event.target.checked)}
          type="checkbox"
        />
        Include a server-generated CFOP snapshot
      </label>
      <div className={styles.actions}>
        <button
          className={styles.primaryButton}
          disabled={status === "SAVING" || characterCount > 120}
          onClick={() => void save()}
          type="button"
        >
          {status === "SAVING" ? "Saving…" : "Save analysis"}
        </button>
        <Link href="/saved">View saved analyses</Link>
      </div>
      <div aria-live="polite">
        {status === "SAVED" && savedId !== null ? (
          <p className={styles.successMessage}>
            Saved as an immutable snapshot. <Link href={`/saved/${savedId}`}>Open saved analysis</Link>
          </p>
        ) : null}
        {status === "ERROR" && error !== null ? (
          <p className={styles.errorMessage} role="alert">{error}</p>
        ) : null}
      </div>
    </section>
  );
}
