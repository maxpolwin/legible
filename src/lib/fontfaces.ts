import { fsTypeToBits, type FontFileInfo } from './fontmatch'
import { isVariableFont, type InstanceSource } from './instancefont'

/** The subset of a fontkit font this module reads. */
export interface FaceSource extends InstanceSource {
  familyName: string
  subfamilyName: string
  postscriptName: string
  hasGlyphForCodePoint(codePoint: number): boolean
  directory?: { tables?: Record<string, unknown> }
}

/** One selectable face: a static font, or one named style of a variable font. */
export interface FontFace {
  info: FontFileInfo
  /** What to check glyph coverage against (the styled instance for variable fonts). */
  font: FaceSource
  /** Set for variable fonts: build a static instance from `source` at `settings` before embedding. */
  variation?: { source: FaceSource; settings: Record<string, number> }
}

export interface ExpandedFaces {
  faces: FontFace[]
  /** Why the file can't be used (shown to the user); `faces` is empty when set. */
  error?: string
  /** File-level family name for display (typographic family for variable fonts). */
  family: string
  isVariable: boolean
}

function staticInfo(font: FaceSource): FontFileInfo {
  return {
    familyName: String(font.familyName ?? ''),
    subfamilyName: String(font.subfamilyName ?? ''),
    postscriptName: String(font.postscriptName ?? ''),
    fsType: font['OS/2'] ? fsTypeToBits(font['OS/2'].fsType) : 0,
  }
}

/**
 * Turn a parsed font into the faces a design can ask for. A static font is one
 * face. A variable font is one face per named style (Regular, SemiBold, …),
 * each carrying the axis values needed to build a static instance at export.
 * Variable fonts without named styles, or without TrueType outlines, are
 * rejected with a message instead of silently falling back to outlines.
 */
export function expandFaces(font: FaceSource): ExpandedFaces {
  if (!isVariableFont(font)) {
    return { faces: [{ info: staticInfo(font), font }], family: String(font.familyName ?? ''), isVariable: false }
  }
  const family = font.getName?.('preferredFamily') ?? String(font.familyName ?? '')
  const fail = (error: string): ExpandedFaces => ({ faces: [], error, family, isVariable: true })

  if (font.directory?.tables && !('glyf' in font.directory.tables)) {
    return fail(`“${family}” is a variable font with CFF2 outlines, which isn't supported. Use static font files.`)
  }
  const named = font.namedVariations ?? {}
  const entries = Object.entries(named)
  if (entries.length === 0) {
    return fail(`“${family}” is a variable font without named styles. Use its static font files.`)
  }
  const baseInfo = staticInfo(font)
  const psBase = family.replace(/\s+/g, '')
  return {
    family,
    isVariable: true,
    faces: entries.map(([styleName, settings]) => {
      const instance = font.getVariation(settings) as FaceSource
      return {
        info: {
          familyName: family,
          subfamilyName: styleName,
          postscriptName: `${psBase}-${styleName.replace(/\s+/g, '')}`,
          fsType: baseInfo.fsType,
        },
        font: instance,
        variation: { source: font, settings },
      }
    }),
  }
}
