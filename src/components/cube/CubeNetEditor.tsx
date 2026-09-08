"use client";

import { useRef, type KeyboardEvent } from "react";

import {
  CUBE_DRAFT_FACES_V1,
  CUBE_DRAFT_FACE_NAMES_V1,
  CUBE_DRAFT_TOKENS_V1,
  faceForStickerIndexV1,
  isEditableStickerIndexV1,
  type CubeDraftFaceV1,
  type CubeDraftTokenV1,
  type CubeDraftV1,
} from "../../lib/ui/cubeDraftV1";
import styles from "./cube.module.css";

type CubeNetEditorProps = Readonly<{
  draft: CubeDraftV1;
  selectedToken: CubeDraftTokenV1;
  activeStickerIndex: number;
  disabled: boolean;
  onSelectToken(token: CubeDraftTokenV1): void;
  onActivateSticker(index: number): void;
  onEditSticker(index: number, token: CubeDraftTokenV1): void;
}>;

function stickerLabel(
  face: CubeDraftFaceV1,
  indexWithinFace: number,
  token: CubeDraftTokenV1,
  editable: boolean
): string {
  const row = Math.floor(indexWithinFace / 3) + 1;
  const column = (indexWithinFace % 3) + 1;
  const status = token === "N" ? "Unknown" : "known";
  return `${face} face, row ${row}, column ${column}, token ${token}, ${status}, ${editable ? "editable" : "fixed center"}`;
}

export function CubeNetEditor({
  draft,
  selectedToken,
  activeStickerIndex,
  disabled,
  onSelectToken,
  onActivateSticker,
  onEditSticker,
}: CubeNetEditorProps) {
  const stickerRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const activeFace = faceForStickerIndexV1(activeStickerIndex);

  function focusSticker(index: number): void {
    if (!isEditableStickerIndexV1(index)) {
      return;
    }
    onActivateSticker(index);
    window.setTimeout(() => stickerRefs.current[index]?.focus(), 0);
  }

  function moveWithinFace(
    currentIndex: number,
    rowDelta: number,
    columnDelta: number
  ): void {
    const faceStart = Math.floor(currentIndex / 9) * 9;
    let row = Math.floor((currentIndex - faceStart) / 3);
    let column = (currentIndex - faceStart) % 3;

    for (let step = 0; step < 3; step += 1) {
      row += rowDelta;
      column += columnDelta;
      if (row < 0 || row > 2 || column < 0 || column > 2) {
        return;
      }
      const nextIndex = faceStart + row * 3 + column;
      if (isEditableStickerIndexV1(nextIndex)) {
        focusSticker(nextIndex);
        return;
      }
    }
  }

  function handleStickerKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ): void {
    const key = event.key.toUpperCase();
    const shortcut = key === "?" ? "N" : key;

    if (CUBE_DRAFT_TOKENS_V1.includes(shortcut as CubeDraftTokenV1)) {
      event.preventDefault();
      onEditSticker(index, shortcut as CubeDraftTokenV1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onEditSticker(index, selectedToken);
      return;
    }

    const withinFace = index % 9;
    const row = Math.floor(withinFace / 3);
    const faceIndex = Math.floor(index / 9);

    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        moveWithinFace(index, -1, 0);
        break;
      case "ArrowDown":
        event.preventDefault();
        moveWithinFace(index, 1, 0);
        break;
      case "ArrowLeft":
        event.preventDefault();
        moveWithinFace(index, 0, -1);
        break;
      case "ArrowRight":
        event.preventDefault();
        moveWithinFace(index, 0, 1);
        break;
      case "Home": {
        event.preventDefault();
        const rowStart = faceIndex * 9 + row * 3;
        focusSticker(rowStart);
        break;
      }
      case "End": {
        event.preventDefault();
        const rowEnd = faceIndex * 9 + row * 3 + 2;
        focusSticker(rowEnd);
        break;
      }
      case "PageUp":
      case "PageDown": {
        event.preventDefault();
        const direction = event.key === "PageUp" ? -1 : 1;
        const nextFace =
          (faceIndex + direction + CUBE_DRAFT_FACES_V1.length) %
          CUBE_DRAFT_FACES_V1.length;
        focusSticker(nextFace * 9 + withinFace);
        break;
      }
    }
  }

  return (
    <div className={styles.editor}>
      <fieldset className={styles.palette} disabled={disabled}>
        <legend>Sticker palette</legend>
        <div className={styles.paletteOptions}>
          {CUBE_DRAFT_TOKENS_V1.map((token) => {
            const name = token === "N" ? "Unknown" : CUBE_DRAFT_FACE_NAMES_V1[token];
            return (
              <label className={styles.paletteOption} key={token}>
                <input
                  checked={selectedToken === token}
                  name="sticker-palette"
                  onChange={() => onSelectToken(token)}
                  type="radio"
                  value={token}
                />
                <span className={styles.paletteVisual} data-token={token}>
                  <span className={styles.paletteSwatch} aria-hidden="true" />
                  <span>
                    <strong>{token === "N" ? "?" : token}</strong>
                    <small>{name}</small>
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div
        aria-label="Cube face selector"
        className={styles.faceTabs}
        role="group"
      >
        {CUBE_DRAFT_FACES_V1.map((face, faceIndex) => (
          <button
            aria-pressed={activeFace === face}
            className={styles.faceTab}
            disabled={disabled}
            key={face}
            onClick={() => focusSticker(faceIndex * 9)}
            type="button"
          >
            {face} <span>{CUBE_DRAFT_FACE_NAMES_V1[face]}</span>
          </button>
        ))}
      </div>

      <div className={styles.cubeNet} data-testid="cube-net-editor">
        {CUBE_DRAFT_FACES_V1.map((face, faceIndex) => (
          <section
            aria-label={`${face} ${CUBE_DRAFT_FACE_NAMES_V1[face]} face`}
            className={styles.face}
            data-active={activeFace === face}
            data-face={face}
            key={face}
          >
            <h3>
              <span>{face}</span> {CUBE_DRAFT_FACE_NAMES_V1[face]}
            </h3>
            <div className={styles.faceGrid}>
              {Array.from({ length: 9 }, (_, withinFace) => {
                const index = faceIndex * 9 + withinFace;
                const token = draft[index];
                const editable = isEditableStickerIndexV1(index);
                const label = stickerLabel(face, withinFace, token, editable);

                if (!editable) {
                  return (
                    <div
                      aria-label={label}
                      className={styles.sticker}
                      data-sticker-fixed="true"
                      data-token={token}
                      key={index}
                      role="img"
                    >
                      <span aria-hidden="true">{token}</span>
                    </div>
                  );
                }

                return (
                  <button
                    aria-label={label}
                    className={styles.sticker}
                    data-sticker-editable="true"
                    data-sticker-index={index}
                    data-token={token}
                    disabled={disabled}
                    key={index}
                    onClick={() => onEditSticker(index, selectedToken)}
                    onFocus={() => onActivateSticker(index)}
                    onKeyDown={(event) => handleStickerKeyDown(event, index)}
                    ref={(element) => {
                      stickerRefs.current[index] = element;
                    }}
                    type="button"
                  >
                    <span aria-hidden="true">{token === "N" ? "?" : token}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <p className={styles.keyboardHelp}>
        Keyboard: arrows move within a face; Page Up/Down changes face;
        Enter or Space applies the palette; U, R, F, D, L, B, or ? applies
        directly.
      </p>
    </div>
  );
}
