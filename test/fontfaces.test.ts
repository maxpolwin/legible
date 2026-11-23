import fontkitModule from '@pdf-lib/fontkit'
import { describe, expect, it } from 'vitest'
import { expandFaces, type FaceSource } from '../src/lib/fontfaces'
import { matchFont } from '../src/lib/fontmatch'
import { fixture, hasFixture } from './helpers'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fontkit ships no usable types
const parse = (bytes: Uint8Array): FaceSource => (fontkitModule as any).create(bytes)

describe.skipIf(!hasFixture('EBGaramond.ttf'))('expandFaces (variable fonts)', () => {
  const expanded = expandFaces(parse(fixture('EBGaramond.ttf')))

  it('exposes every named style as its own face under the real family', () => {
    expect(expanded.isVariable).toBe(true)
    expect(expanded.error).toBeUndefined()
    expect(expanded.faces.map((f) => f.info.subfamilyName)).toEqual(['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold'])
    expect(new Set(expanded.faces.map((f) => f.info.familyName))).toEqual(new Set(['EB Garamond']))
    expect(expanded.faces.every((f) => f.variation !== undefined)).toBe(true)
  })

  it("matches Figma's style names, including 'Semi Bold' with a space", () => {
    const candidates = expanded.faces.map((f) => ({ info: f.info, value: f }))
    for (const [style, wght] of [['Regular', 400], ['Medium', 500], ['Semi Bold', 600], ['Bold', 700], ['Extra Bold', 800]] as const) {
      const hit = matchFont({ family: 'EB Garamond', style }, candidates)
      expect(hit, style).not.toBeNull()
      expect(hit?.value.variation?.settings.wght, style).toBe(wght)
    }
    expect(matchFont({ family: 'EB Garamond', style: 'Thin' }, candidates)).toBeNull()
  })

  it('checks glyph coverage against the styled instance', () => {
    expect(expanded.faces[0].font.hasGlyphForCodePoint(0xdf)).toBe(true) // ß
  })
})

describe.skipIf(!hasFixture('Lato-Regular.ttf'))('expandFaces (static fonts)', () => {
  it('returns a single face without a variation', () => {
    const out = expandFaces(parse(fixture('Lato-Regular.ttf')))
    expect(out.isVariable).toBe(false)
    expect(out.faces).toHaveLength(1)
    expect(out.faces[0].variation).toBeUndefined()
    expect(out.faces[0].info.familyName).toBe('Lato')
  })
})

describe('expandFaces (unsupported variable fonts)', () => {
  const fake = (extra: object): FaceSource =>
    ({
      familyName: 'X', subfamilyName: 'Regular', postscriptName: 'X', unitsPerEm: 1000, ascent: 0, descent: 0, lineGap: 0,
      'OS/2': null, variationAxes: { wght: { name: 'Weight', min: 1, default: 1, max: 2 } },
      getVariation: () => { throw new Error('unused') }, glyphForCodePoint: () => { throw new Error('unused') },
      getGlyph: () => { throw new Error('unused') }, hasGlyphForCodePoint: () => false, ...extra,
    }) as unknown as FaceSource

  it('rejects CFF2 variable fonts with a message', () => {
    const out = expandFaces(fake({ directory: { tables: { CFF2: {} } }, namedVariations: { Regular: { wght: 1 } } }))
    expect(out.faces).toHaveLength(0)
    expect(out.error).toMatch(/CFF2/)
  })
  it('rejects variable fonts with no named styles', () => {
    const out = expandFaces(fake({ directory: { tables: { glyf: {} } }, namedVariations: {} }))
    expect(out.faces).toHaveLength(0)
    expect(out.error).toMatch(/named styles/)
  })
})
