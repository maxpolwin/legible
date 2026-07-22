/**
 * BCP-47 language tags for the PDF catalog `/Lang` entry.
 *
 * `/Lang` is what tells a screen reader which pronunciation rules to use, so a
 * malformed tag is worse than none at all. The UI offers this curated list of
 * `xx-XX` (language-REGION) tags in a dropdown, plus a validated free-text
 * escape hatch for anything not covered here.
 */

export interface LanguageOption {
  /** BCP-47 tag, e.g. "de-DE". */
  tag: string
  /** English display name, e.g. "German (Germany)". */
  label: string
}

/** language[-Script][-REGION] — the BCP-47 subset PDF readers act on. */
const TAG_PATTERN = /^[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|\d{3}))?$/i

/** Sorted by label; the UI renders them in this order. */
export const LANGUAGES: readonly LanguageOption[] = [
  { tag: 'ar-SA', label: 'Arabic (Saudi Arabia)' },
  { tag: 'bg-BG', label: 'Bulgarian (Bulgaria)' },
  { tag: 'ca-ES', label: 'Catalan (Spain)' },
  { tag: 'zh-CN', label: 'Chinese (Simplified, China)' },
  { tag: 'zh-TW', label: 'Chinese (Traditional, Taiwan)' },
  { tag: 'hr-HR', label: 'Croatian (Croatia)' },
  { tag: 'cs-CZ', label: 'Czech (Czechia)' },
  { tag: 'da-DK', label: 'Danish (Denmark)' },
  { tag: 'nl-BE', label: 'Dutch (Belgium)' },
  { tag: 'nl-NL', label: 'Dutch (Netherlands)' },
  { tag: 'en-AU', label: 'English (Australia)' },
  { tag: 'en-CA', label: 'English (Canada)' },
  { tag: 'en-IN', label: 'English (India)' },
  { tag: 'en-IE', label: 'English (Ireland)' },
  { tag: 'en-GB', label: 'English (United Kingdom)' },
  { tag: 'en-US', label: 'English (United States)' },
  { tag: 'et-EE', label: 'Estonian (Estonia)' },
  { tag: 'fi-FI', label: 'Finnish (Finland)' },
  { tag: 'fr-BE', label: 'French (Belgium)' },
  { tag: 'fr-CA', label: 'French (Canada)' },
  { tag: 'fr-FR', label: 'French (France)' },
  { tag: 'fr-CH', label: 'French (Switzerland)' },
  { tag: 'de-AT', label: 'German (Austria)' },
  { tag: 'de-DE', label: 'German (Germany)' },
  { tag: 'de-CH', label: 'German (Switzerland)' },
  { tag: 'el-GR', label: 'Greek (Greece)' },
  { tag: 'he-IL', label: 'Hebrew (Israel)' },
  { tag: 'hi-IN', label: 'Hindi (India)' },
  { tag: 'hu-HU', label: 'Hungarian (Hungary)' },
  { tag: 'id-ID', label: 'Indonesian (Indonesia)' },
  { tag: 'it-IT', label: 'Italian (Italy)' },
  { tag: 'it-CH', label: 'Italian (Switzerland)' },
  { tag: 'ja-JP', label: 'Japanese (Japan)' },
  { tag: 'ko-KR', label: 'Korean (South Korea)' },
  { tag: 'lv-LV', label: 'Latvian (Latvia)' },
  { tag: 'lt-LT', label: 'Lithuanian (Lithuania)' },
  { tag: 'nb-NO', label: 'Norwegian Bokmål (Norway)' },
  { tag: 'pl-PL', label: 'Polish (Poland)' },
  { tag: 'pt-BR', label: 'Portuguese (Brazil)' },
  { tag: 'pt-PT', label: 'Portuguese (Portugal)' },
  { tag: 'ro-RO', label: 'Romanian (Romania)' },
  { tag: 'ru-RU', label: 'Russian (Russia)' },
  { tag: 'sr-RS', label: 'Serbian (Serbia)' },
  { tag: 'sk-SK', label: 'Slovak (Slovakia)' },
  { tag: 'sl-SI', label: 'Slovenian (Slovenia)' },
  { tag: 'es-MX', label: 'Spanish (Mexico)' },
  { tag: 'es-ES', label: 'Spanish (Spain)' },
  { tag: 'sv-SE', label: 'Swedish (Sweden)' },
  { tag: 'th-TH', label: 'Thai (Thailand)' },
  { tag: 'tr-TR', label: 'Turkish (Türkiye)' },
  { tag: 'uk-UA', label: 'Ukrainian (Ukraine)' },
  { tag: 'vi-VN', label: 'Vietnamese (Vietnam)' },
]

const BY_TAG = new Map(LANGUAGES.map((option) => [option.tag, option]))

/** True when `tag` is a well-formed language[-Script][-REGION] tag. */
export function isLanguageTag(tag: string): boolean {
  return TAG_PATTERN.test(tag.trim())
}

/** True when the tag is one of the dropdown's own options. */
export function isKnownLanguageTag(tag: string): boolean {
  return BY_TAG.has(tag)
}

/**
 * Canonical casing: `DE-de` -> `de-DE`, `zh-hant-tw` -> `zh-Hant-TW`. Input
 * that is not a well-formed tag (including half-typed tags) is returned
 * untouched, so this is safe to run on every keystroke.
 */
export function normalizeLanguageTag(tag: string): string {
  const trimmed = tag.trim()
  if (!TAG_PATTERN.test(trimmed)) return trimmed
  return trimmed
    .split('-')
    .map((part, index) => {
      if (index === 0) return part.toLowerCase()
      if (part.length === 4) return part[0].toUpperCase() + part.slice(1).toLowerCase()
      return part.toUpperCase()
    })
    .join('-')
}

/** Display name for a tag; unknown tags render as themselves. */
export function languageLabel(tag: string): string {
  return BY_TAG.get(tag)?.label ?? tag
}
