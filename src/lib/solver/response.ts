/**
 * API レスポンス生成ユーティリティ
 *
 * 問題点: 各 Route Handler がレスポンス形式をバラバラに作ると
 *         フロントエンドの型定義と乖離する。
 *
 * 解決方針:
 *   - ApiSuccess<T> / ApiError を必ずこのファイル経由で生成
 *   - エラーは AppError を受け取ってステータスコードを自動解決
 *   - Next.js の NextResponse.json を薄くラップするだけ
 */
import { NextResponse } from 'next/server'
import { AppError, toAppError, isAppError } from './errors'
import type { ApiSuccess, ApiError as ApiErrorType } from '@/types/api'

/**
 * 成功レスポンス: { success: true, data: T }
 */
export function apiSuccess<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ success: true, data }, { status })
}

/**
 * エラーレスポンス: { success: false, error: { code, message, details? } }
 *
 * AppError → ステータスコード自動解決
 * 未知のエラー → 500 INTERNAL_ERROR に変換
 */
export function apiError(err: unknown): NextResponse<ApiErrorType> {
  const appErr = toAppError(err)

  const body: ApiErrorType = {
    success: false,
    error: {
      code: appErr.code,
      message: appErr.message,
      ...(appErr.details !== undefined && { details: appErr.details }),
    },
  }

  return NextResponse.json(body, { status: appErr.statusCode })
}

/**
 * バリデーションエラー専用ショートカット
 */
export function validationError(message: string, details?: unknown): NextResponse<ApiErrorType> {
  return apiError(new AppError('VALIDATION_ERROR', message, details))
}

/**
 * 未認証エラー専用ショートカット
 */
export function unauthorizedError(): NextResponse<ApiErrorType> {
  return apiError(new AppError('UNAUTHORIZED', 'Authentication required'))
}

/**
 * Not Found エラー専用ショートカット
 */
export function notFoundError(resource = 'Resource'): NextResponse<ApiErrorType> {
  return apiError(new AppError('NOT_FOUND', `${resource} not found`))
}
