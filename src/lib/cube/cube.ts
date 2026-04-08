// src/lib/cube/cube.ts

import { Cube } from "cubing"

export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B'
export type Color = Face
export type Move =
  | 'U' | "U'" | 'U2'
  | 'R' | "R'" | 'R2'
  | 'F' | "F'" | 'F2'
  | 'D' | "D'" | 'D2'
  | 'L' | "L'" | 'L2'
  | 'B' | "B'" | 'B2'

export type CubeState = Record<Face, Color[]>

const FACE_ORDER: Face[] = ['U','R','F','D','L','B']

export const SOLVED_STATE: CubeState = {
  U: Array(9).fill('U'),
  R: Array(9).fill('R'),
  F: Array(9).fill('F'),
  D: Array(9).fill('D'),
  L: Array(9).fill('L'),
  B: Array(9).fill('B'),
}

// ----------------------
// cubing.js → sticker 変換
// ----------------------

function cubeToSticker(cube: Cube): CubeState {
  const facelets = cube.toString() // 54文字（URFDLB順）

  const res = {} as CubeState

  for (let i = 0; i < 6; i++) {
    const face = FACE_ORDER[i]
    res[face] = facelets
      .slice(i*9, i*9+9)
      .split('') as Color[]
  }

  return res
}

function stickerToCube(state: CubeState): Cube {
  const str = FACE_ORDER.map(f => state[f].join('')).join('')
  return Cube.fromString(str)
}

// ----------------------
// Core
// ----------------------

export function applySingleMove(state: CubeState, move: Move): CubeState {
  const cube = stickerToCube(state)

  cube.move(move)

  return cubeToSticker(cube)
}

export function applyMoves(state: CubeState, moves: Move[]): CubeState {
  const cube = stickerToCube(state)

  cube.move(moves.join(' '))

  return cubeToSticker(cube)
}

export function isSolvedState(cube: CubeState): boolean {
  return FACE_ORDER.every(f =>
    cube[f].every(c => c === cube[f][4])
  )
}

// ----------------------
// 既存API（そのまま）
// ----------------------

export function serializeCubeState(cube: CubeState): string {
  return FACE_ORDER.map(f => cube[f].join('')).join('')
}

export function parseCubeState(str: string): CubeState {
  if (str.length !== 54) throw new Error('Invalid length')

  const cube = {} as CubeState

  for (let i = 0; i < 6; i++) {
    const face = FACE_ORDER[i]
    const arr = str.slice(i*9, i*9+9).split('') as Color[]

    if (!arr.every(c => FACE_ORDER.includes(c as Face))) {
      throw new Error('Invalid color')
    }

    cube[face] = arr
  }

  return cube
}

export function isValidCubeState(cube: CubeState): boolean {
  const count: Record<string, number> = {}

  for (const f of FACE_ORDER) {
    if (!cube[f] || cube[f].length !== 9) return false
    for (const c of cube[f]) {
      count[c] = (count[c] || 0) + 1
    }
  }

  return FACE_ORDER.every(f => count[f] === 9)
}

// ----------------------

export function invertMoves(moves: Move[]): Move[] {
  return [...moves].reverse().map(m => {
    if (m.endsWith("'")) return m.slice(0,-1) as Move
    if (m.endsWith('2')) return m
    return (m+"'") as Move
  })
}

export function cancelMoves(moves: Move[]): Move[] {
  const stack: Move[] = []

  const getBase = (m: Move) => m[0]
  const getAmount = (m: Move) =>
    m.endsWith('2') ? 2 :
    m.endsWith("'") ? 3 : 1

  for (const m of moves) {
    if (!stack.length) {
      stack.push(m)
      continue
    }

    const last = stack[stack.length - 1]

    if (getBase(last) !== getBase(m)) {
      stack.push(m)
      continue
    }

    const total = (getAmount(last) + getAmount(m)) % 4
    stack.pop()

    if (total === 1) stack.push(getBase(m) as Move)
    if (total === 2) stack.push((getBase(m) + '2') as Move)
    if (total === 3) stack.push((getBase(m) + "'") as Move)
  }

  return stack
}