"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import * as ort from "onnxruntime-web";
import { Color, CubeState, isValidCubeState } from "../../lib/cube/cube";
import { buildCubeState } from "../../lib/detect/mapper";
import { runInference } from "../../lib/detect/visionOnnx";
import { Point } from "../../lib/detect/scannerCoordinates";

// NEXT.JS で WASM ロードエラーを防ぐ設定
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";

export interface CubePose {
  center: Point;
  top: Point;
  rightUp: Point;
  rightDown: Point;
  bottom: Point;
  leftDown: Point;
  leftUp: Point;
}

const COLOR_HEX_MAP: Record<Color, string> = {
  U: "#FFFFFF",
  D: "#FFD500",
  R: "#C41E3A",
  L: "#FF5800",
  F: "#009E60",
  B: "#0051BA",
};

export default function DetectCube() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestRef = useRef<number | undefined>(undefined);

  const [ortSession, setOrtSession] = useState<ort.InferenceSession | null>(
    null,
  );
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [currentColors, setCurrentColors] = useState<Color[]>(
    Array(27).fill("U"),
  );
  const [step1Colors, setStep1Colors] = useState<Color[]>([]);
  const [cubeState, setCubeState] = useState<CubeState | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [cubePose, setCubePose] = useState<CubePose | null>(null);
  const [uiPoints, setUiPoints] = useState<Point[]>([]);
  const lastPoseRef = useRef<CubePose | null>(null);

  useEffect(() => {
    // 1. AIモデルのロード (非同期)
    ort.InferenceSession.create("/cube_pose.onnx", {
      executionProviders: ["wasm"],
    })
      .then((session) => setOrtSession(session))
      .catch(() => setErrorMsg("AIモデルの読み込みに失敗しました。"));

    // 2. カメラの起動
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
      })
      .then((stream) => {
        // 修正: 確実にvideoタグが存在する状態でストリームを割り当てる
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(() => setErrorMsg("カメラエラー: 権限を許可してください。"));

    return () => {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream)
          .getTracks()
          .forEach((t) => t.stop());
      }
    };
  }, []);

  const scanLoop = useCallback(async () => {
    if (
      videoRef.current &&
      videoRef.current.readyState >= 2 &&
      step !== 3 &&
      ortSession
    ) {
      try {
        const result = (await runInference(
          ortSession,
          videoRef.current,
          step,
        )) as { colors: Color[]; points: Point[]; pose: CubePose } | null;

        if (result) {
          const newPose = result.pose;
          if (!lastPoseRef.current) {
            lastPoseRef.current = newPose;
          } else {
            const smooth = (curr: Point, prev: Point) => ({
              x: prev.x + (curr.x - prev.x) * 0.4,
              y: prev.y + (curr.y - prev.y) * 0.4,
            });
            lastPoseRef.current = {
              center: smooth(newPose.center, lastPoseRef.current.center),
              top: smooth(newPose.top, lastPoseRef.current.top),
              rightUp: smooth(newPose.rightUp, lastPoseRef.current.rightUp),
              rightDown: smooth(
                newPose.rightDown,
                lastPoseRef.current.rightDown,
              ),
              bottom: smooth(newPose.bottom, lastPoseRef.current.bottom),
              leftDown: smooth(newPose.leftDown, lastPoseRef.current.leftDown),
              leftUp: smooth(newPose.leftUp, lastPoseRef.current.leftUp),
            };
          }
          setCubePose(lastPoseRef.current);
          setUiPoints(result.points);
          setCurrentColors(result.colors);
          setErrorMsg(null);
        } else {
          setCubePose(null);
        }
      } catch (err) {}
    }
    requestRef.current = requestAnimationFrame(scanLoop);
  }, [step, ortSession]);

  useEffect(() => {
    if (ortSession) requestRef.current = requestAnimationFrame(scanLoop);
    return () => cancelAnimationFrame(requestRef.current!);
  }, [scanLoop, ortSession]);

  const handleCapture = () => {
    if (!cubePose) {
      setErrorMsg("キューブが認識されていません。");
      return;
    }
    if (step === 1) {
      setStep1Colors(currentColors);
      setStep(2);
      setCubePose(null);
      setUiPoints([]);
      lastPoseRef.current = null;
    } else if (step === 2) {
      try {
        const finalState = buildCubeState(step1Colors, currentColors);
        setCubeState(finalState);
        setStep(3);
        if (!isValidCubeState(finalState))
          setErrorMsg("読み取りエラー: 光の反射や影で誤認識されています。");
      } catch (err: any) {
        setErrorMsg(err.message);
      }
    }
  };

  if (step === 3 && cubeState) {
    return (
      <div style={styles.container}>
        <h2>スキャン完了</h2>
        {errorMsg && <div style={styles.error}>{errorMsg}</div>}
        <pre style={styles.stateCode}>{JSON.stringify(cubeState, null, 2)}</pre>
        <button
          style={styles.button}
          onClick={() => {
            setStep(1);
            setCubeState(null);
            setErrorMsg(null);
          }}
        >
          再スキャン
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2>{step === 1 ? "Step 1" : "Step 2"}</h2>
        <p>カメラに向けるとAIがパースを自動計算します</p>
      </div>

      {errorMsg && <div style={styles.error}>{errorMsg}</div>}

      <div style={styles.videoWrapper}>
        {/* 修正: muted を追加。これがないとモバイルで自動再生がブロックされて真っ暗になります */}
        <video ref={videoRef} autoPlay playsInline muted style={styles.video} />

        {/* AIロード中のオーバーレイ表示（カメラ映像の上に被せる） */}
        {!ortSession && (
          <div style={styles.loadingOverlay}>
            <p>AI推論エンジンを起動中...</p>
          </div>
        )}

        <svg
          style={styles.svgOverlay}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {cubePose && (
            <>
              <line
                x1={cubePose.center.x * 100}
                y1={cubePose.center.y * 100}
                x2={cubePose.leftUp.x * 100}
                y2={cubePose.leftUp.y * 100}
                stroke="#00FF00"
                strokeWidth="1"
              />
              <line
                x1={cubePose.center.x * 100}
                y1={cubePose.center.y * 100}
                x2={cubePose.bottom.x * 100}
                y2={cubePose.bottom.y * 100}
                stroke="#00FF00"
                strokeWidth="1"
              />
              <line
                x1={cubePose.center.x * 100}
                y1={cubePose.center.y * 100}
                x2={cubePose.rightUp.x * 100}
                y2={cubePose.rightUp.y * 100}
                stroke="#00FF00"
                strokeWidth="1"
              />
              <polygon
                points={`${cubePose.top.x * 100},${cubePose.top.y * 100} ${cubePose.rightUp.x * 100},${cubePose.rightUp.y * 100} ${cubePose.rightDown.x * 100},${cubePose.rightDown.y * 100} ${cubePose.bottom.x * 100},${cubePose.bottom.y * 100} ${cubePose.leftDown.x * 100},${cubePose.leftDown.y * 100} ${cubePose.leftUp.x * 100},${cubePose.leftUp.y * 100}`}
                fill="none"
                stroke="#00FF00"
                strokeWidth="1.2"
              />
            </>
          )}

          {uiPoints.map((pt, idx) => (
            <circle
              key={idx}
              cx={pt.x * 100}
              cy={pt.y * 100}
              r="2.5"
              fill={COLOR_HEX_MAP[currentColors[idx]]}
              stroke="rgba(0,0,0,0.8)"
              strokeWidth="0.5"
            />
          ))}
        </svg>
      </div>

      <div style={styles.footer}>
        <button
          style={styles.button}
          onClick={handleCapture}
          disabled={!cubePose}
        >
          スキャンする
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    maxWidth: "500px",
    margin: "0 auto",
    fontFamily: "sans-serif",
  },
  header: { textAlign: "center", padding: "10px" },
  videoWrapper: {
    position: "relative",
    width: "100%",
    aspectRatio: "1 / 1",
    backgroundColor: "#000",
    overflow: "hidden",
    borderRadius: "12px",
  },
  video: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  svgOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    zIndex: 10,
    pointerEvents: "none",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0,0,0,0.7)",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  footer: { marginTop: "20px" },
  button: {
    padding: "15px 40px",
    fontSize: "18px",
    color: "#fff",
    backgroundColor: "#007BFF",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  error: {
    color: "#D8000C",
    backgroundColor: "#FFD2D2",
    padding: "10px",
    borderRadius: "5px",
    width: "90%",
    textAlign: "center",
    marginBottom: "10px",
  },
};
