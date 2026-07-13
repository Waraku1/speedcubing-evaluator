import * as ort from "onnxruntime-web";
import { runInference } from "./src/lib/detect/visionOnnx"; // パスは環境に合わせて調整してください

async function main() {
  const video = document.getElementById("webcam") as HTMLVideoElement;
  const statusDiv = document.getElementById("status")!;
  const outputDiv = document.getElementById("output")!;

  // 1. Webカメラの起動
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream;
  } catch (err) {
    statusDiv.innerText = "カメラの起動に失敗しました: " + err;
    return;
  }

  // 2. ONNXモデルの読み込み
  try {
    // ⚠️ ご自身が用意した YOLOv8 のモデルファイル (.onnx) のパスを指定してください
    const session = await ort.InferenceSession.create("/model.onnx", {
      executionProviders: ["wasm"], 
    });
    statusDiv.innerText = "モデル読み込み完了！カメラにキューブをかざしてください。";

    // 3. ループさせて推論を実行
    async function tick() {
      // 一旦 Step 1面 (U, F, R) の検出テストとして実行
      const result = await runInference(session, video, 1);
      
      if (result) {
        outputDiv.innerText = `検出成功！\n色リスト:\n${JSON.stringify(result.colors)}`;
      } else {
        outputDiv.innerText = "キューブを探索中...";
      }
      requestAnimationFrame(tick);
    }
    tick();

  } catch (err) {
    statusDiv.innerText = "モデルの読み込みに失敗しました: " + err;
  }
}

main();