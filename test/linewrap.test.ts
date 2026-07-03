import { describe, expect, it } from 'vitest'
import { joinWrappedLines, paragraphActualText } from '../src/lib/linewrap'

describe('line-wrap reconstruction (FR-7)', () => {
  it('joins lines wrapped at whitespace with a single space', () => {
    const source = 'Senior Product Designer with ten years of experience'
    const lines = ['Senior Product Designer with', 'ten years of experience']
    expect(joinWrappedLines(lines, source)).toBe(source)
  })

  it('keeps an explicit source hyphen without inserting a space', () => {
    const source = 'A hands-on approach'
    const lines = ['A hands-', 'on approach']
    expect(joinWrappedLines(lines, source)).toBe('A hands-on approach')
  })

  it('rejoins force-wrapped tokens without inserting anything', () => {
    const source = 'https://github.com/example/legible-plugin'
    const lines = ['https://github.com/exam', 'ple/legible-plugin']
    expect(joinWrappedLines(lines, source)).toBe(source)
  })

  it('drops soft hyphens so keywords stay whole', () => {
    const source = 'Anwendungs­entwicklung'
    const lines = ['Anwendungs­', 'entwicklung']
    expect(joinWrappedLines(lines, source)).toBe('Anwendungsentwicklung')
  })

  it('handles single-line paragraphs', () => {
    expect(joinWrappedLines(['Hello'], 'Hello')).toBe('Hello')
    expect(joinWrappedLines([], 'x')).toBe('')
  })
})

describe('paragraphActualText (ActualText gate)', () => {
  it('returns null when the naive space-join is already correct', () => {
    const source = 'one two three four'
    expect(paragraphActualText(['one two', 'three four'], source)).toBeNull()
  })

  it('returns corrected text when a keyword would be split', () => {
    const source = 'https://example.com/profile'
    expect(paragraphActualText(['https://exam', 'ple.com/profile'], source)).toBe(source)
  })

  it('returns corrected text for soft-hyphen wraps', () => {
    const source = 'Anwendungs­entwicklung bei Firma'
    expect(paragraphActualText(['Anwendungs­', 'entwicklung bei Firma'], source)).toBe(
      'Anwendungsentwicklung bei Firma'
    )
  })
})
