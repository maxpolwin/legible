import fontkitModule from '@pdf-lib/fontkit'
import { describe, expect, it } from 'vitest'
import { bundledBytes, bundledFaces } from '../src/lib/bundledfonts'
import { checkEmbeddability, matchFont } from '../src/lib/fontmatch'
import { buildPdf } from '../src/lib/pdf/build'
import { fontId } from '../src/lib/types'
import { extractPageTexts, frame, run, textNode } from './helpers'

// Needs the generated fonts (`npm run fonts`, then `npm run gen-bundled`); skipped on a fresh clone.
const FACES = bundledFaces()
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fontkit ships no usable types
const fontkit = fontkitModule as any

describe.skipIf(FACES.length === 0)('bundled fonts', () => {
  const candidates = FACES.map((f) => ({ info: f.info, value: f }))

  it('covers the four families with every weight Figma offers, plus italics', () => {
    const families = new Set(FACES.map((f) => f.info.familyName))
    expect(families).toEqual(new Set(['Inter', 'Roboto', 'Open Sans', 'Lato']))
    for (const family of families) {
      for (const style of ['Regular', 'Bold', 'Italic', 'Bold Italic', 'Semi Bold', 'Medium']) {
        expect(matchFont({ family, style }, candidates), `${family} ${style}`).not.toBeNull()
      }
    }
  })

  it("resolves Figma's names to the right file", () => {
    expect(matchFont({ family: 'Inter', style: 'Semi Bold' }, candidates)?.value.file).toBe('Inter-SemiBold.ttf')
    expect(matchFont({ family: 'Open Sans', style: 'Bold Italic' }, candidates)?.value.file).toBe('OpenSans-BoldItalic.ttf')
    expect(matchFont({ family: 'Lato', style: 'Italic' }, candidates)?.value.file).toBe('Lato-Italic.ttf')
  })

  it('does not claim fonts it lacks', () => {
    expect(matchFont({ family: 'Source Sans 3', style: 'Regular' }, candidates)).toBeNull()
  })

  it('decodes every file into an embeddable font with German glyphs', () => {
    for (const face of FACES) {
      expect(checkEmbeddability(face.info.fsType).ok, face.file).toBe(true)
      const font = fontkit.create(bundledBytes(face.file))
      expect(font.getName('preferredFamily') ?? font.familyName, face.file).toBe(face.info.familyName)
      for (const ch of 'ÄÖÜäöüß€–“”₂²³≈≤') expect(font.hasGlyphForCodePoint(ch.codePointAt(0)), `${face.file} ${ch}`).toBe(true)
    }
  })

  it('rejects an unknown file name', () => {
    expect(() => bundledBytes('../../etc/passwd')).toThrow()
  })

  it('exports a CV-style page in three Inter weights as real, extractable text', async () => {
    const wanted = [
      { family: 'Inter', style: 'Regular' },
      { family: 'Inter', style: 'Semi Bold' },
      { family: 'Inter', style: 'Bold' },
    ]
    const fonts = new Map<string, Uint8Array>()
    const nodes = wanted.map((key, i) => {
      const hit = matchFont(key, candidates)
      expect(hit, key.style).not.toBeNull()
      fonts.set(fontId(key), bundledBytes((hit as NonNullable<typeof hit>).value.file))
      return textNode(`n${i}`, 0, 0, [run(`Größe ${key.style}`, 10, 30 + i * 30, 0, { font: key })])
    })
    const { bytes } = await buildPdf({
      frames: [frame(nodes)],
      meta: { title: 't', author: '', language: 'de-DE' },
      fonts,
    })
    const text = (await extractPageTexts(bytes))[0]
    for (const key of wanted) expect(text).toContain(`Größe ${key.style}`)
    expect(bytes.length).toBeLessThan(60_000) // subsetting keeps the PDF small
  })
})
