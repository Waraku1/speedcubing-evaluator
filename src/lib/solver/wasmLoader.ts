/**
 * min2phase WASM ローダー
 *
 * 問題点: 現在はモック実装。実 WASM を統合する必要がある。
 *
 * 解決方針:
 *   1. /public/wasm/min2phase.js (emscripten ビルド) を動的 import
 *   2. WASM 初期化は起動時1回のみ（シングルトン）
 *   3. テスト環境・WASM なし環境ではフォールバックを提供
 *   4. Worker 内から呼ばれるため Node.js 互換の import を使う
 *
 * 理由: WASM init に 2秒かかるため、毎リクエストで初期化すると
 *       P95 が 8秒を超える。起動時に1回だけ初期化してシングルトン化する。
 */

export interface Min2PhaseWasm {
  /** Kociemba 2-phase でソルブ。成功時はスペース区切り手順文字列を返す。 */
  solve(stateString: string, maxDepth?: number, timeoutMs?: number): string
  /** WASM 初期化完了フラグ */
  isLoaded(): boolean
}

/** WASM シングルトン（Worker スコープで1つだけ保持） */
let wasmInstance: Min2PhaseWasm | null = null
let initPromise: Promise<Min2PhaseWasm> | null = null

/**
 * WASM を初期化して返す（シングルトン）
 *
 * 呼び出し例:
 *   const wasm = await loadWasm()
 *   const solution = wasm.solve(stateString)
 */
export async function loadWasm(): Promise<Min2PhaseWasm> {
  // 既に初期化済みならそのまま返す
  if (wasmInstance) return wasmInstance

  // 初期化中の Promise があれば待つ（並列呼び出し対策）
  if (initPromise) return initPromise

  initPromise = (async (): Promise<Min2PhaseWasm> => {
    // テスト環境では WASM を使わない（vi.mock で差し替え済みのはず）
    if (process.env.NODE_ENV === 'test') {
      return createMockWasm()
    }

    try {
      // Next.js の public ディレクトリから WASM ファイルを動的ロード
      // Worker 内では __dirname 相対パスを使う
      const wasmPath = process.env.WASM_PATH ?? './public/wasm/min2phase.js'

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const module = require(wasmPath)

      // emscripten ビルドの初期化パターン
      const instance = await new Promise<Min2PhaseWasm>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WASM init timeout')), 10_000)

        module({
          onRuntimeInitialized() {
            clearTimeout(timeout)
            resolve({
              solve: (stateString: string, maxDepth = 21, timeoutMs = 8_000) => {
                // min2phase の C API を呼び出す
                // 戻り値: "R U R' ..." (成功) or エラー文字列
                const result: string = module.ccall(
                  'solveCube',
                  'string',
                  ['string', 'number', 'number', 'number'],
                  [stateString, maxDepth, 0, timeoutMs]
                )
                if (result.startsWith('Error') || result.startsWith('error')) {
                  throw new Error(`min2phase: ${result}`)
                }
                return result.trim()
              },
              isLoaded: () => true,
            })
          },
        })
      })

      wasmInstance = instance
      return instance
    } catch (err) {
      // WASM ファイルが存在しない場合はモックにフォールバック
      // （開発環境でビルドせずに動かす場合）
      const isDev = process.env.NODE_ENV === 'development'
      if (isDev) {
        console.warn('[wasmLoader] min2phase.js not found, using mock solver. Build WASM for production.')
        wasmInstance = createMockWasm()
        return wasmInstance
      }
      throw err
    }
  })()

  return initPromise
}

/**
 * テスト・開発用モック WASM
 *
 * 実際には Kociemba 解を生成できないが、
 * API の動作確認・テストには十分な固定値を返す。
 */
function createMockWasm(): Min2PhaseWasm {
  // よく使われる OLL/PLL スクランブルに対する既知の解
  const KNOWN_SOLUTIONS: Record<string, string> = {
    // Solved state → 解なし
    'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB': '',
  }

  return {
    solve(stateString: string): string {
      if (KNOWN_SOLUTIONS[stateString] !== undefined) {
        return KNOWN_SOLUTIONS[stateString]
      }
      // モックはランダムな有効っぽい解を返す（テスト用）
      return "R U R' U' R' F R2 U' R' U' R U R' F'"
    },
    isLoaded: () => true,
  }
}

/**
 * WASM キャッシュをリセットする（テスト用）
 */
export function resetWasmCache(): void {
  wasmInstance = null
  initPromise = null
}
