import { describe, expect, it } from 'vitest'
import { checkEmbeddability, fsTypeToBits, matchFont, normalizeStyle, type FontCandidate } from '../src/lib/fontmatch'

function candidate(family: string, subfamily: string, ps = ''): FontCandidate<string> {
  return {
    info: { familyName: family, subfamilyName: subfamily, postscriptName: ps, fsType: 0 },
    value: `${family}/${subfamily}`,
  }
}

describe('font matching (FR-5)', () => {
  it('matches exact family and style', () => {
    const candidates = [candidate('Lato', 'Regular'), candidate('Lato', 'Bold')]
    expect(matchFont({ family: 'Lato', style: 'Bold' }, candidates)?.value).toBe('Lato/Bold')
  })

  it('normalizes style naming differences', () => {
    expect(normalizeStyle('Semi Bold')).toBe(normalizeStyle('SemiBold'))
    expect(normalizeStyle('Normal')).toBe(normalizeStyle('Regular'))
    const candidates = [candidate('Inter', 'Semi Bold')]
    expect(matchFont({ family: 'Inter', style: 'SemiBold' }, candidates)).not.toBeNull()
  })

  it('matches a weight folded into the family name with subfamily Regular', () => {
    // e.g. static instances cut from a variable font (fonttools --update-name-table)
    // report family "Inter Medium", subfamily "Regular" per OpenType convention.
    const candidates = [candidate('Inter Medium', 'Regular'), candidate('Inter', 'Bold')]
    expect(matchFont({ family: 'Inter', style: 'Medium' }, candidates)?.value).toBe('Inter Medium/Regular')
  })

  it('matches via postscript name as a last resort', () => {
    const candidates = [candidate('Anything', 'Whatever', 'SourceSerif-Italic')]
    expect(matchFont({ family: 'Source Serif', style: 'Italic' }, candidates)).not.toBeNull()
  })

  it('returns null for a different family', () => {
    expect(matchFont({ family: 'Lato', style: 'Bold' }, [candidate('Roboto', 'Bold')])).toBeNull()
  })
})

describe('fsType embeddability policy (FR-5)', () => {
  it('allows installable, editable and preview&print embedding', () => {
    expect(checkEmbeddability(0x0000).ok).toBe(true)
    expect(checkEmbeddability(0x0004).ok).toBe(true)
    expect(checkEmbeddability(0x0008).ok).toBe(true)
    // Least-restrictive-wins: restricted bit + editable bit -> allowed.
    expect(checkEmbeddability(0x000a).ok).toBe(true)
  })

  it('blocks restricted-license fonts', () => {
    const result = checkEmbeddability(0x0002)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/restricted/i)
  })

  it('blocks bitmap-embedding-only fonts', () => {
    expect(checkEmbeddability(0x0200).ok).toBe(false)
  })
})

describe('fsTypeToBits (fontkit flags object)', () => {
  const flags = (o: object) => ({ noEmbedding: false, viewOnly: false, editable: false, noSubsetting: false, bitmapOnly: false, ...o })
  it('treats an all-false object as installable (embeddable)', () => {
    expect(checkEmbeddability(fsTypeToBits(flags({}))).ok).toBe(true)
  })
  it('blocks a restricted-license font', () => {
    expect(checkEmbeddability(fsTypeToBits(flags({ noEmbedding: true }))).ok).toBe(false)
  })
  it('allows preview/print and editable embedding', () => {
    expect(checkEmbeddability(fsTypeToBits(flags({ noEmbedding: true, viewOnly: true }))).ok).toBe(true)
    expect(checkEmbeddability(fsTypeToBits(flags({ noEmbedding: true, editable: true }))).ok).toBe(true)
  })
  it('blocks bitmap-only fonts and passes numbers through', () => {
    expect(checkEmbeddability(fsTypeToBits(flags({ bitmapOnly: true }))).ok).toBe(false)
    expect(fsTypeToBits(0x0008)).toBe(0x0008)
    expect(fsTypeToBits(undefined)).toBe(0)
  })
})
