"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { ProcedureLogV1 } from "../../types/procedure-log-v1";
import {
  getProcedureLogV1,
  ProcedureLogClientErrorV1,
} from "../../lib/ui/procedureLogClientV1";
import styles from "./procedures.module.css";

export function ProcedureLogDetailContent({
  procedure,
}: Readonly<{ procedure: ProcedureLogV1 }>) {
  return (
    <section aria-labelledby="procedure-detail-heading" className={styles.detailPanel}>
      <div className={styles.detailHeader}>
        <p className={styles.eyebrow}>Stored verified procedure</p>
        <h2 id="procedure-detail-heading">
          {procedure.label ?? "Untitled procedure"}
        </h2>
        <p className={styles.itemMeta}>
          Saved {new Date(procedure.createdAt).toLocaleString()}
        </p>
      </div>
      <p className={styles.detailNotice}>
        This is a stored verified procedure. Opening it does not re-run the solver or evaluator.
      </p>
      <dl className={styles.metrics}>
        <div><dt>Move count</dt><dd>{procedure.moveCount}</dd></div>
        <div><dt>HTM</dt><dd>{procedure.htm}</dd></div>
        <div><dt>QTM</dt><dd>{procedure.qtm}</dd></div>
      </dl>
      <dl className={styles.identity}>
        <div>
          <dt>Cube state identity</dt>
          <dd className="mono">{procedure.cubeState.stateId}</dd>
        </div>
        <div>
          <dt>Cube format</dt>
          <dd>{procedure.cubeState.format}</dd>
        </div>
      </dl>
      <h3>Complete move sequence</h3>
      {procedure.moves.length === 0 ? (
        <p>No moves required.</p>
      ) : (
        <ol aria-label="Complete saved procedure moves" className={styles.moveList}>
          {procedure.moves.map((move, index) => (
            <li key={`${index}:${move}`}>
              <span className="sr-only">Move {index + 1}: </span>{move}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function ProcedureLogDetailView({ id }: Readonly<{ id: string }>) {
  const [procedure, setProcedure] = useState<ProcedureLogV1 | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getProcedureLogV1(id, (input, init) =>
      fetch(input, { ...init, signal: controller.signal }))
      .then(setProcedure)
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          reason instanceof ProcedureLogClientErrorV1
            ? reason.message
            : "Procedure-log storage could not be reached.",
        );
      });
    return () => controller.abort();
  }, [id]);

  if (error !== null) {
    return (
      <div className={styles.errorMessage} role="alert">
        <h2>Saved procedure unavailable</h2>
        <p>{error}</p>
        <Link href="/logs">Return to saved procedures</Link>
      </div>
    );
  }
  if (procedure === null) {
    return <p aria-live="polite">Loading saved procedure…</p>;
  }

  return (
    <div className={styles.detailLayout}>
      <nav aria-label="Saved procedure navigation">
        <Link href="/logs">← All saved procedures</Link>
      </nav>
      <ProcedureLogDetailContent procedure={procedure} />
    </div>
  );
}
