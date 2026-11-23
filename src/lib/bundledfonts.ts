import { BUNDLED_DATA, BUNDLED_INDEX } from './bundledfonts.generated'
import type { FontFileInfo } from './fontmatch'

/**
 * Fonts shipped inside the plugin (Latin subsets of open-licensed families,
 * built by scripts/build-fonts.sh), so common fonts need no upload and use no
 * clientStorage. Matching uses the index only; bytes are decoded on demand.
 */
export interface BundledFace {
  info: FontFileInfo
  file: string
}

export function bundledFaces(): BundledFace[] {
  return BUNDLED_INDEX.map((e) => ({
    file: e.file,
    info: { familyName: e.family, subfamilyName: e.style, postscriptName: e.postscriptName, fsType: e.fsType },
  }))
}

export function bundledBytes(file: string): Uint8Array {
  const base64 = BUNDLED_DATA[file]
  if (base64 === undefined) throw new Error(`Unknown bundled font: ${file}`)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
