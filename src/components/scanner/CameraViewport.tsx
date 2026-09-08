import type { RefObject } from "react";

import type { ScanPoseNumberV1 } from "../../lib/detect/scanPoseV1";
import styles from "./scanner.module.css";

type CameraViewportProps = Readonly<{
  canvasRef: RefObject<HTMLCanvasElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  pose: ScanPoseNumberV1;
  active: boolean;
}>;

const GUIDES = Object.freeze({
  1: Object.freeze({ top: "White · U", left: "Red · R", right: "Blue · B" }),
  2: Object.freeze({ top: "Yellow · D", left: "Green · F", right: "Orange · L" }),
});

export function CameraViewport({
  canvasRef,
  videoRef,
  pose,
  active,
}: CameraViewportProps) {
  const guide = GUIDES[pose];

  return (
    <section aria-labelledby="camera-heading" className={styles.cameraPanel}>
      <div className={styles.cameraHeading}>
        <div>
          <p className={styles.stepLabel}>Pose {pose} of 2</p>
          <h2 id="camera-heading">Match the three center guides</h2>
        </div>
        <span className={styles.localBadge}>Local processing</span>
      </div>
      <p className={styles.cameraInstruction}>
        Keep the cube upright in the outside view shown. The preview is not
        mirrored: move the cube in the same direction you see on screen.
      </p>
      <div className={styles.viewport} data-active={active}>
        <video
          aria-hidden="true"
          autoPlay
          className={styles.sourceVideo}
          muted
          playsInline
          ref={videoRef}
        />
        <canvas
          aria-label="Non-mirrored live camera preview with detected sticker markers"
          className={styles.previewCanvas}
          ref={canvasRef}
          role="img"
        />
        <span className={`${styles.guide} ${styles.guideTop}`}>{guide.top}</span>
        <span className={`${styles.guide} ${styles.guideLeft}`}>{guide.left}</span>
        <span className={`${styles.guide} ${styles.guideRight}`}>{guide.right}</span>
      </div>
    </section>
  );
}
