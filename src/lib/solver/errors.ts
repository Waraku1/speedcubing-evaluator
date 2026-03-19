/**
 * AppError とエラーコード定義
 *
 * 問題点: エラーコードが API 仕様と実装で乖離すると
 *         クライアントのエラーハンドリングが壊れる。
 *
 * 解決方針:
 *   - エラーコードを as const で厳密に定義
 *   - AppError は code を必須とする
 *   - isAppError 型ガードで instanceof の代替を提供
 *     （Worker からシリアライズされた Error は instanceof が機能しないため）
 */

// ── エラーコード定義（API 仕様と 1:1 対応） ───────────────────────────────
export const ERROR_CODES = {
  // Solver 系
  INVALID_CUBE_STATE: 'INVALID_CUBE_STATE',
  IMPOSSIBLE_CUBE_STATE: 'IMPOSSIBLE_CUBE_STATE',
  SOLVER_TIMEOUT: 'SOLVER_TIMEOUT',
  SOLVER_FAILED: 'SOLVER_FAILED',

  // 認証系
  UNAUTHORIZED: 'UNAUTHORIZED',

  // リソース系
  NOT_FOUND: 'NOT_FOUND',

  // バリデーション系
  VALIDATION_ERROR: 'VALIDATION_ERROR',

  // 汎用
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

// ── HTTP ステータスマップ（API 仕様通り） ──────────────────────────────────
export const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  SOLVER_TIMEOUT: 504,
  SOLVER_FAILED: 500,
  INVALID_CUBE_STATE: 422,
  IMPOSSIBLE_CUBE_STATE: 422,
  INTERNAL_ERROR: 500,
}

// ── AppError クラス ────────────────────────────────────────────────────────
export class AppError extends Error {
  readonly code: ErrorCode
  readonly details?: unknown
  readonly statusCode: number

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.details = details
    this.statusCode = ERROR_STATUS_MAP[code]

    // TypeScript で Error を継承する際に必要
    Object.setPrototypeOf(this, AppError.prototype)
  }
}

/**
 * 型ガード: Worker からシリアライズされた Error オブジェクトにも対応
 *
 * Worker ↔ Main thread 間では structuredClone が使われるため、
 * instanceof チェックが失敗することがある。
 * code プロパティの存在で判定する。
 */
export function isAppError(err: unknown): err is AppError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as Record<string, unknown>).code === 'string' &&
    (err as Record<string, unknown>).code in ERROR_STATUS_MAP
  )
}

/**
 * 任意のエラーを AppError に変換する
 * 予期しないエラーをAPI境界でキャッチする際に使う
 */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err
  if (isAppError(err)) {
    return new AppError(
      err.code as ErrorCode,
      (err as { message: string }).message,
      (err as { details?: unknown }).details
    )
  }
  const message = err instanceof Error ? err.message : String(err)
  return new AppError('INTERNAL_ERROR', message)
}
