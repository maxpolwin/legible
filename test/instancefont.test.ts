import fontkitModule from '@pdf-lib/fontkit'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { buildStaticInstance, isVariableFont, type InstanceSource } from '../src/lib/instancefont'
import { buildPdf } from '../src/lib/pdf/build'
import { fontId } from '../src/lib/types'
import { extractPageTexts, fixture, frame, hasFixture, run, textNode } from './helpers'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fontkit ships no usable types
const fontkit = fontkitModule as any

const HAVE_FIXTURE = hasFixture('EBGaramond.ttf') // variable (wght 400-800); fetched by `npm run fixtures`

/**
 * Reference values come from fontTools' instancer (an independent
 * implementation) run on the same file: advance width and glyph bbox for the
 * wght=500 and wght=700 instances.
 */
const REFERENCE: Record<number, Record<string, { adv: number; bbox: [number, number, number, number] }>> = {
  500: {
    H: { adv: 807, bbox: [31, -4, 774, 654] },
    a: { adv: 413, bbox: [34, -14, 414, 420] },
    g: { adv: 458, bbox: [10, -290, 464, 422] },
    ß: { adv: 531, bbox: [23, -15, 504, 706] },
    Ä: { adv: 702, bbox: [-3, -5, 708, 808] },
  },
  700: {
    H: { adv: 801, bbox: [19, -3, 781, 655] },
    a: { adv: 438, bbox: [29, -14, 442, 432] },
    g: { adv: 500, bbox: [9, -289, 506, 433] },
    ß: { adv: 580, bbox: [16, -14, 558, 706] },
    Ä: { adv: 720, bbox: [-4, -5, 727, 831] },
  },
}

const NAMES = { family: 'EB Garamond', style: 'Bold', postscriptName: 'EBGaramond-Bold' }

function load(): InstanceSource {
  return fontkit.create(fixture('EBGaramond.ttf')) as InstanceSource
}

describe.skipIf(!HAVE_FIXTURE)('static instances of variable fonts', () => {
  it('detects a variable font and not a static one', () => {
    expect(isVariableFont(load())).toBe(true)
    if (hasFixture('Lato-Regular.ttf')) expect(isVariableFont(fontkit.create(fixture('Lato-Regular.ttf')))).toBe(false)
  })

  for (const wght of [500, 700]) {
    it(`matches fontTools' wght=${wght} advances and outlines`, () => {
      const bytes = buildStaticInstance(load(), { wght }, [...'HagßÄ fi'].map((c) => c.codePointAt(0) as number), NAMES)
      const font = fontkit.create(bytes)
      expect(isVariableFont(font)).toBe(false)
      for (const [ch, ref] of Object.entries(REFERENCE[wght])) {
        const glyph = font.glyphForCodePoint(ch.codePointAt(0))
        expect(glyph.id, `${ch} present`).toBeGreaterThan(0)
        expect(Math.abs(glyph.advanceWidth - ref.adv), `${ch} advance`).toBeLessThanOrEqual(1)
        const b = glyph.bbox
        const got = [b.minX, b.minY, b.maxX, b.maxY]
        ref.bbox.forEach((v, i) => expect(Math.abs(got[i] - v), `${ch} bbox[${i}]`).toBeLessThanOrEqual(1))
      }
    })
  }

  it('actually changes weight (bold stems are wider than medium)', () => {
    const cps = [0x6c] // l
    const medium = fontkit.create(buildStaticInstance(load(), { wght: 500 }, cps, NAMES)).glyphForCodePoint(0x6c).bbox
    const bold = fontkit.create(buildStaticInstance(load(), { wght: 700 }, cps, NAMES)).glyphForCodePoint(0x6c).bbox
    expect(bold.maxX - bold.minX).toBeGreaterThan(medium.maxX - medium.minX)
  })

  it('writes the requested names and keeps only the requested characters', () => {
    const font = fontkit.create(buildStaticInstance(load(), { wght: 700 }, [0x48, 0x61], NAMES))
    expect(font.familyName).toBe('EB Garamond')
    expect(font.subfamilyName).toBe('Bold')
    expect(font.postscriptName).toBe('EBGaramond-Bold')
    expect(font.numGlyphs).toBeLessThanOrEqual(3) // .notdef + H + a
    expect(font.hasGlyphForCodePoint(0x7a)).toBe(false) // z was not requested
  })

  it('skips code points the font does not have instead of failing', () => {
    const font = fontkit.create(buildStaticInstance(load(), { wght: 400 }, [0x48, 0x4e00, 0x1f600], NAMES))
    expect(font.hasGlyphForCodePoint(0x48)).toBe(true)
    expect(font.hasGlyphForCodePoint(0x4e00)).toBe(false)
  })

  it('refuses a static font', () => {
    if (!hasFixture('Lato-Regular.ttf')) return
    expect(() => buildStaticInstance(fontkit.create(fixture('Lato-Regular.ttf')), { wght: 400 }, [65], NAMES)).toThrow()
  })

  it('embeds through pdf-lib and the PDF text is extractable', async () => {
    const text = 'Größe Hag'
    const bytes = buildStaticInstance(load(), { wght: 700 }, [...text].map((c) => c.codePointAt(0) as number), NAMES)
    const doc = await PDFDocument.create()
    doc.registerFontkit(fontkit)
    const font = await doc.embedFont(bytes, { subset: true })
    doc.addPage([300, 100]).drawText(text, { font, size: 20, x: 10, y: 40 })
    const pages = await extractPageTexts(await doc.save({ useObjectStreams: false }))
    expect(pages[0].replace(/\s+/g, '')).toBe(text.replace(/\s+/g, ''))
  })

  it('works through buildPdf (tagged, extractable) as a weight-specific font', async () => {
    const key = { family: 'EB Garamond', style: 'Bold' }
    const text = 'Venture Architect'
    const bytes = buildStaticInstance(load(), { wght: 700 }, [...text].map((c) => c.codePointAt(0) as number), NAMES)
    const { bytes: pdf } = await buildPdf({
      frames: [frame([textNode('n1', 0, 0, [run(text, 10, 30, 0, { font: key })], text)])],
      meta: { title: 't', author: '', language: 'en-US' },
      fonts: new Map([[fontId(key), bytes]]),
    })
    expect((await extractPageTexts(pdf))[0]).toContain('Venture Architect')
  })
})
