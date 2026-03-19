/**
 * Solver Worker スレッド
 *
 * 問題点: Worker 内の WASM 初期化とメインスレッドとのメッセージ仕様が
 *         実装と乖離している可能性がある。
 *
 * 解決方針:
 *   1. Worker 起動時に WASM を初期化（起動時1回）
 *   2. メッセージプロトコルを型定義で厳密に管理
 *   3. エラー時は code 付きの構造化エラーを返す
 *   4. graceful shutdown（'shutdown' メッセージ）を実装
 *
 * このファイルは worker_threads として実行されるため、
 * parentPort でのみ通信する。
 */
import { parentPort } from 'worker_threads'
import { loadWasm } from '@/lib/solver/wasmLoader'
import { parseStateString, isValidCubeState } from '@/lib/cube/cube'

// ── メッセージ型定義 ───────────────────────────────────────────────────────
interface SolveRequest {
  type: 'solve'
  id: string        // 要求の識別子（Pool が並列管理に使う）
  stateString: string
}

interface ShutdownRequest {
  type: 'shutdown'
}

type WorkerRequest = SolveRequest | ShutdownRequest

interface SolveSuccess {
  type: 'success'
  id: string
  moves: string[]
  movesString: string
  htm: number
  qtm: number
  timeMs: number
}

interface SolveError {
  type: 'error'
  id: string
  code: 'INVALID_CUBE_STATE' | 'IMPOSSIBLE_CUBE_STATE' | 'SOLVER_FAILED' | 'SOLVER_TIMEOUT'
  message: string
}

type WorkerResponse = SolveSuccess | SolveError

// ── Worker 初期化 ─────────────────────────────────────────────────────────
if (!parentPort) {
  throw new Error('This file must be run as a worker thread')
}

// WASM を起動時に非同期で初期化
// parentPort が null でないことは上で確認済み
const port = parentPort

let wasmReady = false

;(async () => {
  try {
    await loadWasm()
    wasmReady = true
    port.postMessage({ type: 'ready' })
  } catch (err) {
    port.postMessage({
      type: 'init_error',
      message: err instanceof Error ? err.message : String(err),
    })
  }
})()

// ── メッセージハンドラ ─────────────────────────────────────────────────────
port.on('message', async (req: WorkerRequest) => {
  if (req.type === 'shutdown') {
    process.exit(0)
  }

  if (req.type !== 'solve') return

  const { id, stateString } = req

  // WASM 未初期化の場合
  if (!wasmReady) {
    const res: SolveError = {
      type: 'error',
      id,
      code: 'SOLVER_FAILED',
      message: 'WASM not initialized',
    }
    port.postMessage(res)
    return
  }

  try {
    // ── バリデーション ─────────────────────────────────────────────────
    let cubeState
    try {
      cubeState = parseStateString(stateString)
    } catch {
      port.postMessage({
        type: 'error', id,
        code: 'INVALID_CUBE_STATE',
        message: 'Invalid cube state string format',
      } satisfies SolveError)
      return
    }

    if (!isValidCubeState(cubeState)) {
      port.postMessage({
        type: 'error', id,
        code: 'IMPOSSIBLE_CUBE_STATE',
        message: 'Cube state is physically impossible (sticker counts invalid)',
      } satisfies SolveError)
      return
    }

    // ── WASM でソルブ ──────────────────────────────────────────────────
    const wasm = await loadWasm()
    const startTime = Date.now()

    let solutionStr: string
    try {
      solutionStr = wasm.solve(stateString, 21, 8_000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('timeout') || msg.includes('Timeout')) {
        port.postMessage({
          type: 'error', id,
          code: 'SOLVER_TIMEOUT',
          message: 'Solver timed out after 8 seconds',
        } satisfies SolveError)
      } else {
        port.postMessage({
          type: 'error', id,
          code: 'SOLVER_FAILED',
          message: msg,
        } satisfies SolveError)
      }
      return
    }

    const timeMs = Date.now() - startTime

    // ── 結果のパース ───────────────────────────────────────────────────
    const moves = solutionStr.length > 0
      ? solutionStr.split(' ').filter(Boolean)
      : []

    // HTM: 各手を1手とカウント（U2, R2 も1手）
    const htm = moves.length

    // QTM: U2 = 2手、それ以外 = 1手
    const qtm = moves.reduce((sum, m) => sum + (m.endsWith('2') ? 2 : 1), 0)

    const res: SolveSuccess = {
      type: 'success',
      id,
      moves,
      movesString: moves.join(' '),
      htm,
      qtm,
      timeMs,
    }
    port.postMessage(res)
  } catch (err) {
    // 予期しないエラー
    port.postMessage({
      type: 'error', id,
      code: 'SOLVER_FAILED',
      message: err instanceof Error ? err.message : 'Unknown error',
    } satisfies SolveError)
  }
})
