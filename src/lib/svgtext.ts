/**
 * Extraction of positioned text runs and vector paths from Figma's SVG
 * export output.
 *
 * With `svgOutlineText: false`, Figma emits real `<text>`/`<tspan>` elements
 * carrying per-fragment baseline coordinates — this is what makes
 * pixel-perfect true-text placement possible without re-implementing
 * Figma's line layout. Each tspan is one style run on one visual line.
 */

import { IDENTITY, mul, rotateDeg, scale as scaleMat, translate } from './matrix'
import type { Mat23 } from './types'
import { parseXml, textContent, walkXml, type XmlElement } from './xml'

export interface SvgTextAttrs {
  fontFamily: string | null
  fontSize: number | null
  fontWeight: string | null
  fontStyle: string | null
  fill: string | null
  fillOpacity: number | null
  letterSpacing: number | null
  textDecoration: string | null
}

export interface SvgTextRun {
  text: string
  x: number
  y: number
  transform: Mat23
  attrs: SvgTextAttrs
}

export interface SvgPathElement {
  d: string
  fill: string | null
  fillOpacity: number
  fillRule: 'nonzero' | 'evenodd'
  transform: Mat23
}

/** Parse an SVG `transform` attribute (matrix/translate/scale/rotate). */
export function parseSvgTransform(value: string | undefined): Mat23 {
  if (!value) return IDENTITY
  let m = IDENTITY
  const re = /(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(value)) !== null) {
    const args = match[2]
      .split(/[\s,]+/)
      .filter((s) => s.length > 0)
      .map(Number)
    switch (match[1]) {
      case 'matrix':
        if (args.length === 6) {
          m = mul(m, { a: args[0], b: args[1], c: args[2], d: args[3], e: args[4], f: args[5] })
        }
        break
      case 'translate':
        m = mul(m, translate(args[0] ?? 0, args[1] ?? 0))
        break
      case 'scale':
        m = mul(m, scaleMat(args[0] ?? 1, args[1] ?? args[0] ?? 1))
        break
      case 'rotate':
        if (args.length >= 3) {
          m = mul(m, mul(translate(args[1], args[2]), mul(rotateDeg(args[0]), translate(-args[1], -args[2]))))
        } else {
          m = mul(m, rotateDeg(args[0] ?? 0))
        }
        break
    }
  }
  return m
}

function styleDeclarations(el: XmlElement): Record<string, string> {
  const style = el.attrs['style']
  if (!style) return {}
  const out: Record<string, string> = {}
  for (const decl of style.split(';')) {
    const i = decl.indexOf(':')
    if (i === -1) continue
    out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim()
  }
  return out
}

function prop(el: XmlElement, name: string): string | null {
  const decls = styleDeclarations(el)
  return decls[name] ?? el.attrs[name] ?? null
}

function inheritAttrs(chain: XmlElement[], base: SvgTextAttrs): SvgTextAttrs {
  const out = { ...base }
  for (const el of chain) {
    const family = prop(el, 'font-family')
    if (family !== null) out.fontFamily = family.replace(/^['"]|['"]$/g, '')
    const size = prop(el, 'font-size')
    if (size !== null) out.fontSize = parseFloat(size)
    const weight = prop(el, 'font-weight')
    if (weight !== null) out.fontWeight = weight
    const fstyle = prop(el, 'font-style')
    if (fstyle !== null) out.fontStyle = fstyle
    const fill = prop(el, 'fill')
    if (fill !== null) out.fill = fill
    const fillOpacity = prop(el, 'fill-opacity')
    if (fillOpacity !== null) out.fillOpacity = parseFloat(fillOpacity)
    const ls = prop(el, 'letter-spacing')
    if (ls !== null) out.letterSpacing = ls === 'normal' ? 0 : parseFloat(ls)
    const deco = prop(el, 'text-decoration') ?? prop(el, 'text-decoration-line')
    if (deco !== null) out.textDecoration = deco
  }
  return out
}

const EMPTY_ATTRS: SvgTextAttrs = {
  fontFamily: null,
  fontSize: null,
  fontWeight: null,
  fontStyle: null,
  fill: null,
  fillOpacity: null,
  letterSpacing: null,
  textDecoration: null,
}

function firstNumber(value: string | undefined): number | null {
  if (value === undefined) return null
  const first = value.trim().split(/[\s,]+/)[0]
  const n = parseFloat(first)
  return Number.isFinite(n) ? n : null
}

/**
 * Extract positioned text runs. Runs are returned in document order, which
 * for Figma output follows the node's own line/run order.
 */
export function extractSvgTextRuns(svg: string): SvgTextRun[] {
  const root = parseXml(svg)
  const runs: SvgTextRun[] = []

  walkXml(root, (el, ancestors) => {
    if (el.tag !== 'text') return
    const chain = [...ancestors, el]
    let transform = IDENTITY
    for (const link of chain) {
      transform = mul(transform, parseSvgTransform(link.attrs['transform']))
    }
    const textAttrs = inheritAttrs(chain, EMPTY_ATTRS)
    const baseX = firstNumber(el.attrs['x']) ?? 0
    const baseY = firstNumber(el.attrs['y']) ?? 0

    let cursorX = baseX
    let cursorY = baseY
    for (const child of el.children) {
      if (typeof child === 'string') {
        if (child.length > 0) {
          runs.push({ text: child, x: cursorX, y: cursorY, transform, attrs: textAttrs })
        }
        continue
      }
      if (child.tag !== 'tspan') continue
      const x = firstNumber(child.attrs['x'])
      const y = firstNumber(child.attrs['y'])
      if (x !== null) cursorX = x
      if (y !== null) cursorY = y
      const content = textContent(child)
      if (content.length > 0) {
        const attrs = inheritAttrs([child], textAttrs)
        const tspanTransform = mul(transform, parseSvgTransform(child.attrs['transform']))
        runs.push({ text: content, x: cursorX, y: cursorY, transform: tspanTransform, attrs })
      }
    }
    return false
  })

  return runs
}

/** Extract filled `<path>` elements (used for the outline fallback, FR-5). */
export function extractSvgPaths(svg: string): SvgPathElement[] {
  const root = parseXml(svg)
  const paths: SvgPathElement[] = []
  walkXml(root, (el, ancestors) => {
    if (el.tag === 'defs' || el.tag === 'clipPath' || el.tag === 'mask') return false
    if (el.tag !== 'path') return
    const d = el.attrs['d']
    if (!d) return
    const chain = [...ancestors, el]
    let transform = IDENTITY
    let fillOpacity = 1
    for (const link of chain) {
      transform = mul(transform, parseSvgTransform(link.attrs['transform']))
      const op = prop(link, 'opacity')
      if (op !== null) fillOpacity *= parseFloat(op)
      const fo = prop(link, 'fill-opacity')
      if (fo !== null) fillOpacity *= parseFloat(fo)
    }
    const fill = prop(el, 'fill')
    const fillRule = prop(el, 'fill-rule') === 'evenodd' ? 'evenodd' : 'nonzero'
    paths.push({
      d,
      fill: fill === 'none' ? null : fill,
      fillOpacity,
      fillRule,
      transform,
    })
  })
  return paths
}

/** Parse `#rgb`, `#rrggbb`, `rgb()` / `rgba()` colors to 0-1 channels. */
export function parseCssColor(value: string | null): { r: number; g: number; b: number; a: number } | null {
  if (!value || value === 'none') return null
  const v = value.trim()
  if (v.startsWith('#')) {
    const hex = v.slice(1)
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16) / 255,
        g: parseInt(hex[1] + hex[1], 16) / 255,
        b: parseInt(hex[2] + hex[2], 16) / 255,
        a: 1,
      }
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16) / 255,
        g: parseInt(hex.slice(2, 4), 16) / 255,
        b: parseInt(hex.slice(4, 6), 16) / 255,
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      }
    }
    return null
  }
  const m = /^rgba?\(([^)]*)\)$/.exec(v)
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter((s) => s.length > 0)
    if (parts.length >= 3) {
      const chan = (s: string) => (s.endsWith('%') ? parseFloat(s) / 100 : parseFloat(s) / 255)
      return {
        r: chan(parts[0]),
        g: chan(parts[1]),
        b: chan(parts[2]),
        a: parts[3] !== undefined ? parseFloat(parts[3]) : 1,
      }
    }
  }
  if (v === 'black') return { r: 0, g: 0, b: 0, a: 1 }
  if (v === 'white') return { r: 1, g: 1, b: 1, a: 1 }
  return null
}
