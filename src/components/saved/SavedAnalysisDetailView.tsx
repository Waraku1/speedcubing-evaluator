"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  parseSavedAnalysisDetailResponseV1,
  savedAnalysisJsonV1,
  SavedAnalysisClientErrorV1,
  type SavedAnalysisDetailClientV1,
} from "../../lib/ui/savedAnalysisClientV1";
import { EvaluationResultPanel } from "../results/EvaluationResultPanel";
import styles from "./saved.module.css";

export function SavedAnalysisDetailView({ id }: Readonly<{ id: string }>) {
  const [detail, setDetail] = useState<SavedAnalysisDetailClientV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [traceExpanded, setTraceExpanded] = useState(false);
  const [tracePage, setTracePage] = useState(0);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const resultRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/saved-analyses/${encodeURIComponent(id)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const parsed = parseSavedAnalysisDetailResponseV1(
          await savedAnalysisJsonV1(response),
          response.ok
        );
        setDetail(parsed);
        window.setTimeout(() => resultRef.current?.focus(), 0);
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(
          reason instanceof SavedAnalysisClientErrorV1
            ? reason.message
            : "Saved-analysis storage could not be reached."
        );
      }
    })();
    return () => controller.abort();
  }, [id]);

  if (error !== null) {
    return (
      <div className={styles.errorMessage} role="alert">
        <h2>Saved analysis unavailable</h2>
        <p>{error}</p>
        <Link href="/saved">Return to saved analyses</Link>
      </div>
    );
  }
  if (detail === null) return <p aria-live="polite">Loading saved snapshot…</p>;

  return (
    <div className={styles.detailLayout}>
      <nav aria-label="Saved analysis navigation">
        <Link href="/saved">← All saved analyses</Link>
      </nav>
      <div className={styles.snapshotIdentity}>
        <p className={styles.eyebrow}>Saved snapshot</p>
        <h2>{detail.savedAnalysis.label ?? "Untitled analysis"}</h2>
        <p>
          Stored {new Date(detail.savedAnalysis.createdAt).toLocaleString()}.
          This page does not run a new evaluation.
        </p>
      </div>
      <EvaluationResultPanel
        facelets={detail.savedAnalysis.cubeState.facelets}
        onSelectTraceRecord={setSelectedRecordId}
        onTraceExpandedChange={setTraceExpanded}
        onTracePageChange={setTracePage}
        ref={resultRef}
        result={detail.evaluation}
        selectedTraceRecordId={selectedRecordId}
        snapshot={{
          id: detail.savedAnalysis.id,
          createdAt: detail.savedAnalysis.createdAt,
          ...(detail.cfop === undefined ? {} : { cfop: detail.cfop }),
        }}
        traceExpanded={traceExpanded}
        tracePage={tracePage}
      />
    </div>
  );
}
