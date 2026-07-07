"use client";

import { useEffect, useRef, useState } from "react";
import * as ort from "onnxruntime-web";
import { runInference } from "@/lib/detect/visionOnnx";

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [status, setStatus] = useState("Launching the camera");
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [step1Final, setStep1Final] = useState<string[]>(Array(27).fill("N"));
  const [step2Final, setStep2Final] = useState<string[]>(Array(27).fill("N"));

  // 右側エリアの表示モード切り替え用ステート ('net' or '3d')
  const [viewMode, setViewMode] = useState<"net" | "3d">("net");

  const scanHistoryRef = useRef<string[][]>([]);

  // 描画ループ内で最新のステートを常に参照するためのRef
  const isScanningRef = useRef(isScanning);
  isScanningRef.current = isScanning;
  const currentStepRef = useRef(currentStep);
  currentStepRef.current = currentStep;

  useEffect(() => {
    if (typeof window === "undefined") return;

    let session: ort.InferenceSession | null = null;
    let animationFrameId: number;
    let isDestroyed = false;

    async function setup() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: 640, height: 480 },
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        setStatus("Failed to launch the camera " + err);
        return;
      }

      try {
        setStatus("Loading model...");
        session = await ort.InferenceSession.create("/cube_pose.onnx", {
          executionProviders: ["wasm"],
        });
        setStatus("All set. Please position the cube.");
      } catch (err) {
        setStatus("Failed to load model:" + err);
        return;
      }

      // リアルタイム座標描画ループ（常に実行）
      async function drawLoop() {
        if (isDestroyed) return;

        if (videoRef.current && canvasRef.current && session) {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          const ctx = canvas.getContext("2d");

          if (ctx && video.videoWidth > 0) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            ctx.save();
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.restore();

            try {
              // Refから最新のステップを取得して推論
              const result = await runInference(session, video, currentStepRef.current);
              
              if (result && result.points && Array.isArray(result.points)) {
                if (isScanningRef.current && result.colors && result.colors.length === 27) {
                  scanHistoryRef.current.push(result.colors);
                }

                const minDim = Math.min(video.videoWidth, video.videoHeight);
                const sx = (video.videoWidth - minDim) / 2;
                const sy = (video.videoHeight - minDim) / 2;
                const colorMap: Record<string, string> = {
                  U: "#ffffff", // White
                  D: "#fbbf24", // Yellow
                  F: "#10b981", // Green
                  B: "#3b82f6", // Blue
                  R: "#ef4444", // Red
                  L: "#f97316", // Orange
                  N: "#1e293b", // Unknown
                };

                result.points.forEach((p, idx) => {
                  const origPx = sx + p.x * minDim;
                  const px = canvas.width - origPx;
                  const py = sy + p.y * minDim;

                  const detected = result.colors[idx];

                  ctx.beginPath();
                  ctx.arc(px, py, 6, 0, Math.PI * 2);

                  ctx.fillStyle = colorMap[detected] ?? "#1e293b";
                  ctx.fill();

                  ctx.lineWidth = 2;
                  ctx.strokeStyle = "#000000";
                  ctx.stroke();
                });
              }
            } catch (e) {
              console.error(e);
            }
          }
        }
        animationFrameId = requestAnimationFrame(drawLoop);
      }
      drawLoop();
    }

    setup();
    return () => {
      isDestroyed = true;
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // 10秒間の連続適応型スキャン
  const start10SecScan = async () => {
    if (!videoRef.current) return;
    scanHistoryRef.current = [];
    setIsScanning(true);
    setProgress(0);
    setStatus(`Step ${currentStep} in progress`);

    const duration = 10000;
    const intervalTime = 50; 
    const startTime = Date.now();

    const progressTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const currentProgress = Math.min(Math.floor((elapsed / duration) * 100), 100);
      setProgress(currentProgress);
      
      if (elapsed >= duration) {
        clearInterval(progressTimer);
        setIsScanning(false);
        calculateMostFrequentColors();
      }
    }, intervalTime);
  };

  const calculateMostFrequentColors = () => {
    const history = scanHistoryRef.current;
    if (history.length === 0) {
      setStatus("No detection flame");
      return;
    }

    const finalColors: string[] = [];
    for (let i = 0; i < 27; i++) {
      const colorCounts: { [key: string]: number } = {};
      let hasValidColor = false;

      for (let f = 0; f < history.length; f++) {
        const color = history[f][i];
        if (color && color !== "N") {
          colorCounts[color] = (colorCounts[color] || 0) + 1;
          hasValidColor = true;
        }
      }

      let maxColor = "N"; 
      let maxCount = 0;

      if (hasValidColor) {
        for (const [color, count] of Object.entries(colorCounts)) {
          if (count > maxCount) {
            maxCount = count;
            maxColor = color;
          }
        }
      }
      finalColors.push(maxColor);
    }

    if (currentStep === 1) {
      setStep1Final(finalColors);
      setStatus("Step 1 completed. Move on to step 2.");
      setCurrentStep(2);
    } else {
      setStep2Final(finalColors);
      setStatus("Scan has been completed.");
    }
  };

  const resetAll = () => {
    setStep1Final(Array(27).fill("N"));
    setStep2Final(Array(27).fill("N"));
    setProgress(0);
    setCurrentStep(1);
    setStatus("It has been reset. Restart from step 1.");
  };

  // --- 手動色修正用のハンドラー ---
  const handleColorChange = (face: string, index: number, newColor: string) => {
    if (["U", "R", "B"].includes(face)) {
      setStep1Final((prev) => {
        const next = [...prev];
        const offset = face === "U" ? 0 : face === "R" ? 9 : 18;
        next[offset + index] = newColor;
        return next;
      });
    } else {
      setStep2Final((prev) => {
        const next = [...prev];
        const offset = face === "D" ? 0 : face === "F" ? 9 : 18;
        next[offset + index] = newColor;
        return next;
      });
    }
  };

  // --- 条件固定マッピングロジック（ステップの進捗に関わらず常時展開・編集可能に調整） ---
  const faceU = step1Final.slice(0, 9);
  const faceR = step1Final.slice(9, 18);
  const faceB = step1Final.slice(18, 27);
  faceU[4] = "U";
  faceR[4] = "R";
  faceB[4] = "B";

  const faceD = step2Final.slice(0, 9);
  const faceF = step2Final.slice(9, 18);
  const faceL = step2Final.slice(18, 27);
  faceD[4] = "D";
  faceF[4] = "F";
  faceL[4] = "L";
  
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Cube Detection System</h1>
      <p style={styles.statusText}>{status}</p>
      
      {/* ===== メイン2カラム ===== */}
      <div style={styles.mainLayout}>
        {/* ================= 左：カメラ ================= */}
        <div style={styles.leftColumn}>
          <div style={{ width: "100%" }}>
            <div style={styles.stepNavContainer}>
              <div style={{
                ...styles.stepNavItem,
                ...(currentStep === 1 ? styles.step1Active : styles.stepInactive)
              }}>
                <span style={styles.stepBadge}>01</span> First attempt: White, Blue and Red
              </div>
              <div style={{
                ...styles.stepNavItem,
                ...(currentStep === 2 ? styles.step2Active : styles.stepInactive)
              }}>
                <span style={styles.stepBadge}>02</span> Second attempt: Yellow, Green and Orange
              </div>
            </div>

            {/* プログレスバー */}
            {isScanning && (
              <div style={styles.progressContainer}>
                <h2 style={{
                  ...styles.progressText,
                  color: currentStep === 1 ? "#3b82f6" : "#10b981"
                }}>
                  Sampling... {progress}%
                </h2>
                <div style={styles.progressBarTrack}>
                  <div style={{
                    ...styles.progressBarFill,
                    width: `${progress}%`,
                    backgroundColor: currentStep === 1 ? "#3b82f6" : "#10b981",
                    boxShadow: currentStep === 1 ? "0 0 12px #3b82f6" : "0 0 12px #10b981"
                  }} />
                </div>
              </div>
            )}

            {/* カメラ */}
            <div style={styles.cameraWrapper}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ display: "none", transform: "scaleX(-1)" }}
              />

              <canvas ref={canvasRef} style={styles.canvas} />

              <div style={styles.hudContainer}>
                <div style={{
                  ...styles.hudBadge,
                  top: "6%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  borderColor: currentStep === 1 ? "#ffffff" : "#fbbf24",
                  boxShadow: currentStep === 1 ? "0 0 8px rgba(255,255,255,0.2)" : "0 0 8px rgba(251,191,36,0.2)"
                }}>
                  {currentStep === 1 ? "Centre: WHITE" : "Centre: YELLOW"}
                </div>

                <div style={{
                  ...styles.hudBadge,
                  bottom: "6%",
                  left: "6%",
                  borderColor: currentStep === 1 ? "#3b82f6" : "#f97316",
                  boxShadow: currentStep === 1 ? "0 0 8px rgba(59,130,246,0.2)" : "0 0 8px rgba(249,115,22,0.2)"
                }}>
                  {currentStep === 1 ? "Centre: BLUE" : "Centre: ORANGE"}
                </div>

                <div style={{
                  ...styles.hudBadge,
                  bottom: "6%",
                  right: "6%",
                  borderColor: currentStep === 1 ? "#ef4444" : "#10b981",
                  boxShadow: currentStep === 1 ? "0 0 8px rgba(239,68,68,0.2)" : "0 0 8px rgba(16,185,129,0.2)"
                }}>
                  {currentStep === 1 ? "Centre: RED" : "Centre: GREEN"}
                </div>
              </div>
            </div>
          </div>

          {/* ===== ボタンと画像エリアの複合コンテナ ===== */}
          <div style={styles.bottomActionArea}>
            <div style={styles.buttonContainer}>
              <button
                onClick={start10SecScan}
                disabled={isScanning}
                style={{
                  ...styles.btnMain,
                  background: currentStep === 1 
                    ? "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)" 
                    : "linear-gradient(135deg, #10b981 0%, #047857 100%)",
                  boxShadow: currentStep === 1 
                    ? "0 4px 20px rgba(59,130,246,0.4)" 
                    : "0 4px 20px rgba(16,185,129,0.4)",
                  opacity: isScanning ? 0.6 : 1,
                  cursor: isScanning ? "not-allowed" : "pointer"
                }}
              >
                {isScanning ? `Scanning (${progress}%)` : currentStep === 1 ? "Start first attempt" : "Start second attempt"}
              </button>

              <button
                onClick={resetAll}
                disabled={isScanning}
                style={{
                  ...styles.btnSecondary,
                  opacity: isScanning ? 0.5 : 1,
                  cursor: isScanning ? "not-allowed" : "pointer"
                }}
              >
                Scan again
              </button>
            </div>

            <div style={styles.imageSpace}>
              <img 
                src="/cube_image.png"
                alt="guide" 
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "12px" }} 
              /> 
            </div>
          </div>
        </div>

        {/* ================= 右：展開図 ＆ 3D切り替えエリア ================= */}
        <div style={styles.rightColumn}>
          {/* 🔄 表示切り替えタブ（トグル） */}
          <div style={styles.tabContainer}>
            <button onClick={() => setViewMode("net")} style={{...styles.tabButton, ...(viewMode === "net" ? styles.tabButtonActive : {})}}>
              Net View
            </button>
            <button onClick={() => setViewMode("3d")} style={{...styles.tabButton, ...(viewMode === "3d" ? styles.tabButtonActive : {})}}>
              3D View
            </button>
          </div>

          {/* 条件分岐によるビューの出し分け */}
          {viewMode === "net" ? (
            <div style={{ width: "100%" }}>
              <h3 style={styles.netTitle}>Net of a Cube</h3>

              <div style={styles.netGrid}>
                <div style={{ gridRow: "1", gridColumn: "2", textAlign: "center" }}>
                  <p style={styles.faceLabel}>U (WHITE)</p>
                  <CubeFaceGrid colors={faceU} faceName="U" onColorSelect={handleColorChange} />
                </div>

                <div style={{ gridRow: "2", gridColumn: "1", textAlign: "center" }}>
                  <p style={styles.faceLabel}>L (ORANGE)</p>
                  <CubeFaceGrid colors={faceL} faceName="L" onColorSelect={handleColorChange} />
                </div>

                <div style={{ gridRow: "2", gridColumn: "2", textAlign: "center" }}>
                  <p style={styles.faceLabel}>F (GREEN)</p>
                  <CubeFaceGrid colors={faceF} faceName="F" onColorSelect={handleColorChange} />
                </div>

                <div style={{ gridRow: "2", gridColumn: "3", textAlign: "center" }}>
                  <p style={styles.faceLabel}>R (RED)</p>
                  <CubeFaceGrid colors={faceR} faceName="R" onColorSelect={handleColorChange} />
                </div>

                <div style={{ gridRow: "3", gridColumn: "2", textAlign: "center" }}>
                  <p style={styles.faceLabel}>D (YELLOW)</p>
                  <CubeFaceGrid colors={faceD} faceName="D" onColorSelect={handleColorChange} />
                </div>

                <div style={{ gridRow: "4", gridColumn: "2", textAlign: "center" }}>
                  <p style={styles.faceLabel}>B (BLUE)</p>
                  <CubeFaceGrid colors={faceB} faceName="B" onColorSelect={handleColorChange} />
                </div>
              </div>
            </div>
          ) : (
            <div style={styles.threeDContainer}>
              <h3 style={styles.netTitle}>3D Interactive View</h3>
              
              {/* 💡 ここにThree.jsやCanvasコンポーネントを差し込めます */}
              <div style={styles.threeDPlaceholder}>
                <p style={{ color: "#64748b", fontSize: "13px", marginBottom: "8px" }}>
                  [ 3D Cube Interactive Canvas ]
                </p>
                <span style={{ fontSize: "11px", color: "#475569" }}>
                  (色データ連動確認用: U中心={faceU[4]}, F中心={faceF[4]})
                </span>
              </div>
              <p style={{ fontSize: "11px", color: "#94a3b8", textAlign: "center", marginTop: "12px", maxWidth: "260px" }}>
                ※このエリアにThree.jsや@react-three/fiberを導入することで、ドラッグで回転可能なリアルタイム3Dキューブを実装できます。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 🟩 各面のグリッドコンポーネント（ポップアップ修正機能付き）
function CubeFaceGrid({ 
  colors, 
  faceName, 
  onColorSelect 
}: { 
  colors: string[]; 
  faceName: string; 
  onColorSelect: (face: string, index: number, color: string) => void; 
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const colorMap: Record<string, string> = {
    U: "#ffffff", // White
    D: "#fbbf24", // Yellow
    B: "#3b82f6", // Blue
    F: "#10b981", // Green
    R: "#ef4444", // Red
    L: "#f97316", // Orange
    N: "#1e293b", // Unknown
  };

  return (
    <div style={styles.faceGridWrapper}>
      {colors.map((color, index) => {
        const bg = colorMap[color] ?? "#1e293b";
        const isCenter = index === 4; // 中心タイル判定
        const isEditing = editingIndex === index;

        return (
          <div
            key={index}
            style={{
              position: "relative", // ポップアップの基準にするため追加
              width: "22px",  // 26px -> 22px に縮小
              height: "22px", // 26px -> 22px に縮小
              backgroundColor: bg,
              borderRadius: "3px",
              boxSizing: "border-box",
              border: isCenter ? "2px solid rgba(255,255,255,0.8)" : "1px solid rgba(0,0,0,0.15)",
              boxShadow: isCenter ? "0 0 6px rgba(255,255,255,0.5)" : "none",
              transition: "background-color 0.3s ease",
              cursor: isCenter ? "default" : "pointer",
            }}
            onClick={() => {
              // 中心タイル以外はクリックでポップアップをトグル
              if (!isCenter) {
                setEditingIndex(isEditing ? null : index);
              }
            }}
          >
            {/* 🎨 簡易カラーピッカーポップアップ */}
            {isEditing && (
              <div 
                style={{
                  position: "absolute",
                  top: "28px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  backgroundColor: "#1e293b",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: "8px",
                  padding: "6px",
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 20px)",
                  gap: "6px",
                  zIndex: 100,
                  boxShadow: "0 10px 25px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.2)",
                }}
                onClick={(e) => e.stopPropagation()} // 親のclickイベント（閉じる挙動）を防止
              >
                {/* 選択可能な6色をループ（N以外） */}
                {Object.keys(colorMap).filter(k => k !== "N").map((cKey) => (
                  <div
                    key={cKey}
                    onClick={() => {
                      onColorSelect(faceName, index, cKey);
                      setEditingIndex(null); // 変更したら閉じる
                    }}
                    style={{
                      width: "20px",
                      height: "20px",
                      backgroundColor: colorMap[cKey],
                      borderRadius: "3px",
                      cursor: "pointer",
                      border: "1px solid rgba(0,0,0,0.4)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2)",
                      transition: "transform 0.1s ease",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.1)"}
                    onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// 🎨 スタイリッシュ・デザインシステム
const styles = {
  container: {
    padding: "30px 20px", // 上下パディングを 40px -> 30px へ削り全体の縦幅を圧縮
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    backgroundColor: "#090d16",
    minHeight: "100vh",
    color: "#f8fafc",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  title: {
    margin: "0 0 6px 0",
    color: "#ffffff",
    fontSize: "32px", // 36px -> 32px に微小化
    fontWeight: 800,
    letterSpacing: "-0.025em",
    background: "linear-gradient(to right, #ffffff, #94a3b8)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  statusText: {
    fontWeight: 500,
    fontSize: "13px",
    color: "#38bdf8", 
    backgroundColor: "rgba(56, 189, 248, 0.1)",
    padding: "4px 14px",
    borderRadius: "20px",
    border: "1px solid rgba(56, 189, 248, 0.2)",
    margin: "0 0 24px 0", // 余白を削減して上部に寄せる
    display: "inline-block",
  },
  mainLayout: {
    display: "flex",
    justifyContent: "center",
    alignItems: "stretch", // 左カラムと右カラムの高さを完全に揃える
    gap: "32px",          // 隙間を適度に狭めて詰める
    width: "100%",
    maxWidth: "1000px",
    flexWrap: "nowrap",    // PC表示ではみ出さないよう折り返しを防ぐ
  },
  leftColumn: {
    width: "440px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-between", 
  },
  stepNavContainer: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    marginBottom: "10px",
  },
  stepNavItem: {
    padding: "10px 14px", // 内側余白を少し詰める
    borderRadius: "12px",
    border: "1px solid",
    fontSize: "13px",
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: "10px",
    transition: "all 0.3s ease",
  },
  step1Active: {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    borderColor: "#3b82f6",
    color: "#3b82f6",
    boxShadow: "0 0 15px rgba(59,130,246,0.15)",
  },
  step2Active: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderColor: "#10b981",
    color: "#10b981",
    boxShadow: "0 0 15px rgba(16,185,129,0.15)",
  },
  stepInactive: {
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    color: "#64748b",
  },
  stepBadge: {
    fontSize: "10px",
    padding: "2px 6px",
    borderRadius: "6px",
    backgroundColor: "rgba(255,255,255,0.06)",
    fontFamily: "monospace",
  },
  progressContainer: {
    width: "100%",
    marginBottom: "12px",
  },
  progressText: {
    fontSize: "13px",
    fontWeight: 700,
    margin: "0 0 4px 0",
    textAlign: "left",
  },
  progressBarTrack: {
    width: "100%",
    height: "6px",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: "3px",
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    transition: "width 0.05s linear",
  },
  cameraWrapper: {
    position: "relative",
    width: "100%",
    borderRadius: "16px",
    overflow: "hidden",
    boxShadow: "0 20px 40px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.2) inset",
    border: "1px solid rgba(255,255,255,0.1)",
    backgroundColor: "#000",
  },
  canvas: {
    width: "100%",
    display: "block",
  },
  hudContainer: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
  },
  hudBadge: {
    position: "absolute",
    backgroundColor: "rgba(9, 13, 22, 0.85)",
    backdropFilter: "blur(4px)",
    color: "#f8fafc",
    padding: "4px 10px", // 上下左右を小さく
    borderRadius: "6px",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.05em",
    border: "1px solid",
  },
  bottomActionArea: {
    display: "flex",
    width: "100%",
    gap: "16px",
    marginTop: "16px",
  },
  buttonContainer: {
    flex: 2, 
    display: "flex",
    flexDirection: "column",
    gap: "20px", // 20px -> 12px
    marginTop: "4px"
  },
  btnMain: {
    width: "100%",
    padding: "12px 20px", // 縦パディングを小さく
    fontSize: "14px",
    fontWeight: 700,
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    transition: "transform 0.2s ease, opacity 0.2s ease",
  },
  btnSecondary: {
    width: "100%",
    padding: "12px 20px", // 縦パディングを小さく
    fontSize: "14px",
    fontWeight: 600,
    backgroundColor: "rgba(255,255,255,0.05)",
    color: "#e2e8f0",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "12px",
    transition: "background-color 0.2s ease",
  },
  imageSpace: {
    flex: 1, 
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "12px",
    backgroundColor: "rgba(255,255,255,0.02)", 
    border: "1px dashed rgba(255,255,255,0.1)", 
    filter: "saturate(0%)"
  },
  rightColumn: {
    backgroundColor: "rgba(22, 30, 49, 0.4)",
    backdropFilter: "blur(16px)",
    padding: "16px 28px 20px 28px", // 上下のパディングを小さく (24px -> 16px)
    borderRadius: "24px",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start", 
    alignItems: "center",
    minWidth: "360px",
  },
  tabContainer: {
    display: "flex",
    backgroundColor: "transparent",
    padding: "4px",
    borderRadius: "10px",
    marginBottom: "16px", // 下の余白を縮小 (24px -> 16px)
    border: "1px solid rgba(255,255,255,0.05)"
  },
  tabButton: {
    padding: "6px 14px", // ボタン自体のサイズもスマートに調整
    fontSize: "12px",
    fontWeight: 600,
    color: "#94a3b8",
    backgroundColor: "transparent",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  tabButtonActive: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    color: "#ffffff",
    boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
  },
  threeDContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  threeDPlaceholder: {
    width: "280px",  // 280px -> 240px
    height: "280px", // 280px -> 240px
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    border: "1px dashed rgba(255, 255, 255, 0.15)",
    borderRadius: "16px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "16px"
  },
  netTitle: {
    margin: "0 0 25px 0", // タイトル下の隙間を縮小 (25px -> 14px)
    fontSize: "18px",     // 18px -> 16px
    fontWeight: 700,
    color: "#ffffff",
    textAlign: "center",
    letterSpacing: "-0.01em",
  },
  netGrid: {
    display: "grid",
    gridTemplateRows: "repeat(4, auto)",
    gridTemplateColumns: "repeat(3, auto)",
    gap: "25px", // 各面ごとの隙間を半分に凝縮 (12px -> 6px)
    justifyContent: "center",
    alignItems: "center",
  },
  faceLabel: {
    margin: "0 0 2px 0", 
    fontSize: "10px",    // ラベルサイズを縮小
    fontWeight: 700,
    color: "#94a3b8",
    fontFamily: "monospace",
  },
  faceGridWrapper: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 22px)", // 26px -> 22px
    gap: "1px", // 枠内の隙間を 1px に
    border: "1px solid rgba(255,255,255,0.1)",
    padding: "2px",
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: "6px",
  }
} as const;