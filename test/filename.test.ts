import { describe, expect, it } from 'vitest'
import {
  buildBaseName,
  buildFilename,
  defaultExportName,
  filenameFromBase,
  formatDatePrefix,
  sanitizeName,
  stripDatePrefix,
} from '../src/lib/filename'

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

describe('editable filename box (FR-3)', () => {
  it('prefills the box with the date in front of the name', () => {
    expect(buildBaseName(new Date(2026, 6, 22), 'Bewerbung Musterfirma')).toBe(
      '20260722 - Bewerbung Musterfirma'
    )
    expect(buildBaseName(new Date(2026, 6, 22), '')).toBe('20260722')
  })

  it('exports exactly what the box says, date included', () => {
    const today = new Date(2026, 6, 22)
    expect(filenameFromBase('20260722 - Bewerbung Musterfirma', today)).toBe(
      '20260722 - Bewerbung Musterfirma.pdf'
    )
    // The user owns the whole string, so an edited date is honoured as typed.
    expect(filenameFromBase('20260101 - Bewerbung', today)).toBe('20260101 - Bewerbung.pdf')
    expect(filenameFromBase('Bewerbung ohne Datum', today)).toBe('Bewerbung ohne Datum.pdf')
  })

  it('sanitizes and never doubles the extension', () => {
    const today = new Date(2026, 6, 22)
    expect(filenameFromBase('20260722 - CV: Max/Müller', today)).toBe('20260722 - CV MaxMüller.pdf')
    expect(filenameFromBase('20260722 - CV.pdf', today)).toBe('20260722 - CV.pdf')
    expect(filenameFromBase('20260722 - CV.PDF', today)).toBe('20260722 - CV.pdf')
  })

  it('falls back to today when the box is emptied', () => {
    expect(filenameFromBase('', new Date(2026, 6, 22))).toBe('20260722.pdf')
    expect(filenameFromBase('   ', new Date(2026, 6, 22))).toBe('20260722.pdf')
  })

  it('remembers the name without the date prefix', () => {
    expect(stripDatePrefix('20260722 - Bewerbung Musterfirma')).toBe('Bewerbung Musterfirma')
    expect(stripDatePrefix('20260722 Bewerbung')).toBe('Bewerbung')
    expect(stripDatePrefix('20260722')).toBe('')
    expect(stripDatePrefix('Bewerbung 2026')).toBe('Bewerbung 2026')
    expect(stripDatePrefix('2026 - Bewerbung')).toBe('2026 - Bewerbung')
  })
})

describe('default export name (FR-3)', () => {
  it('uses the Figma file name', () => {
    expect(defaultExportName('Bewerbung Musterfirma', 'Page 1')).toBe('Bewerbung Musterfirma')
    expect(buildFilename(new Date(2026, 6, 22), defaultExportName('CV Max', 'Page 1'))).toBe(
      '20260722 - CV Max.pdf'
    )
  })

  it('sanitizes the file name', () => {
    expect(defaultExportName('CV: Max/Müller', '')).toBe('CV MaxMüller')
  })

  it('falls back to the page (tab) name only when the file is unnamed', () => {
    expect(defaultExportName('Untitled', 'Anschreiben')).toBe('Anschreiben')
    expect(defaultExportName('Untitled 2', 'Anschreiben')).toBe('Anschreiben')
    expect(defaultExportName('Unbenannt', 'Anschreiben')).toBe('Anschreiben')
    expect(defaultExportName('Untitled Ideas', 'Anschreiben')).toBe('Untitled Ideas')
  })

  it('keeps the file name when the page name is a default too', () => {
    expect(defaultExportName('Untitled', 'Page 1')).toBe('Untitled')
    expect(defaultExportName('Untitled', 'Seite 2')).toBe('Untitled')
    expect(defaultExportName('Untitled', '')).toBe('Untitled')
  })

  it('returns an empty name when there is nothing to use', () => {
    expect(defaultExportName('', '')).toBe('')
    expect(buildFilename(new Date(2026, 6, 22), defaultExportName('', ''))).toBe('20260722.pdf')
  })
})
