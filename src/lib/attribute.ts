/**
 * Attribution: merge Figma's styled-text segments (exact font names, fills,
 * hyperlinks — FR-6) onto the positioned runs parsed from the SVG export
 * (exact baselines). The SVG run text is matched against the node's source
 * characters with a forward cursor; textCase transforms are tolerated via
 * case-insensitive fallback.
 */

import type { SvgTextRun } from './svgtext'
import { parseCssColor } from './svgtext'
import type { PositionedRun, SolidColor, TextRunStyle } from './types'

/** Plain-data mirror of Figma's getStyledTextSegments result. */
export interface StyledSegment {
  start: number
  end: number
  fontFamily: string
  fontStyle: string
  fontSize: number
  fill: SolidColor | null
  letterSpacingPt: number
  hyperlink: string | null
  underline: boolean
  strikethrough: boolean
}

export interface AttributionResult {
  runs: PositionedRun[]
  /** True when every SVG run aligned to the source characters. */
  fullyAligned: boolean
}

function findAligned(source: string, fragment: string, from: number): number {
  const exact = source.indexOf(fragment, from)
  if (exact !== -1) return exact
  return source.toLowerCase().indexOf(fragment.toLowerCase(), from)
}

function segmentAt(segments: StyledSegment[], index: number): StyledSegment | null {
  for (const seg of segments) {
    if (index >= seg.start && index < seg.end) return seg
  }
  return segments.length > 0 ? segments[segments.length - 1] : null
}

const BLACK: SolidColor = { r: 0, g: 0, b: 0, opacity: 1 }

function styleFromSvgAttrs(run: SvgTextRun): TextRunStyle {
  const weight = run.attrs.fontWeight ?? '400'
  const numeric = parseInt(weight, 10)
  const bold = weight === 'bold' || (Number.isFinite(numeric) && numeric >= 600)
  const italic = run.attrs.fontStyle === 'italic' || run.attrs.fontStyle === 'oblique'
  const style = bold && italic ? 'Bold Italic' : bold ? 'Bold' : italic ? 'Italic' : 'Regular'
  const color = parseCssColor(run.attrs.fill)
  return {
    font: { family: run.attrs.fontFamily ?? '', style },
    fontSize: run.attrs.fontSize ?? 12,
    fill: color
      ? { r: color.r, g: color.g, b: color.b, opacity: color.a * (run.attrs.fillOpacity ?? 1) }
      : BLACK,
    letterSpacingPt: run.attrs.letterSpacing ?? 0,
    hyperlink: null,
    underline: (run.attrs.textDecoration ?? '').includes('underline'),
    strikethrough: (run.attrs.textDecoration ?? '').includes('line-through'),
  }
}

function styleFromSegment(seg: StyledSegment): TextRunStyle {
  return {
    font: { family: seg.fontFamily, style: seg.fontStyle },
    fontSize: seg.fontSize,
    fill: seg.fill ?? BLACK,
    letterSpacingPt: seg.letterSpacingPt,
    hyperlink: seg.hyperlink,
    underline: seg.underline,
    strikethrough: seg.strikethrough,
  }
}

/**
 * Assign styles + line indices to SVG runs.
 *
 * Line indices derive from each run's pre-transform baseline y: runs on the
 * same visual line share a local-space baseline even when rotated.
 */
export function attributeRuns(
  svgRuns: SvgTextRun[],
  characters: string,
  segments: StyledSegment[]
): AttributionResult {
  const runs: PositionedRun[] = []
  let cursor = 0
  let fullyAligned = true

  let lineIndex = -1
  let lastY: number | null = null

  for (const svgRun of svgRuns) {
    if (lastY === null || Math.abs(svgRun.y - lastY) > 0.01) {
      lineIndex++
      lastY = svgRun.y
    }

    const idx = findAligned(characters, svgRun.text, cursor)
    let style: TextRunStyle
    if (idx !== -1) {
      const seg = segmentAt(segments, idx)
      style = seg ? styleFromSegment(seg) : styleFromSvgAttrs(svgRun)
      // Prefer the rendered size/decoration if the segment lookup landed on
      // a boundary; segments are authoritative for font identity and links.
      cursor = idx + svgRun.text.length
    } else {
      fullyAligned = false
      style = styleFromSvgAttrs(svgRun)
    }

    runs.push({
      text: svgRun.text,
      x: svgRun.x,
      y: svgRun.y,
      transform: svgRun.transform,
      style,
      lineIndex,
    })
  }

  return { runs, fullyAligned }
}
