/**
 * SVG path-data transformation for the outline fallback (FR-5).
 *
 * Figma's outlined-text export produces absolute M/L/C/Q/Z path data, but we
 * normalize defensively: relative commands are absolutized, H/V become L,
 * S/T are expanded to C/Q. Arcs (A) are not produced by text outlining; if
 * one appears the caller falls back to raster for that node.
 */

import { apply } from './matrix'
import type { Mat23 } from './types'

export class UnsupportedPathCommandError extends Error {}

interface Point {
  x: number
  y: number
}

type AbsCommand =
  | { cmd: 'M'; p: Point }
  | { cmd: 'L'; p: Point }
  | { cmd: 'C'; c1: Point; c2: Point; p: Point }
  | { cmd: 'Q'; c1: Point; p: Point }
  | { cmd: 'Z' }

function tokenizePath(d: string): Array<string | number> {
  const tokens: Array<string | number> = []
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(d)) !== null) {
    tokens.push(m[1] !== undefined ? m[1] : parseFloat(m[2]))
  }
  return tokens
}

/** Parse path data into absolute M/L/C/Q/Z commands. */
export function parsePathData(d: string): AbsCommand[] {
  const tokens = tokenizePath(d)
  const out: AbsCommand[] = []
  let i = 0
  let cur: Point = { x: 0, y: 0 }
  let start: Point = { x: 0, y: 0 }
  let prevCubicCtrl: Point | null = null
  let prevQuadCtrl: Point | null = null
  let cmd = ''

  const num = (): number => {
    const t = tokens[i++]
    if (typeof t !== 'number') throw new UnsupportedPathCommandError(`Expected number in path data, got ${String(t)}`)
    return t
  }

  while (i < tokens.length) {
    const t = tokens[i]
    if (typeof t === 'string') {
      cmd = t
      i++
    } else if (cmd === 'M') {
      cmd = 'L' // Implicit lineto after moveto.
    } else if (cmd === 'm') {
      cmd = 'l'
    }
    const rel = cmd === cmd.toLowerCase() && cmd !== 'Z' && cmd !== 'z'
    const dx = rel ? cur.x : 0
    const dy = rel ? cur.y : 0

    switch (cmd.toUpperCase()) {
      case 'M': {
        cur = { x: num() + dx, y: num() + dy }
        start = cur
        out.push({ cmd: 'M', p: cur })
        prevCubicCtrl = prevQuadCtrl = null
        break
      }
      case 'L': {
        cur = { x: num() + dx, y: num() + dy }
        out.push({ cmd: 'L', p: cur })
        prevCubicCtrl = prevQuadCtrl = null
        break
      }
      case 'H': {
        cur = { x: num() + dx, y: cur.y }
        out.push({ cmd: 'L', p: cur })
        prevCubicCtrl = prevQuadCtrl = null
        break
      }
      case 'V': {
        cur = { x: cur.x, y: num() + dy }
        out.push({ cmd: 'L', p: cur })
        prevCubicCtrl = prevQuadCtrl = null
        break
      }
      case 'C': {
        const c1 = { x: num() + dx, y: num() + dy }
        const c2 = { x: num() + dx, y: num() + dy }
        cur = { x: num() + dx, y: num() + dy }
        out.push({ cmd: 'C', c1, c2, p: cur })
        prevCubicCtrl = c2
        prevQuadCtrl = null
        break
      }
      case 'S': {
        const c1 = prevCubicCtrl ? { x: 2 * cur.x - prevCubicCtrl.x, y: 2 * cur.y - prevCubicCtrl.y } : cur
        const c2 = { x: num() + dx, y: num() + dy }
        cur = { x: num() + dx, y: num() + dy }
        out.push({ cmd: 'C', c1, c2, p: cur })
        prevCubicCtrl = c2
        prevQuadCtrl = null
        break
      }
      case 'Q': {
        const c1 = { x: num() + dx, y: num() + dy }
        cur = { x: num() + dx, y: num() + dy }
        out.push({ cmd: 'Q', c1, p: cur })
        prevQuadCtrl = c1
        prevCubicCtrl = null
        break
      }
      case 'T': {
        const c1: Point = prevQuadCtrl ? { x: 2 * cur.x - prevQuadCtrl.x, y: 2 * cur.y - prevQuadCtrl.y } : cur
        cur = { x: num() + dx, y: num() + dy }
        out.push({ cmd: 'Q', c1, p: cur })
        prevQuadCtrl = c1
        prevCubicCtrl = null
        break
      }
      case 'Z': {
        cur = start
        out.push({ cmd: 'Z' })
        prevCubicCtrl = prevQuadCtrl = null
        break
      }
      case 'A':
        throw new UnsupportedPathCommandError('Arc commands are not supported in the outline fallback')
      default:
        throw new UnsupportedPathCommandError(`Unsupported path command: ${cmd}`)
    }
  }
  return out
}

function fmt(n: number): string {
  const rounded = Math.round(n * 1000) / 1000
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

/** Apply an affine transform to path data, returning absolute path data. */
export function transformPathData(d: string, m: Mat23): string {
  const commands = parsePathData(d)
  const parts: string[] = []
  const pt = (p: Point): string => {
    const q = apply(m, p)
    return `${fmt(q.x)} ${fmt(q.y)}`
  }
  for (const command of commands) {
    switch (command.cmd) {
      case 'M':
        parts.push(`M ${pt(command.p)}`)
        break
      case 'L':
        parts.push(`L ${pt(command.p)}`)
        break
      case 'C':
        parts.push(`C ${pt(command.c1)} ${pt(command.c2)} ${pt(command.p)}`)
        break
      case 'Q':
        parts.push(`Q ${pt(command.c1)} ${pt(command.p)}`)
        break
      case 'Z':
        parts.push('Z')
        break
    }
  }
  return parts.join(' ')
}
