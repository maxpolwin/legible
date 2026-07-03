/** Filename pattern persistence (FR-3): `yyyymmdd - name.pdf`. */

const ILLEGAL_CHARS = /[/\\:*?"<>|]/g
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g

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

export function buildFilename(date: Date, name: string): string {
  const clean = sanitizeName(name)
  const base = clean.length > 0 ? `${formatDatePrefix(date)} - ${clean}` : formatDatePrefix(date)
  return `${base}.pdf`
}
