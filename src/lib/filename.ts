/** Filename pattern persistence (FR-3): `yyyymmdd - name.pdf`. */

const ILLEGAL_CHARS = /[/\\:*?"<>|]/g
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g

/** File names Figma hands out before the user has named anything. */
const GENERIC_FILE_NAMES = /^(untitled|unbenannt)(\s+\d+)?$/i
/** Default page (tab) names: "Page 1", "Seite 2", … */
const GENERIC_PAGE_NAMES = /^(page|seite)\s*\d*$/i

export function formatDatePrefix(date: Date): string {
  const y = date.getFullYear().toString().padStart(4, '0')
  const m = (date.getMonth() + 1).toString().padStart(2, '0')
  const d = date.getDate().toString().padStart(2, '0')
  return `${y}${m}${d}`
}

/** Strip characters that are illegal in filenames on macOS/Windows/Linux. */
export function sanitizeName(name: string): string {
  return name.replace(ILLEGAL_CHARS, '').replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * The name the filename box starts out with: the Figma file's name, falling
 * back to the current page (tab) when the file itself is still called
 * "Untitled" — an unnamed file usually has a named page.
 */
export function defaultExportName(fileName: string, pageName = ''): string {
  const file = sanitizeName(fileName)
  const page = sanitizeName(pageName)
  if (file !== '' && !GENERIC_FILE_NAMES.test(file)) return file
  if (page !== '' && !GENERIC_PAGE_NAMES.test(page)) return page
  return file !== '' ? file : page
}

/**
 * The editable string the filename box is prefilled with: `yyyymmdd - name`.
 * The date is only a starting point — the user owns the whole string from
 * there, including the prefix.
 */
export function buildBaseName(date: Date, name: string): string {
  const clean = sanitizeName(name)
  return clean.length > 0 ? `${formatDatePrefix(date)} - ${clean}` : formatDatePrefix(date)
}

/**
 * Drops a `yyyymmdd` prefix so only the name part is remembered — the prefix
 * is re-derived from the current date the next time the plugin opens, rather
 * than persisting the day it was first typed.
 */
export function stripDatePrefix(base: string): string {
  return sanitizeName(base.replace(/^\d{8}(\s*-\s*|\s+)?/, ''))
}

/** The download name for whatever the user left in the filename box. */
export function filenameFromBase(base: string, fallbackDate: Date): string {
  const clean = sanitizeName(base.replace(/\.pdf$/i, ''))
  return `${clean.length > 0 ? clean : formatDatePrefix(fallbackDate)}.pdf`
}

export function buildFilename(date: Date, name: string): string {
  return filenameFromBase(buildBaseName(date, name), date)
}
