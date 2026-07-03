import { describe, expect, it } from 'vitest'
import { apply } from '../src/lib/matrix'
import { transformPathData } from '../src/lib/svgpath'
import { extractSvgPaths, extractSvgTextRuns, parseCssColor, parseSvgTransform } from '../src/lib/svgtext'
import { attributeRuns, type StyledSegment } from '../src/lib/attribute'

/** Shaped like Figma's svgOutlineText:false output for a two-line text node. */
const FIGMA_TEXT_SVG = `<svg width="200" height="40" viewBox="0 0 200 40" fill="none" xmlns="http://www.w3.org/2000/svg">
<text fill="#1A1A1A" xml:space="preserve" style="white-space: pre" font-family="Lato" font-size="11" letter-spacing="0em"><tspan x="0" y="10.5">Erfahrung in der </tspan><tspan x="83.2" y="10.5">Anwendungsentwicklung</tspan><tspan x="0" y="24.5">mit T&#x2026;ffi &amp; Team</tspan></text>
</svg>`

const FIGMA_BOLD_MIX_SVG = `<svg width="200" height="20" viewBox="0 0 200 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<g transform="translate(4 2)">
<text fill="#000000" style="white-space: pre" font-family="Lato" font-size="11"><tspan x="0" y="10">Regular </tspan></text>
<text fill="#000000" style="white-space: pre" font-family="Lato" font-size="11" font-weight="bold"><tspan x="44.5" y="10">Bold</tspan></text>
</g>
</svg>`

describe('extractSvgTextRuns', () => {
  it('extracts tspans with baselines, decoding entities', () => {
    const runs = extractSvgTextRuns(FIGMA_TEXT_SVG)
    expect(runs).toHaveLength(3)
    expect(runs[0]).toMatchObject({ text: 'Erfahrung in der ', x: 0, y: 10.5 })
    expect(runs[1]).toMatchObject({ text: 'Anwendungsentwicklung', x: 83.2, y: 10.5 })
    expect(runs[2].text).toBe('mit T…ffi & Team')
    expect(runs[0].attrs.fontFamily).toBe('Lato')
    expect(runs[0].attrs.fontSize).toBe(11)
    expect(runs[0].attrs.fill).toBe('#1A1A1A')
  })

  it('accumulates group transforms onto runs', () => {
    const runs = extractSvgTextRuns(FIGMA_BOLD_MIX_SVG)
    expect(runs).toHaveLength(2)
    const p = apply(runs[0].transform, { x: runs[0].x, y: runs[0].y })
    expect(p).toEqual({ x: 4, y: 12 })
    expect(runs[1].attrs.fontWeight).toBe('bold')
  })
})

describe('parseSvgTransform', () => {
  it('parses matrix()', () => {
    const m = parseSvgTransform('matrix(0 1 -1 0 10 20)')
    expect(apply(m, { x: 1, y: 0 })).toEqual({ x: 10, y: 21 })
  })

  it('parses translate() and rotate() composition', () => {
    const m = parseSvgTransform('translate(10 20) rotate(90)')
    const p = apply(m, { x: 1, y: 0 })
    expect(p.x).toBeCloseTo(10)
    expect(p.y).toBeCloseTo(21)
  })
})

describe('extractSvgPaths (outline fallback)', () => {
  it('extracts filled paths and flattens transforms', () => {
    const svg = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(5 0)"><path d="M0 0L2 0L2 2Z" fill="#FF0000" fill-opacity="0.5"/></g>
    </svg>`
    const paths = extractSvgPaths(svg)
    expect(paths).toHaveLength(1)
    expect(paths[0].fill).toBe('#FF0000')
    expect(paths[0].fillOpacity).toBeCloseTo(0.5)
    const transformed = transformPathData(paths[0].d, paths[0].transform)
    expect(transformed).toBe('M 5 0 L 7 0 L 7 2 Z')
  })

  it('ignores clip paths and defs', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><defs><path d="M0 0H5V5Z"/></defs><path d="M1 1L2 2Z" fill="#000"/></svg>`
    expect(extractSvgPaths(svg)).toHaveLength(1)
  })
})

describe('transformPathData', () => {
  it('absolutizes relative commands and converts H/V to L', () => {
    const d = 'M 10 10 h 5 v 5 l -5 0 z'
    expect(transformPathData(d, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })).toBe(
      'M 10 10 L 15 10 L 15 15 L 10 15 Z'
    )
  })

  it('expands smooth curves into explicit cubics', () => {
    const d = 'M0 0C1 1 2 1 3 0S5 -1 6 0'
    const out = transformPathData(d, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
    expect(out).toBe('M 0 0 C 1 1 2 1 3 0 C 4 -1 5 -1 6 0')
  })

  it('throws on arcs so the caller can fall back to raster', () => {
    expect(() => transformPathData('M0 0A5 5 0 0 1 10 10', { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })).toThrow(
      /arc/i
    )
  })
})

describe('parseCssColor', () => {
  it('parses hex and rgb() forms', () => {
    expect(parseCssColor('#ff0000')).toEqual({ r: 1, g: 0, b: 0, a: 1 })
    expect(parseCssColor('#1A1A1A')?.r).toBeCloseTo(26 / 255)
    expect(parseCssColor('rgb(255, 128, 0)')?.g).toBeCloseTo(128 / 255)
    expect(parseCssColor('none')).toBeNull()
  })
})

describe('attributeRuns (segments onto SVG runs)', () => {
  const segments: StyledSegment[] = [
    {
      start: 0,
      end: 8,
      fontFamily: 'Lato',
      fontStyle: 'Regular',
      fontSize: 11,
      fill: { r: 0, g: 0, b: 0, opacity: 1 },
      letterSpacingPt: 0,
      hyperlink: null,
      underline: false,
      strikethrough: false,
    },
    {
      start: 8,
      end: 12,
      fontFamily: 'Lato',
      fontStyle: 'Bold',
      fontSize: 11,
      fill: { r: 0, g: 0, b: 0, opacity: 1 },
      letterSpacingPt: 0,
      hyperlink: 'https://example.com',
      underline: true,
      strikethrough: false,
    },
  ]

  it('assigns exact Figma font names and hyperlinks from segments', () => {
    const runs = extractSvgTextRuns(FIGMA_BOLD_MIX_SVG)
    const { runs: attributed, fullyAligned } = attributeRuns(runs, 'Regular Bold', segments)
    expect(fullyAligned).toBe(true)
    expect(attributed[0].style.font).toEqual({ family: 'Lato', style: 'Regular' })
    expect(attributed[1].style.font).toEqual({ family: 'Lato', style: 'Bold' })
    expect(attributed[1].style.hyperlink).toBe('https://example.com')
    expect(attributed[1].style.underline).toBe(true)
  })

  it('assigns line indices by baseline', () => {
    const runs = extractSvgTextRuns(FIGMA_TEXT_SVG)
    const { runs: attributed } = attributeRuns(runs, 'x', [])
    expect(attributed[0].lineIndex).toBe(0)
    expect(attributed[1].lineIndex).toBe(0)
    expect(attributed[2].lineIndex).toBe(1)
  })

  it('falls back to SVG attributes when alignment fails', () => {
    const runs = extractSvgTextRuns(FIGMA_BOLD_MIX_SVG)
    const { runs: attributed, fullyAligned } = attributeRuns(runs, 'completely different text', [])
    expect(fullyAligned).toBe(false)
    expect(attributed[1].style.font.style).toBe('Bold')
  })
})
