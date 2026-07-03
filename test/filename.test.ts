import { describe, expect, it } from 'vitest'
import { buildFilename, formatDatePrefix, sanitizeName } from '../src/lib/filename'

describe('filename pattern (FR-3)', () => {
  it('formats the date prefix as yyyymmdd', () => {
    expect(formatDatePrefix(new Date(2026, 6, 3))).toBe('20260703')
    expect(formatDatePrefix(new Date(2026, 0, 9))).toBe('20260109')
  })

  it('builds the persisted pattern with the auto-updating date', () => {
    expect(buildFilename(new Date(2026, 6, 3), 'Bewerbung Musterfirma')).toBe(
      '20260703 - Bewerbung Musterfirma.pdf'
    )
  })

  it('falls back to the bare date when the name is empty', () => {
    expect(buildFilename(new Date(2026, 6, 3), '')).toBe('20260703.pdf')
    expect(buildFilename(new Date(2026, 6, 3), '   ')).toBe('20260703.pdf')
  })

  it('strips characters that are illegal in filenames but keeps umlauts', () => {
    expect(sanitizeName('CV: Max/Müller <final>?')).toBe('CV MaxMüller final')
    expect(sanitizeName('a  b\tc')).toBe('a b c')
  })
})
