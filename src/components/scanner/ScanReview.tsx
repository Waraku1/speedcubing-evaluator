"use client";

import { useState } from "react";

import { CubeNetEditor } from "../cube/CubeNetEditor";
import {
  updateCubeDraftTokenV1,
  validateCubeDraftV1,
  type CubeDraftTokenV1,
  type CubeDraftV1,
} from "../../lib/ui/cubeDraftV1";
import styles from "./scanner.module.css";

type ScanReviewProps = Readonly<{
  initialDraft: CubeDraftV1;
  busy: boolean;
  storageError: string | null;
  onUseDraft(draft: CubeDraftV1): void;
  onCancel(): void;
}>;

export function ScanReview({
  initialDraft,
  busy,
  storageError,
  onUseDraft,
  onCancel,
}: ScanReviewProps) {
  const [draft, setDraft] = useState(initialDraft);
  const [selectedToken, setSelectedToken] = useState<CubeDraftTokenV1>("N");
  const [activeStickerIndex, setActiveStickerIndex] = useState(0);
  const validation = validateCubeDraftV1(draft);

  return (
    <section aria-labelledby="review-heading" className={styles.reviewPanel}>
      <p className={styles.stepLabel}>Required review</p>
      <h2 id="review-heading">Review and correct all six faces</h2>
      <p className={styles.reviewIntro}>
        Camera colors are heuristic suggestions, not facts. Check the canonical
        outside-view net below. Use <strong>?</strong> for any sticker you cannot
        confirm. Centers are fixed after the two pose checks.
      </p>
      <div className={styles.netScrollNote}>
        On narrow screens, scroll the net sideways to inspect every face. Layout:
        U above; L, F, R, B across; D below.
      </div>
      <CubeNetEditor
        activeStickerIndex={activeStickerIndex}
        canonicalNet
        disabled={busy}
        draft={draft}
        onActivateSticker={setActiveStickerIndex}
        onEditSticker={(index, token) =>
          setDraft((current) => updateCubeDraftTokenV1(current, index, token))
        }
        onSelectToken={setSelectedToken}
        paletteName="scanner-review-palette"
        reviewMode
        selectedToken={selectedToken}
      />
      <div className={styles.reviewSummary} data-state={validation.state}>
        <strong>{validation.message}</strong>
        <span>{validation.unknownCount} unknown</span>
      </div>
      {storageError === null ? null : (
        <p className={styles.storageError} role="alert">
          {storageError}
        </p>
      )}
      <div className={styles.actions}>
        <button
          className={styles.primaryButton}
          disabled={busy}
          onClick={() => onUseDraft(draft)}
          type="button"
        >
          {busy ? "Opening evaluator…" : "Use reviewed draft in evaluator"}
        </button>
        <button
          className={styles.secondaryButton}
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          Cancel scan
        </button>
      </div>
    </section>
  );
}
