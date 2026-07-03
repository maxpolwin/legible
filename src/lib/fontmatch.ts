import type { FontKey } from './types'

/**
 * Font identification + embeddability policy (FR-5).
 *
 * Matching is deliberately forgiving about style naming ("Semi Bold" vs
 * "SemiBold", "Regular" vs "Normal") but strict about family names.
 */

export interface FontFileInfo {
  familyName: string
  subfamilyName: string
  postscriptName: string
  fsType: number
}

export interface FontCandidate<T> {
  info: FontFileInfo
  value: T
}

const STYLE_SYNONYMS: Record<string, string> = {
  normal: 'regular',
  book: 'regular',
  roman: 'regular',
  plain: 'regular',
  oblique: 'italic',
}

export function normalizeFamily(name: string): string {
  return name.toLowerCase().replace(/[\s_-]+/g, ' ').trim()
}

export function normalizeStyle(style: string): string {
  let s = style.toLowerCase().replace(/[\s_-]+/g, '')
  for (const [from, to] of Object.entries(STYLE_SYNONYMS)) {
    if (s === from) s = to
    s = s.replace(new RegExp(from, 'g'), to)
  }
  return s
}

/**
 * Match a Figma FontKey against parsed font files. Tries, in order:
 *  1. family + subfamily exact (normalized)
 *  2. "family subfamily" concatenation matches Figma family (some families
 *     surface weights inside the family name, e.g. "Inter Display Bold")
 *  3. candidate's family alone matches "family style" (the reverse case: a
 *     non-bold/italic weight folded into the family name per OpenType
 *     convention, subfamily "Regular" — e.g. static instances cut from a
 *     variable font report family "Inter Medium", subfamily "Regular")
 *  4. postscript name `Family-Style`
 */
export function matchFont<T>(needed: FontKey, candidates: Array<FontCandidate<T>>): FontCandidate<T> | null {
  const family = normalizeFamily(needed.family)
  const style = normalizeStyle(needed.style)
  const wantedConcat = normalizeFamily(`${needed.family} ${needed.style}`)

  for (const c of candidates) {
    if (normalizeFamily(c.info.familyName) === family && normalizeStyle(c.info.subfamilyName) === style) {
      return c
    }
  }
  for (const c of candidates) {
    const concat = normalizeFamily(`${c.info.familyName} ${c.info.subfamilyName}`)
    if (concat === wantedConcat || concat === family) {
      return c
    }
  }
  for (const c of candidates) {
    if (normalizeFamily(c.info.familyName) === wantedConcat) {
      return c
    }
  }
  const psWanted = `${family.replace(/\s/g, '')}-${style}`
  for (const c of candidates) {
    if (c.info.postscriptName.toLowerCase() === psWanted) return c
  }
  return null
}

export interface Embeddability {
  ok: boolean
  reason?: string
}

/**
 * OS/2 fsType embedding policy. Per the OpenType spec, bits 0-3 form the
 * usage-permissions field where the least restrictive set bit wins;
 * 0x0002 with no other permission bit means "restricted license, no
 * embedding". 0x0200 means bitmap-embedding-only, which is useless for
 * vector text. Preview & Print (0x0004) and Editable (0x0008) both permit
 * embedding a document for viewing/printing, which is what a CV needs.
 */
export function checkEmbeddability(fsType: number): Embeddability {
  const usage = fsType & 0x000f
  const restricted = (usage & 0x0002) !== 0 && (usage & 0x000c) === 0
  if (restricted) {
    return { ok: false, reason: 'Font license forbids embedding (fsType: restricted)' }
  }
  if ((fsType & 0x0200) !== 0) {
    return { ok: false, reason: 'Font allows bitmap embedding only (fsType: 0x0200)' }
  }
  return { ok: true }
}
