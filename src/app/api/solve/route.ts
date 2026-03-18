import { NextRequest, NextResponse } from 'next/server'
import { solve } from '@/lib/solver/solver'
import { CubeState } from '@/types/cube'

export async function POST(req: NextRequest) {
  const body: { state: CubeState } = await req.json()

  const solution = solve(body.state)

  return NextResponse.json({ solution })
}