/**
 * テスト専用認証エンドポイント
 *
 * 問題点: E2E テストで Google/GitHub OAuth を使うと
 *         外部サービス依存になり CI で動かない。
 *
 * 解決方針:
 *   - NODE_ENV=test のときのみ有効な /api/test/auth エンドポイント
 *   - NextAuth の signIn をバイパスして直接セッションを作成する
 *   - 本番環境では 404 を返す（絶対にアクセスできない）
 *
 * 理由: E2E テストの auth.setup.ts から呼ばれる。
 *       storageState パターンで1回だけ使用される。
 */
import { NextRequest, NextResponse } from 'next/server'
import { encode } from 'next-auth/jwt'

export async function GET(req: NextRequest): Promise<NextResponse> {
  // 本番環境では絶対に使えないようにする
  if (process.env.NODE_ENV !== 'test') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const action = req.nextUrl.searchParams.get('action')

  if (action === 'login') {
    const secret = process.env.NEXTAUTH_SECRET
    if (!secret) {
      return NextResponse.json({ error: 'NEXTAUTH_SECRET not set' }, { status: 500 })
    }

    // テスト用セッションJWTを生成
    const token = await encode({
      token: {
        sub: 'test-user-id',
        email: 'e2e-test@example.com',
        name: 'E2E Test User',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400,
      },
      secret,
    })

    // セッションクッキーをセット
    const cookieName = process.env.NODE_ENV === 'production'
      ? '__Secure-next-auth.session-token'
      : 'next-auth.session-token'

    const res = NextResponse.redirect(new URL('/', req.url))
    res.cookies.set(cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 86400,
    })
    return res
  }

  if (action === 'logout') {
    const res = NextResponse.redirect(new URL('/', req.url))
    res.cookies.delete('next-auth.session-token')
    res.cookies.delete('__Secure-next-auth.session-token')
    return res
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
