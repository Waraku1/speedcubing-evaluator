/**
 * Solver Worker Pool
 *
 * 問題点:
 *   1. Worker タイムアウト後の terminate → 新 Worker 生成のサイクルが
 *      リソースリークを引き起こす可能性
 *   2. graceful shutdown がない（Next.js dev reload で残留 Worker が蓄積）
 *   3. WASM 初期化完了を待たずにリクエストを送ると SOLVER_FAILED
 *
 * 解決方針:
 *   1. 各 Worker に 'ready' 待機フェーズを追加
 *   2. Promise マップで要求を追跡し、タイムアウト時は確実に reject → cleanup
 *   3. SIGTERM / SIGINT で全 Worker を graceful shutdown
 *   4. 設計: POOL_SIZE = min(CPU-1, 4) は変更しない
 */
import { Worker } from 'worker_threads'
import { cpus } from 'os'
import path from 'path'
import { LRUCache } from '@/server/lib/cache/lruCache'
import { AppError } from '@/server/lib/errors'
import type { SolveResponse } from '@/types/api'

// ── 定数（設計で決定済み、変更禁止） ──────────────────────────────────────
const POOL_SIZE = Math.min(cpus().length - 1, 4) || 1
const SOLVE_TIMEOUT_MS = 8_000
const WORKER_SCRIPT = path.resolve(__dirname, './solverWorker.js')

// ── キャッシュ（LRU 500件, TTL 30分） ──────────────────────────────────────
const solveCache = new LRUCache<string, SolveResponse>(500, {
  ttlMs: 30 * 60 * 1000,
})

// ── Worker ラッパー ────────────────────────────────────────────────────────
interface WorkerSlot {
  worker: Worker
  busy: boolean
  ready: boolean  // WASM 初期化完了フラグ
}

type PendingRequest = {
  resolve: (res: SolveResponse) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

class SolverWorkerPool {
  private slots: WorkerSlot[] = []
  private queue: Array<{ stateString: string } & PendingRequest> = []
  private pendingRequests = new Map<string, PendingRequest>()
  private requestCounter = 0

  constructor() {
    for (let i = 0; i < POOL_SIZE; i++) {
      this.createWorkerSlot()
    }
    this.registerShutdownHandlers()
  }

  // ── Worker の作成 ────────────────────────────────────────────────────────
  private createWorkerSlot(): WorkerSlot {
    const worker = new Worker(WORKER_SCRIPT)
    const slot: WorkerSlot = { worker, busy: false, ready: false }

    worker.on('message', (msg) => {
      if (msg.type === 'ready') {
        slot.ready = true
        this.processQueue()
        return
      }

      if (msg.type === 'init_error') {
        console.error('[SolverPool] Worker WASM init failed:', msg.message)
        return
      }

      // solve の応答
      const pending = this.pendingRequests.get(msg.id)
      if (!pending) return

      clearTimeout(pending.timer)
      this.pendingRequests.delete(msg.id)
      slot.busy = false

      if (msg.type === 'success') {
        pending.resolve({
          moves: msg.moves,
          movesString: msg.movesString,
          htm: msg.htm,
          qtm: msg.qtm,
          timeMs: msg.timeMs,
          steps: [],  // steps は上位レイヤーで生成
        })
      } else {
        pending.reject(
          new AppError(msg.code, msg.message)
        )
      }

      this.processQueue()
    })

    worker.on('error', (err) => {
      // Worker がクラッシュした場合、スロットを再生成
      console.error('[SolverPool] Worker error:', err.message)
      const idx = this.slots.indexOf(slot)
      if (idx !== -1) {
        this.slots.splice(idx, 1)
        this.createWorkerSlot()
      }
    })

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.warn(`[SolverPool] Worker exited with code ${code}, regenerating`)
        const idx = this.slots.indexOf(slot)
        if (idx !== -1) {
          this.slots.splice(idx, 1)
          this.createWorkerSlot()
        }
      }
    })

    this.slots.push(slot)
    return slot
  }

  // ── リクエストの処理 ─────────────────────────────────────────────────────
  async solve(stateString: string): Promise<SolveResponse> {
    // キャッシュ確認
    const cached = solveCache.get(stateString)
    if (cached) return cached

    return new Promise<SolveResponse>((resolve, reject) => {
      const id = `req-${++this.requestCounter}`
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        // タイムアウトした Worker を terminate して再生成
        for (const slot of this.slots) {
          if (slot.busy) {
            slot.worker.terminate()
            const idx = this.slots.indexOf(slot)
            if (idx !== -1) {
              this.slots.splice(idx, 1)
              this.createWorkerSlot()
            }
            break
          }
        }
        reject(new AppError('SOLVER_TIMEOUT', `Solver timed out after ${SOLVE_TIMEOUT_MS}ms`))
      }, SOLVE_TIMEOUT_MS)

      const pending: PendingRequest = { resolve, reject, timer }
      this.queue.push({ stateString, ...pending, resolve, reject, timer })
      this.pendingRequests.set(id, pending)
      this.processQueue()
    }).then(result => {
      // キャッシュに保存
      solveCache.set(stateString, result)
      return result
    })
  }

  private processQueue(): void {
    while (this.queue.length > 0) {
      const freeSlot = this.slots.find(s => !s.busy && s.ready)
      if (!freeSlot) break

      const request = this.queue.shift()!
      const id = `req-${this.requestCounter}`
      freeSlot.busy = true
      this.pendingRequests.set(id, {
        resolve: request.resolve,
        reject: request.reject,
        timer: request.timer,
      })

      freeSlot.worker.postMessage({
        type: 'solve',
        id,
        stateString: request.stateString,
      })
    }
  }

  // ── Graceful Shutdown ──────────────────────────────────────────────────
  async shutdown(): Promise<void> {
    for (const slot of this.slots) {
      try {
        slot.worker.postMessage({ type: 'shutdown' })
        await slot.worker.terminate()
      } catch {
        // ignore
      }
    }
    this.slots = []
    this.queue = []
    this.pendingRequests.clear()
  }

  private registerShutdownHandlers(): void {
    const cleanup = async () => {
      await this.shutdown()
      process.exit(0)
    }
    process.once('SIGTERM', cleanup)
    process.once('SIGINT', cleanup)
  }
}

// ── シングルトンエクスポート ───────────────────────────────────────────────
export const solverPool = new SolverWorkerPool()
