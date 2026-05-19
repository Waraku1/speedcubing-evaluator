"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Color, CubeState, isValidCubeState } from "../../lib/cube/cube";
import { SCAN_POINTS_27 } from "../../lib/detect/scannerCoordinates";
import { extractColors } from "../../lib/detect/vision";
import { buildCubeState } from "../../lib/detect/mapper";

// プレビュー表示用のカラーコードマッピング
const COLOR_HEX_MAP: Record<Color, string> = {
  U: "#FFFFFF", // 白
  D: "#FFD500", // 黄
  R: "#C41E3A", // 赤
  L: "#FF5800", // 橙
  F: "#009E60", // 緑
  B: "#0051BA", // 青
};

type Step = 1 | 2 | 3;

export default function DetectCube() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestRef = useRef<number | undefined>(undefined);

  const [step, setStep] = useState<Step>(1);
  const [currentColors, setCurrentColors] = useState<Color[]>(
    Array(27).fill("U"),
  );
  const [step1Colors, setStep1Colors] = useState<Color[]>([]);
  const [cubeState, setCubeState] = useState<CubeState | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 1. カメラの初期化
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
      })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch((err) => {
        console.error("Camera error:", err);
        setErrorMsg("カメラのアクセスが許可されていないか、利用できません。");
      });

    return () => {
      // アンマウント時にカメラを停止
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // 2. リアルタイムスキャンループ
  const scanLoop = useCallback(() => {
    if (videoRef.current && videoRef.current.readyState >= 2 && step !== 3) {
      try {
        // バックエンドロジックを呼び出して27マスの色を抽出
        const colors = extractColors(videoRef.current, SCAN_POINTS_27);
        setCurrentColors(colors);
      } catch (err) {
        // 初期化中のCanvasエラー等は無視
      }
    }
    requestRef.current = requestAnimationFrame(scanLoop);
  }, [step]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(scanLoop);
    return () => cancelAnimationFrame(requestRef.current!);
  }, [scanLoop]);

  // 3. スキャン実行（Step進行）
  const handleCapture = () => {
    if (step === 1) {
      setStep1Colors(currentColors);
      setStep(2);
    } else if (step === 2) {
      try {
        const finalState = buildCubeState(step1Colors, currentColors);
        setCubeState(finalState);
        setStep(3);

        // バリデーションチェック
        if (!isValidCubeState(finalState)) {
          setErrorMsg(
            "読み取った色に誤りがあります（各色が9個ずつではありません）。環境光を変えて再試行してください。",
          );
        } else {
          setErrorMsg(null);
        }
      } catch (err: any) {
        setErrorMsg(err.message);
      }
    }
  };

  const handleReset = () => {
    setStep(1);
    setStep1Colors([]);
    setCubeState(null);
    setErrorMsg(null);
  };

  // ─── UI 描画 ───

  if (step === 3 && cubeState) {
    return (
      <div style={styles.container}>
        <h2>スキャン完了</h2>
        {errorMsg && <div style={styles.error}>{errorMsg}</div>}
        <pre style={styles.stateCode}>{JSON.stringify(cubeState, null, 2)}</pre>
        <button style={styles.button} onClick={handleReset}>
          再スキャン
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2>
          {step === 1 ? "Step 1: 表面のスキャン" : "Step 2: 裏面のスキャン"}
        </h2>
        <p>
          {step === 1
            ? "上(白)・前(緑)・右(赤) の3面が画面に収まるように合わせてください。"
            : "キューブを180度裏返し、下(黄)・後(青)・左(橙) を合わせてください。"}
        </p>
      </div>

      {errorMsg && <div style={styles.error}>{errorMsg}</div>}

      {/* カメラコンテナ */}
      <div style={styles.videoWrapper}>
        <video ref={videoRef} autoPlay playsInline style={styles.video} />

        {/* SVG オーバーレイガイド */}
        <svg
          style={styles.svgOverlay}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {/* Y字のガイドライン（キューブのエッジ） */}
          <polyline
            points="50,50 50,10"
            stroke="rgba(255,255,255,0.8)"
            strokeWidth="1"
            fill="none"
          />
          <polyline
            points="50,50 15,75"
            stroke="rgba(255,255,255,0.8)"
            strokeWidth="1"
            fill="none"
          />
          <polyline
            points="50,50 85,75"
            stroke="rgba(255,255,255,0.8)"
            strokeWidth="1"
            fill="none"
          />

          {/* リアルタイム色検出プレビュー (27ポイント) */}
          {SCAN_POINTS_27.map((point, idx) => (
            <circle
              key={idx}
              cx={point.x * 100}
              cy={point.y * 100}
              r="3"
              fill={COLOR_HEX_MAP[currentColors[idx]]}
              stroke="#000"
              strokeWidth="0.5"
            />
          ))}
        </svg>
      </div>

      <div style={styles.footer}>
        <button style={styles.button} onClick={handleCapture}>
          {step === 1 ? "この状態を記録 (1/2)" : "スキャン完了 (2/2)"}
        </button>
      </div>
    </div>
  );
}

// ─── スタイル定義 (シンプル化のためインラインスタイルを使用) ───
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    maxWidth: "500px",
    margin: "0 auto",
    fontFamily: "sans-serif",
  },
  header: {
    textAlign: "center",
    padding: "10px",
  },
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
    objectFit: "cover", // 正方形にトリミング
  },
  svgOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none", // クリック等の邪魔をしない
  },
  footer: {
    marginTop: "20px",
    width: "100%",
    display: "flex",
    justifyContent: "center",
  },
  button: {
    padding: "15px 30px",
    fontSize: "18px",
    fontWeight: "bold",
    color: "#fff",
    backgroundColor: "#007BFF",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
  },
  error: {
    color: "#D8000C",
    backgroundColor: "#FFD2D2",
    padding: "10px",
    borderRadius: "5px",
    margin: "10px 0",
    width: "90%",
    textAlign: "center",
  },
  stateCode: {
    backgroundColor: "#f4f4f4",
    padding: "15px",
    borderRadius: "5px",
    width: "90%",
    overflowX: "auto",
  },
};
