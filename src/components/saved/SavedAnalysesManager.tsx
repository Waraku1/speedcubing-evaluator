"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { SavedAnalysisListItemV1 } from "../../types/saved-analysis-v1";
import {
  parseSavedAnalysisListResponseV1,
  savedAnalysisJsonV1,
  SavedAnalysisClientErrorV1,
} from "../../lib/ui/savedAnalysisClientV1";
import styles from "./saved.module.css";

function errorMessage(reason: unknown): string {
  return reason instanceof SavedAnalysisClientErrorV1
    ? reason.message
    : "Saved-analysis storage could not be reached.";
}

export function SavedAnalysesManager() {
  const [items, setItems] = useState<readonly SavedAnalysisListItemV1[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [status, setStatus] = useState<"LOADING" | "READY" | "ERROR">("LOADING");
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const requestEpoch = useRef(0);

  async function load(cursor?: string): Promise<void> {
    const epoch = requestEpoch.current + 1;
    requestEpoch.current = epoch;
    setStatus("LOADING");
    setError(null);
    try {
      const query = new URLSearchParams({ limit: "20" });
      if (cursor !== undefined) query.set("cursor", cursor);
      const response = await fetch(`/api/saved-analyses?${query.toString()}`, {
        cache: "no-store",
      });
      const page = parseSavedAnalysisListResponseV1(
        await savedAnalysisJsonV1(response),
        response.ok
      );
      if (requestEpoch.current !== epoch) return;
      setItems((current) => cursor === undefined ? page.items : [...current, ...page.items]);
      setNextCursor(page.nextCursor);
      setStatus("READY");
    } catch (reason) {
      if (requestEpoch.current !== epoch) return;
      setError(errorMessage(reason));
      setStatus("ERROR");
    }
  }

  useEffect(() => {
    void load();
    return () => {
      requestEpoch.current += 1;
    };
  }, []);

  async function remove(item: SavedAnalysisListItemV1): Promise<void> {
    if (!window.confirm(`Delete ${item.label ?? "this saved analysis"}?`)) return;
    setDeletingId(item.id);
    setError(null);
    try {
      const response = await fetch(`/api/saved-analyses/${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });
      const payload = await savedAnalysisJsonV1(response);
      if (
        !response.ok ||
        typeof payload !== "object" || payload === null ||
        !("deleted" in payload) || payload.deleted !== true
      ) {
        throw new SavedAnalysisClientErrorV1(
          "DELETE_FAILED",
          "The saved analysis could not be deleted.",
          true
        );
      }
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section aria-labelledby="saved-list-heading" className={styles.listPanel}>
      <div className={styles.listHeading}>
        <div>
          <p className={styles.eyebrow}>Private account storage</p>
          <h2 id="saved-list-heading">Your saved snapshots</h2>
        </div>
        <Link className={styles.primaryLink} href="/">Run a new evaluation</Link>
      </div>

      {status === "LOADING" && items.length === 0 ? (
        <p aria-live="polite">Loading saved analyses…</p>
      ) : null}
      {status === "ERROR" && items.length === 0 ? (
        <div className={styles.errorMessage} role="alert">
          <p>{error}</p>
          <button onClick={() => void load()} type="button">Try again</button>
        </div>
      ) : null}
      {status === "READY" && items.length === 0 ? (
        <div className={styles.emptyState}>
          <h3>No saved analyses yet</h3>
          <p>Run an evaluation, then save its server-produced snapshot.</p>
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul className={styles.savedList}>
          {items.map((item) => (
            <li key={item.id}>
              <div>
                <h3>{item.label ?? "Untitled analysis"}</h3>
                <p>
                  Saved {new Date(item.createdAt).toLocaleString()} · {item.hasCfop ? "CFOP included" : "CFOP not included"}
                </p>
                <p className="mono">{item.cubeState.stateId}</p>
              </div>
              <div className={styles.itemActions}>
                <Link href={`/saved/${item.id}`}>Open</Link>
                <button
                  disabled={deletingId !== null}
                  onClick={() => void remove(item)}
                  type="button"
                >
                  {deletingId === item.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {error !== null && items.length > 0 ? (
        <p className={styles.errorMessage} role="alert">{error}</p>
      ) : null}
      {nextCursor === undefined ? null : (
        <button
          className={styles.loadMore}
          disabled={status === "LOADING"}
          onClick={() => void load(nextCursor)}
          type="button"
        >
          {status === "LOADING" ? "Loading…" : "Load more"}
        </button>
      )}
    </section>
  );
}
