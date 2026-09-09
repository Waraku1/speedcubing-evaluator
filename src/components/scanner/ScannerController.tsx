"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  SCANNER_RUNTIME_LIMITS_V1,
  ScannerRuntimeV1,
  type ScannerRuntimeFailureV1,
} from "../../lib/detect/scannerRuntimeV1";
import {
  combineCanonicalPoseCapturesV1,
  type CanonicalPoseCaptureV1,
  type ScanPoseNumberV1,
} from "../../lib/detect/scanPoseV1";
import type { CubeDraftTokenV1, CubeDraftV1 } from "../../lib/ui/cubeDraftV1";
import {
  SCANNER_DRAFT_HANDOFF_STORAGE_KEY_V1,
  createScannerDraftHandoffV1,
  serializeScannerDraftHandoffV1,
} from "../../lib/ui/scannerDraftHandoffV1";
import { CameraViewport } from "./CameraViewport";
import { ScanReview } from "./ScanReview";
import { ScannerLauncher } from "./ScannerLauncher";
import { ScannerStatus } from "./ScannerStatus";
import styles from "./scanner.module.css";

export type ScannerStateV1 =
  | "IDLE"
  | "PERMISSION"
  | "MODEL_LOADING"
  | "READY"
  | "SCANNING_POSE_1"
  | "SCANNING_POSE_2"
  | "REVIEW"
  | "ERROR"
  | "CANCELLED";

const FAILURE_MESSAGES: Readonly<Record<ScannerRuntimeFailureV1, string>> = {
  UNSUPPORTED_BROWSER:
    "This browser cannot run the local camera scanner. Manual entry remains available.",
  CAMERA_DENIED:
    "Camera permission was not granted. No model was loaded. You can retry or use manual entry.",
  CAMERA_FAILED:
    "The camera could not start. Check whether another app is using it, then retry.",
  MODEL_LOAD_FAILED:
    "The local scanner model could not load. Stop and retry, or use manual entry.",
  MODEL_LOAD_TIMEOUT:
    "The local scanner model did not become ready within 45 seconds.",
  INFERENCE_FAILED:
    "Local cube detection stopped after an inference error. No draft was submitted.",
  INFERENCE_TIMEOUT:
    "A local inference exceeded the two-second safety limit, so scanning stopped.",
  VISIBILITY_LOST:
    "Scanning stopped when this page lost visibility. Retry when you are ready.",
};

export function ScannerController() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<ScannerRuntimeV1 | null>(null);
  const firstCaptureRef = useRef<
    CanonicalPoseCaptureV1<CubeDraftTokenV1> | null
  >(null);
  const nextPoseRef = useRef<ScanPoseNumberV1>(1);
  const handoffInFlightRef = useRef(false);
  const [state, setState] = useState<ScannerStateV1>("IDLE");
  const [message, setMessage] = useState(
    "The camera and local model are off until you choose Start camera."
  );
  const [nextPose, setNextPose] = useState<ScanPoseNumberV1>(1);
  const [acceptedSamples, setAcceptedSamples] = useState(0);
  const [reviewDraft, setReviewDraft] = useState<CubeDraftV1 | null>(null);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      void runtimeRef.current?.cleanup();
    };
  }, []);

  function runtime(): ScannerRuntimeV1 {
    runtimeRef.current ??= new ScannerRuntimeV1();
    return runtimeRef.current;
  }

  function startScanner(): void {
    if (videoRef.current === null || canvasRef.current === null) return;
    firstCaptureRef.current = null;
    nextPoseRef.current = 1;
    setNextPose(1);
    setReviewDraft(null);
    setAcceptedSamples(0);
    setStorageError(null);
    setState("PERMISSION");
    setMessage("Waiting for camera permission. The model is still unloaded.");

    void runtime().start(videoRef.current, canvasRef.current, {
      onStatus: (status) => {
        if (status === "PERMISSION") {
          setState("PERMISSION");
          setMessage("Waiting for camera permission. The model is still unloaded.");
        } else if (status === "MODEL_LOADING") {
          setState("MODEL_LOADING");
          setMessage("Camera ready. Loading the local scanner model in a worker.");
        } else {
          setState("READY");
          setMessage("Ready for pose 1. Match White on top, Red left, and Blue right.");
        }
      },
      onFrame: () => undefined,
      onPoseProgress: (count) => setAcceptedSamples(count),
      onPoseGuidance: (guidance) => setMessage(guidance),
      onPoseAccepted: (pose, faces) => {
        if (pose === 1) {
          firstCaptureRef.current = faces;
          nextPoseRef.current = 2;
          setNextPose(2);
          setAcceptedSamples(0);
          setState("READY");
          setMessage(
            "Pose 1 accepted. Turn the cube to show Yellow on top, Green left, and Orange right."
          );
          return;
        }

        const first = firstCaptureRef.current;
        if (first === null) {
          setState("ERROR");
          setMessage("Pose 1 was unavailable. Stop and retry the two-pose scan.");
          void runtimeRef.current?.cleanup();
          return;
        }
        try {
          setReviewDraft(combineCanonicalPoseCapturesV1(first, faces));
          setState("REVIEW");
          setMessage("Camera stopped. Review every face before using this draft.");
          void runtimeRef.current?.cleanup();
        } catch {
          setState("ERROR");
          setMessage("The two poses could not form a complete canonical draft.");
          void runtimeRef.current?.cleanup();
        }
      },
      onFailure: (failure) => {
        setState("ERROR");
        setMessage(FAILURE_MESSAGES[failure]);
      },
    });
  }

  function beginPose(): void {
    const pose = nextPoseRef.current;
    if (!runtime().beginPose(pose)) return;
    setAcceptedSamples(0);
    setState(pose === 1 ? "SCANNING_POSE_1" : "SCANNING_POSE_2");
    setMessage(
      pose === 1
        ? "Hold White on top, Red left, and Blue right until five stable samples are collected."
        : "Hold Yellow on top, Green left, and Orange right until five stable samples are collected."
    );
  }

  function cancelScanner(): void {
    void runtimeRef.current?.cleanup();
    setState("CANCELLED");
    setMessage("Scanner resources were released. No draft was transferred.");
  }

  function useReviewedDraft(draft: CubeDraftV1): void {
    if (handoffInFlightRef.current) return;

    let serializedHandoff: string;
    try {
      serializedHandoff = serializeScannerDraftHandoffV1(
        createScannerDraftHandoffV1(draft)
      );
    } catch {
      setStorageError(
        "The reviewed draft is not valid for transfer. Your review is still here."
      );
      return;
    }

    handoffInFlightRef.current = true;
    setStorageError(null);
    setHandoffBusy(true);
    void (async () => {
      try {
        const scannerRuntime = runtimeRef.current;
        if (scannerRuntime === null) {
          throw new Error("Scanner runtime is unavailable for cleanup.");
        }

        // Resolving cleanup is the runtime's release boundary: tracks, worker,
        // animation frame, timers, and lifecycle listeners have all been released.
        await scannerRuntime.cleanup();
        window.sessionStorage.setItem(
          SCANNER_DRAFT_HANDOFF_STORAGE_KEY_V1,
          serializedHandoff
        );
        router.push("/");
      } catch {
        handoffInFlightRef.current = false;
        setHandoffBusy(false);
        setStorageError(
          "This browser could not safely transfer the reviewed draft. Your review is still here."
        );
      }
    })();
  }

  const cameraActive = !["IDLE", "REVIEW", "ERROR", "CANCELLED"].includes(state);
  const canCapture = state === "READY";

  return (
    <div
      className={styles.scanner}
      data-accepted-samples={acceptedSamples}
      data-handoff-busy={handoffBusy}
      data-review-ready={reviewDraft !== null}
      data-scanner-state={state}
    >
      <nav aria-label="Scanner navigation" className={styles.navigation}>
        <Link href="/" prefetch={false}>
          Use manual cube entry
        </Link>
        <span>Camera scanning is optional</span>
      </nav>

      {state === "IDLE" ? (
        <ScannerLauncher disabled={false} onStart={startScanner} />
      ) : null}

      {state === "REVIEW" && reviewDraft !== null ? (
        <ScanReview
          busy={handoffBusy}
          initialDraft={reviewDraft}
          onCancel={cancelScanner}
          onUseDraft={useReviewedDraft}
          storageError={storageError}
        />
      ) : (
        <>
          <CameraViewport
            active={cameraActive}
            canvasRef={canvasRef}
            pose={nextPose}
            videoRef={videoRef}
          />
          <ScannerStatus
            acceptedSamples={acceptedSamples}
            message={message}
            requiredSamples={SCANNER_RUNTIME_LIMITS_V1.samplesPerPose}
            state={state}
          />
          <div className={styles.actions}>
            {canCapture ? (
              <button
                className={styles.primaryButton}
                onClick={beginPose}
                type="button"
              >
                Capture pose {nextPose}
              </button>
            ) : null}
            {state === "ERROR" || state === "CANCELLED" ? (
              <button
                className={styles.primaryButton}
                onClick={startScanner}
                type="button"
              >
                Try camera again
              </button>
            ) : null}
            {state !== "IDLE" && state !== "CANCELLED" ? (
              <button
                className={styles.secondaryButton}
                onClick={cancelScanner}
                type="button"
              >
                Cancel scan
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
