import { describe, expect, it } from 'vitest'
import {
  isKnownLanguageTag,
  isLanguageTag,
  LANGUAGES,
  languageLabel,
  normalizeLanguageTag,
} from '../src/lib/languages'

describe('language tags', () => {
  it('offers only well-formed, canonically cased xx-XX tags', () => {
    for (const option of LANGUAGES) {
      expect(isLanguageTag(option.tag), option.tag).toBe(true)
      expect(normalizeLanguageTag(option.tag)).toBe(option.tag)
      expect(option.tag).toMatch(/^[a-z]{2}-[A-Z]{2}$/)
      expect(option.label.length).toBeGreaterThan(0)
    }
  })

  it('lists every tag once, sorted by label', () => {
    const tags = LANGUAGES.map((option) => option.tag)
    expect(new Set(tags).size).toBe(tags.length)
    const labels = LANGUAGES.map((option) => option.label)
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'en')))
  })

  it('covers the plugin default', () => {
    expect(isKnownLanguageTag('de-DE')).toBe(true)
    expect(isKnownLanguageTag('en-US')).toBe(true)
    expect(isKnownLanguageTag('xx-XX')).toBe(false)
  })

  it('validates the shape of a tag', () => {
    expect(isLanguageTag('de')).toBe(true)
    expect(isLanguageTag('de-DE')).toBe(true)
    expect(isLanguageTag('zh-Hant-TW')).toBe(true)
    expect(isLanguageTag('es-419')).toBe(true)
    expect(isLanguageTag('')).toBe(false)
    expect(isLanguageTag('german')).toBe(false)
    expect(isLanguageTag('de_DE')).toBe(false)
    expect(isLanguageTag('de-')).toBe(false)
  })

  it('canonicalizes casing but leaves half-typed input alone', () => {
    expect(normalizeLanguageTag('DE-de')).toBe('de-DE')
    expect(normalizeLanguageTag(' en-us ')).toBe('en-US')
    expect(normalizeLanguageTag('zh-hant-tw')).toBe('zh-Hant-TW')
    expect(normalizeLanguageTag('en-u')).toBe('en-u')
    expect(normalizeLanguageTag('')).toBe('')
  })

  it('falls back to the raw tag for unknown languages', () => {
    expect(languageLabel('de-DE')).toBe('German (Germany)')
    expect(languageLabel('gsw-CH')).toBe('gsw-CH')
  })
})
