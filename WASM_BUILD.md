# min2phase WASM ビルド手順

## 問題
`lib/solver/wasmLoader.ts` が参照する `public/wasm/min2phase.js` が存在しない。  
現在はモック（フォールバック）で動作しているが、本番品質の解を得るには実 WASM が必要。

---

## ビルド手順

### 1. Emscripten SDK のセットアップ

```bash
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
```

### 2. min2phase C++ ソースの取得

```bash
# 公式リポジトリ（C++ 版）
git clone https://github.com/cs0x7f/min2phase.git
cd min2phase
```

### 3. WASM ビルド

```bash
emcc \
  min2phase.cpp \
  -O2 \
  -o public/wasm/min2phase.js \
  -s EXPORTED_FUNCTIONS='["_solveCube", "_malloc", "_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall", "cwrap"]' \
  -s MODULARIZE=1 \
  -s EXPORT_NAME='Min2Phase' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s ENVIRONMENT='node'
```

> **補足**: `-s ENVIRONMENT='node'` は Worker スレッド内で使うため必要。  
> ブラウザ（将来的な client-side 対応）なら `'web,worker'` に変更する。

### 4. 生成ファイルの確認

```
public/
└── wasm/
    ├── min2phase.js      ← JS グルーコード（require 対象）
    └── min2phase.wasm    ← バイナリ（自動ロード）
```

### 5. 動作確認

```bash
# Node.js で直接テスト
node -e "
const m = require('./public/wasm/min2phase.js');
m({ onRuntimeInitialized() {
  const sol = m.ccall('solveCube','string',['string','number','number','number'],
    ['UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB', 21, 0, 8000]);
  console.log('Solved state solution:', sol || '(already solved)');
}});
"
```

### 6. 代替案: npm パッケージ版

公式 WASM ビルド済みパッケージが存在する場合はそちらを利用可能：

```bash
npm install cube-solver  # または min2phase-wasm
```

`wasmLoader.ts` の `require(wasmPath)` 部分を npm パッケージの import に変更する。

---

## 開発環境での動作（WASM なし）

`NODE_ENV=development` では `wasmLoader.ts` が自動的にモックにフォールバックする。  
モックは固定の解を返すため、API の動作確認・UI 開発には十分。

```
[wasmLoader] min2phase.js not found, using mock solver. Build WASM for production.
```

このログが出ていれば正常（モック動作中）。

---

## CI での扱い

- Unit / Integration テスト: WASM 不要（vi.mock で差し替え）
- E2E テスト: モック WASM を使用（固定解を返す）
- 本番デプロイ: ビルド済み WASM を `public/wasm/` に含めてデプロイ

Vercel へのデプロイ時は `vercel.json` の `functions` 設定で  
Worker スレッドの実行を許可する必要がある（後述の Phase 3 参照）。
