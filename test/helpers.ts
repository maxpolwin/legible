import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IDENTITY, translate } from '../src/lib/matrix'
import type {
  ExtractedFrame,
  ExtractedTextNode,
  FontKey,
  PositionedRun,
  TextRunStyle,
} from '../src/lib/types'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

export const LATO_REGULAR: FontKey = { family: 'Lato', style: 'Regular' }
export const LATO_BOLD: FontKey = { family: 'Lato', style: 'Bold' }
export const GARAMOND: FontKey = { family: 'EB Garamond', style: 'Regular' }

export function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(fixturesDir, name)))
}

export function hasFixture(name: string): boolean {
  try {
    readFileSync(join(fixturesDir, name))
    return true
  } catch {
    return false
  }
}

export function style(overrides: Partial<TextRunStyle> = {}): TextRunStyle {
  return {
    font: LATO_REGULAR,
    fontSize: 11,
    fill: { r: 0, g: 0, b: 0, opacity: 1 },
    letterSpacingPt: 0,
    hyperlink: null,
    underline: false,
    strikethrough: false,
    ...overrides,
  }
}

export function run(
  text: string,
  x: number,
  y: number,
  lineIndex: number,
  overrides: Partial<TextRunStyle> = {}
): PositionedRun {
  return { text, x, y, transform: IDENTITY, style: style(overrides), lineIndex }
}

export function textNode(
  id: string,
  frameX: number,
  frameY: number,
  runs: PositionedRun[],
  characters?: string
): ExtractedTextNode {
  return {
    id,
    name: id,
    frameTransform: translate(frameX, frameY),
    width: 200,
    height: 40,
    characters: characters ?? runs.map((r) => r.text).join(' '),
    runs,
    fallback: null,
  }
}

export function frame(texts: ExtractedTextNode[], readingOrder?: string[]): ExtractedFrame {
  return {
    id: 'frame-1',
    name: 'Test frame',
    width: 595,
    height: 842,
    background: { kind: 'solid', fill: { r: 1, g: 1, b: 1, opacity: 1 } },
    texts,
    readingOrder: readingOrder ?? texts.map((t) => t.id),
  }
}

/** Extract text per page using pdf.js (the same stack many parsers use). */
export async function extractPageTexts(bytes: Uint8Array): Promise<string[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({
    data: bytes.slice(),
    disableFontFace: true,
    isEvalSupported: false,
    verbosity: 0,
  })
  const doc = await task.promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    pages.push(
      content.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter((s) => s.length > 0)
        .join(' ')
    )
  }
  await task.destroy()
  return pages
}
