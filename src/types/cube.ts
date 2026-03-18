export type Face = 'U' | 'D' | 'L' | 'R' | 'F' | 'B'

export type CubeState = {
  faces: Record<Face, string[]>
}