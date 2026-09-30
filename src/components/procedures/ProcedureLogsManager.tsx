"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { ProcedureLogListItemV1 } from "../../types/procedure-log-v1";
import {
  deleteProcedureLogV1,
  listProcedureLogsV1,
  ProcedureLogClientErrorV1,
} from "../../lib/ui/procedureLogClientV1";
import styles from "./procedures.module.css";

function errorMessage(reason: unknown): string {
  return reason instanceof ProcedureLogClientErrorV1
    ? reason.message
    : "Procedure-log storage could not be reached.";
}

export function ProcedureLogListContent({
  items,
  deletingId,
  onDelete,
}: Readonly<{
  items: readonly ProcedureLogListItemV1[];
  deletingId: string | null;
  onDelete(item: ProcedureLogListItemV1): void;
}>) {
  if (items.length === 0) {
    return (
      <div className={styles.emptyState} data-testid="procedure-logs-empty">
        <h3>No saved procedures yet</h3>
        <p>Save a complete verified solution from an evaluation result.</p>
      </div>
    );
  }

  return (
    <ul className={styles.procedureList} data-testid="procedure-logs-list">
      {items.map((item) => (
        <li key={item.id}>
          <div>
            <h3>{item.label ?? "Untitled procedure"}</h3>
            <p className={styles.itemMeta}>
              Saved {new Date(item.createdAt).toLocaleString()} · {item.htm} HTM · {item.qtm} QTM · {item.moveCount} moves
            </p>
          </div>
          <div className={styles.itemActions}>
            <Link href={`/logs/${item.id}`}>Open</Link>
            <button
              disabled={deletingId !== null}
              onClick={() => onDelete(item)}
              type="button"
            >
              {deletingId === item.id ? "Deleting…" : "Delete"}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ProcedureLogsManager() {
  const [items, setItems] = useState<readonly ProcedureLogListItemV1[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [status, setStatus] = useState<"LOADING" | "READY" | "ERROR">(
    "LOADING",
  );
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const requestEpoch = useRef(0);

  async function load(cursor?: string): Promise<void> {
    const epoch = requestEpoch.current + 1;
    requestEpoch.current = epoch;
    setStatus("LOADING");
    setError(null);
    try {
      const page = await listProcedureLogsV1(cursor);
      if (requestEpoch.current !== epoch) return;
      setItems((current) =>
        cursor === undefined ? page.items : [...current, ...page.items],
      );
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

  async function remove(item: ProcedureLogListItemV1): Promise<void> {
    if (!window.confirm(`Delete ${item.label ?? "this saved procedure"}?`)) {
      return;
    }
    setDeletingId(item.id);
    setError(null);
    try {
      await deleteProcedureLogV1(item.id);
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section aria-labelledby="procedure-list-heading" className={styles.listPanel}>
      <div className={styles.listHeading}>
        <div>
          <p className={styles.eyebrow}>Private verified move procedures</p>
          <h2 id="procedure-list-heading">Saved procedures</h2>
        </div>
        <Link className={styles.primaryLink} href="/">
          Evaluate a cube
        </Link>
      </div>

      {status === "LOADING" && items.length === 0 ? (
        <p aria-live="polite">Loading saved procedures…</p>
      ) : null}
      {status === "ERROR" && items.length === 0 ? (
        <div className={styles.errorMessage} role="alert">
          <p>{error}</p>
          <button onClick={() => void load()} type="button">Try again</button>
        </div>
      ) : null}
      {status === "READY" || items.length > 0 ? (
        <ProcedureLogListContent
          deletingId={deletingId}
          items={items}
          onDelete={(item) => void remove(item)}
        />
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
