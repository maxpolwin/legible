/**
 * Line-wrap / soft-hyphen reconstruction (FR-7).
 *
 * Figma wraps text without inserting characters, so a paragraph's rendered
 * lines are substrings of the source text. When those lines are extracted
 * from the PDF (pdftotext, ATS parsers, copy-paste), the extractor joins
 * them — usually with a space or newline. That is correct whenever the wrap
 * happened at whitespace, but wrong when:
 *
 *  - a long token (URL, compound word) was force-wrapped mid-word: joining
 *    with a space splits the keyword;
 *  - a soft hyphen (U+00AD) or explicit hyphen sits at the wrap point.
 *
 * `joinWrappedLines` computes the *correct* extraction text for a set of
 * rendered lines. `paragraphActualText` returns that text only when it
 * differs from what a naive space-join would produce — in that case the PDF
 * builder attaches it as /ActualText on the paragraph's structure element so
 * conforming extractors recover the unbroken text.
 */

const SOFT_HYPHEN = '­'

/** Align `line` inside `source` starting at `from`; -1 if not found. */
function findLine(source: string, line: string, from: number): number {
  const idx = source.indexOf(line, from)
  if (idx !== -1) return idx
  // Tolerate case differences introduced by Figma's textCase transform.
  const lower = source.toLowerCase().indexOf(line.toLowerCase(), from)
  return lower
}

/**
 * Join rendered lines into the text a reader should extract, using the
 * source characters to decide each boundary:
 *  - whitespace between lines in the source -> single space
 *  - explicit source hyphen at the boundary -> keep, no space
 *  - soft hyphen at the boundary -> drop it, no space (word is whole)
 *  - nothing between (force-wrapped token) -> no space
 */
export function joinWrappedLines(lines: string[], source: string): string {
  if (lines.length === 0) return ''
  let result = ''
  let cursor = 0
  let aligned = true

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const idx = aligned ? findLine(source, line, cursor) : -1
    if (idx === -1) {
      aligned = false
      // Fallback heuristic without source alignment: space-join, but keep
      // explicit trailing hyphens unspaced and drop soft hyphens.
      if (i === 0) {
        result = line
      } else if (result.endsWith(SOFT_HYPHEN)) {
        result = result.slice(0, -1) + line
      } else if (result.endsWith('-')) {
        result += line
      } else {
        result += ' ' + line
      }
      continue
    }

    if (i === 0) {
      result = line
    } else {
      const between = source.slice(cursor, idx)
      if (/\s/.test(between) || between.includes(' ')) {
        result += ' ' + line
      } else {
        // No separator in the source: the wrap split a word.
        if (result.endsWith(SOFT_HYPHEN)) result = result.slice(0, -1)
        result += line
      }
    }
    cursor = idx + line.length
  }

  // Soft hyphens anywhere else must never reach extraction either.
  return result.split(SOFT_HYPHEN).join('')
}

/** What a naive extractor produces: lines joined with single spaces. */
export function naiveJoin(lines: string[]): string {
  return lines.join(' ')
}

/**
 * Returns the corrected paragraph text when it differs from the naive join
 * (i.e. when /ActualText is needed to keep keywords unbroken), else null.
 */
export function paragraphActualText(lines: string[], source: string): string | null {
  if (lines.length <= 1) return null
  const joined = joinWrappedLines(lines, source)
  return joined === naiveJoin(lines) ? null : joined
}
