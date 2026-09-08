import { type RefObject } from "react";

import { CubeNetEditor } from "../cube/CubeNetEditor";
import { CubeValidationSummary } from "../cube/CubeValidationSummary";
import type {
  CubeDraftTokenV1,
  CubeDraftV1,
  LocalCubeValidationV1,
} from "../../lib/ui/cubeDraftV1";
import styles from "./workbench.module.css";

type CubeInputPanelProps = Readonly<{
  draft: CubeDraftV1;
  selectedToken: CubeDraftTokenV1;
  activeStickerIndex: number;
  validation: LocalCubeValidationV1;
  disabled: boolean;
  validationRef: RefObject<HTMLDivElement | null>;
  onSelectToken(token: CubeDraftTokenV1): void;
  onActivateSticker(index: number): void;
  onEditSticker(index: number, token: CubeDraftTokenV1): void;
  onFocusProblem(): void;
}>;

export function CubeInputPanel({
  draft,
  selectedToken,
  activeStickerIndex,
  validation,
  disabled,
  validationRef,
  onSelectToken,
  onActivateSticker,
  onEditSticker,
  onFocusProblem,
}: CubeInputPanelProps) {
  return (
    <section aria-labelledby="cube-input-heading" className={styles.inputPanel}>
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.stepLabel}>Step 1</p>
          <h2 id="cube-input-heading">Enter the cube state</h2>
        </div>
        <span className={styles.manualBadge}>Manual entry</span>
      </div>
      <p className={styles.sectionIntro}>
        Assign every sticker using canonical U, R, F, D, L, and B tokens.
        Centers are fixed; unknown stickers remain explicitly marked with ?.
      </p>
      <CubeNetEditor
        activeStickerIndex={activeStickerIndex}
        disabled={disabled}
        draft={draft}
        onActivateSticker={onActivateSticker}
        onEditSticker={onEditSticker}
        onSelectToken={onSelectToken}
        selectedToken={selectedToken}
      />
      <CubeValidationSummary
        onFocusProblem={onFocusProblem}
        ref={validationRef}
        validation={validation}
      />
    </section>
  );
}
