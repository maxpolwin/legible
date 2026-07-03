import { describe, expect, it } from 'vitest'
import { checkEmbeddability, matchFont, normalizeStyle, type FontCandidate } from '../src/lib/fontmatch'

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
