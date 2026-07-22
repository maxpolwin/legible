import { beforeEach, describe, expect, it } from 'vitest'
import type { StoredFontMeta } from '../src/lib/types'

/**
 * Simulates figma.clientStorage: an async key-value store with a small
 * artificial delay on get/set, matching real clientStorage's IPC round-trip
 * closely enough to expose read-modify-write races between concurrent calls.
 */
function makeClientStorage() {
  const data = new Map<string, unknown>()
  const delay = () => new Promise((resolve) => setTimeout(resolve, 1))
  return {
    async getAsync(key: string) {
      await delay()
      return data.get(key)
    },
    async setAsync(key: string, value: unknown) {
      await delay()
      data.set(key, value)
    },
    async deleteAsync(key: string) {
      await delay()
      data.delete(key)
    },
  }
}

function meta(id: string): StoredFontMeta {
  return { id, family: 'Inter', style: id, postscriptName: `Inter-${id}`, byteLength: 4 }
}

describe('font storage persistence (clientStorage index)', () => {
  beforeEach(() => {
    ;(globalThis as { figma?: unknown }).figma = {
      ui: { onmessage: undefined, postMessage: () => undefined },
      clientStorage: makeClientStorage(),
      base64Encode: (bytes: Uint8Array) => Buffer.from(bytes).toString('base64'),
      base64Decode: (base64: string) => new Uint8Array(Buffer.from(base64, 'base64')),
    }
  })

  it('keeps every font in the index when multiple files are dropped together', async () => {
    const { storeFont, loadStoredFonts } = await import('../src/main')
    const weights = ['Regular', 'Bold', 'Italic', 'Bold Italic']

    // Mirrors ui.tsx's handleFontFiles: each file's STORE_FONT is fired
    // without waiting for the previous one to finish (fire-and-forget).
    await Promise.all(weights.map((w) => storeFont(meta(w), new Uint8Array([1, 2, 3, 4]))))

    const stored = await loadStoredFonts()
    const ids = stored.map((f) => f.meta.id).sort()
    expect(ids).toEqual([...weights].sort())
  })

  it('does not resurrect a font deleted concurrently with an unrelated store', async () => {
    const { storeFont, deleteFont, loadStoredFonts } = await import('../src/main')
    await storeFont(meta('Regular'), new Uint8Array([1]))
    await storeFont(meta('Bold'), new Uint8Array([2]))

    await Promise.all([deleteFont('Regular'), storeFont(meta('Italic'), new Uint8Array([3]))])

    const ids = (await loadStoredFonts()).map((f) => f.meta.id).sort()
    expect(ids).toEqual(['Bold', 'Italic'])
  })
})
