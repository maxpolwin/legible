import type { Mat23, Vec2 } from './types'

export const IDENTITY: Mat23 = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

/** Compose: apply `n` first, then `m` (i.e. m ∘ n). */
export function mul(m: Mat23, n: Mat23): Mat23 {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  }
}

export function apply(m: Mat23, p: Vec2): Vec2 {
  return {
    x: m.a * p.x + m.c * p.y + m.e,
    y: m.b * p.x + m.d * p.y + m.f,
  }
}

export function translate(x: number, y: number): Mat23 {
  return { a: 1, b: 0, c: 0, d: 1, e: x, f: y }
}

export function scale(sx: number, sy: number): Mat23 {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 }
}

export function rotateDeg(deg: number): Mat23 {
  const r = (deg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  // SVG rotate() in y-down space.
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 }
}

export function invert(m: Mat23): Mat23 {
  const det = m.a * m.d - m.b * m.c
  if (det === 0) throw new Error('Matrix is not invertible')
  const ia = m.d / det
  const ib = -m.b / det
  const ic = -m.c / det
  const id = m.a / det
  return {
    a: ia,
    b: ib,
    c: ic,
    d: id,
    e: -(ia * m.e + ic * m.f),
    f: -(ib * m.e + id * m.f),
  }
}

export function isIdentity(m: Mat23, eps = 1e-9): boolean {
  return (
    Math.abs(m.a - 1) < eps &&
    Math.abs(m.b) < eps &&
    Math.abs(m.c) < eps &&
    Math.abs(m.d - 1) < eps &&
    Math.abs(m.e) < eps &&
    Math.abs(m.f) < eps
  )
}

/**
 * Convert a Figma `Transform` ([[a, c, e], [b, d, f]], row-major) to Mat23.
 */
export function fromFigmaTransform(t: [[number, number, number], [number, number, number]]): Mat23 {
  return { a: t[0][0], c: t[0][1], e: t[0][2], b: t[1][0], d: t[1][1], f: t[1][2] }
}
