export type ApiSuccess<T> = {
  success: true
  data: T
}

export type ApiError = {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export type SolveResponse = {
  moves: string[]
  movesString: string
  htm: number
  qtm: number
  timeMs: number
  steps: Array<{
    move: string
    state?: string
  }>
}
