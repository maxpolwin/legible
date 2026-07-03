/**
 * Generates a demo PDF straight from the PDF builder (no Figma needed) so
 * the §3 success criteria can be checked with real tools:
 *
 *   npm run demo
 *   pdffonts demo/legible-demo.pdf     # embedded fonts, no "Type 3", subset tags
 *   pdftotext demo/legible-demo.pdf -  # full text incl. äöüß + ligature words
 *
 * The layout mimics a two-column CV page: header spanning both columns,
 * sidebar left, main column right, a hyperlink, bold runs, umlauts and
 * ligature-prone words.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { translate } from '../src/lib/matrix'
import { computeReadingOrder } from '../src/lib/order'
import { buildPdf } from '../src/lib/pdf/build'
import type { ExtractedFrame, ExtractedTextNode, PositionedRun, TextRunStyle } from '../src/lib/types'
import { fontId } from '../src/lib/types'

// Run from the repo root (npm run demo).
const root = process.cwd()

const REGULAR = { family: 'Lato', style: 'Regular' }
const BOLD = { family: 'Lato', style: 'Bold' }

function style(overrides: Partial<TextRunStyle> = {}): TextRunStyle {
  return {
    font: REGULAR,
    fontSize: 10.5,
    fill: { r: 0.1, g: 0.1, b: 0.12, opacity: 1 },
    letterSpacingPt: 0,
    hyperlink: null,
    underline: false,
    strikethrough: false,
    ...overrides,
  }
}

let nodeCounter = 0
function node(x: number, y: number, w: number, lines: Array<[string, Partial<TextRunStyle>?]>): ExtractedTextNode {
  const runs: PositionedRun[] = lines.map(([text, overrides], index) => ({
    text,
    x: 0,
    y: 12 + index * 14,
    transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    style: style(overrides),
    lineIndex: index,
  }))
  nodeCounter += 1
  return {
    id: `node-${nodeCounter}`,
    name: `node-${nodeCounter}`,
    frameTransform: translate(x, y),
    width: w,
    height: lines.length * 14 + 6,
    characters: lines.map(([text]) => text).join(' '),
    runs,
    fallback: null,
  }
}

async function main(): Promise<void> {
  const texts: ExtractedTextNode[] = [
    // Header spanning both columns.
    node(48, 40, 500, [
      ['Max Mustermann', { fontSize: 22, font: BOLD }],
    ]),
    node(48, 74, 500, [['Anwendungsentwickler — München', { fontSize: 12 }]]),
    // Sidebar (left column).
    node(48, 130, 140, [
      ['Kontakt', { font: BOLD }],
      ['max@example.com'],
      ['github.com/example', { hyperlink: 'https://github.com/example', underline: true }],
    ]),
    node(48, 210, 140, [
      ['Fähigkeiten', { font: BOLD }],
      ['Effiziente Workflows'],
      ['Offizielle Zertifikate'],
      ['Große Sorgfalt, Qualität'],
    ]),
    // Main column (right).
    node(240, 130, 300, [
      ['Berufserfahrung', { font: BOLD, fontSize: 13 }],
      ['Senior Developer — Beispiel GmbH', { font: BOLD }],
      ['Konfiguration und Pflege der offiziellen'],
      ['Anwendungsplattform; final verantwortlich für'],
      ['effiziente, barrierefreie Auslieferung.'],
    ]),
    node(240, 240, 300, [
      ['Ausbildung', { font: BOLD, fontSize: 13 }],
      ['B.Sc. Informatik, TU München — Abschluss mit'],
      ['Auszeichnung; Schwerpunkt Software-Qualität.'],
    ]),
  ]

  const frame: ExtractedFrame = {
    id: 'demo-frame',
    name: 'Demo CV',
    width: 595,
    height: 842,
    background: { kind: 'solid', fill: { r: 1, g: 1, b: 1, opacity: 1 } },
    texts,
    readingOrder: computeReadingOrder(
      texts.map((t) => ({ id: t.id, x: t.frameTransform.e, y: t.frameTransform.f, w: t.width, h: t.height }))
    ),
  }

  const fonts = new Map([
    [fontId(REGULAR), new Uint8Array(readFileSync(join(root, 'test/fixtures/Lato-Regular.ttf')))],
    [fontId(BOLD), new Uint8Array(readFileSync(join(root, 'test/fixtures/Lato-Bold.ttf')))],
  ])

  const { bytes, report } = await buildPdf({
    frames: [frame],
    meta: { title: '20260703 - Legible Demo', author: 'Max Mustermann', language: 'de-DE' },
    fonts,
  })

  mkdirSync(join(root, 'demo'), { recursive: true })
  const out = join(root, 'demo', 'legible-demo.pdf')
  writeFileSync(out, bytes)
  console.log(`wrote ${out} (${bytes.byteLength} bytes)`)
  for (const entry of report) console.log(`[${entry.severity}] ${entry.message}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
