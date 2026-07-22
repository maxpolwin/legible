import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFString,
} from 'pdf-lib'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildPdf } from '../src/lib/pdf/build'
import type { DocMeta } from '../src/lib/types'
import { fontId } from '../src/lib/types'
import {
  extractPageTexts,
  fixture,
  frame,
  GARAMOND,
  hasFixture,
  LATO_BOLD,
  LATO_REGULAR,
  run,
  textNode,
} from './helpers'

const META: DocMeta = { title: '20260703 - Test CV', author: 'Max Mustermann', language: 'de-DE' }

const FIXTURES_PRESENT = hasFixture('Lato-Regular.ttf') && hasFixture('Lato-Bold.ttf')

function latoFonts(): Map<string, Uint8Array> {
  return new Map([
    [fontId(LATO_REGULAR), fixture('Lato-Regular.ttf')],
    [fontId(LATO_BOLD), fixture('Lato-Bold.ttf')],
  ])
}

describe.skipIf(!FIXTURES_PRESENT)('buildPdf (FR-1)', () => {
  it('produces fully extractable text with embedded fonts', async () => {
    const node = textNode('n1', 40, 60, [
      run('Senior Product Designer', 0, 10, 0),
      run(' — Erfahrung in München', 0, 24, 1, { font: LATO_BOLD }),
    ])
    const { bytes } = await buildPdf({ frames: [frame([node])], meta: META, fonts: latoFonts() })

    const pages = await extractPageTexts(bytes)
    expect(pages).toHaveLength(1)
    expect(pages[0]).toContain('Senior Product Designer')
    expect(pages[0]).toContain('Erfahrung in München')

    const raw = Buffer.from(bytes).toString('latin1')
    expect(raw).toMatch(/\/FontFile2|\/FontFile3/)
    expect(raw).toContain('/ToUnicode')
  })

  it('keeps German diacritics intact through extraction (§8 localisation)', async () => {
    const text = 'Straße Übung Ärger Öl größer'
    const node = textNode('n1', 40, 60, [run(text, 0, 10, 0)])
    const { bytes } = await buildPdf({ frames: [frame([node])], meta: META, fonts: latoFonts() })
    const pages = await extractPageTexts(bytes)
    expect(pages[0]).toContain('Straße')
    expect(pages[0]).toContain('Übung')
    expect(pages[0]).toContain('Ärger')
    expect(pages[0]).toContain('Öl')
    expect(pages[0]).toContain('größer')
  })

  it('emits pages in the given frame order with correct sizes', async () => {
    const cv = frame([textNode('a', 0, 0, [run('Lebenslauf', 0, 10, 0)])])
    const letter = {
      ...frame([textNode('b', 0, 0, [run('Anschreiben', 0, 10, 0)])]),
      id: 'frame-2',
      width: 600,
      height: 850,
    }
    const { bytes } = await buildPdf({ frames: [cv, letter], meta: META, fonts: latoFonts() })
    const pages = await extractPageTexts(bytes)
    expect(pages[0]).toContain('Lebenslauf')
    expect(pages[1]).toContain('Anschreiben')

    const doc = await PDFDocument.load(bytes)
    expect(doc.getPage(0).getSize()).toEqual({ width: 595, height: 842 })
    expect(doc.getPage(1).getSize()).toEqual({ width: 600, height: 850 })
  })

  it('stays in the ~100 KB class for a two-page text document (§8)', async () => {
    const paragraphs = Array.from({ length: 20 }, (_, i) =>
      textNode(`p${i}`, 40, 40 + i * 38, [
        run('Berufserfahrung als Anwendungsentwickler mit Schwerpunkt auf', 0, 10, 0),
        run('barrierefreie Systeme, Typografie und maschinenlesbare Dokumente.', 0, 24, 1),
      ])
    )
    const page1 = frame(paragraphs.slice(0, 10))
    const page2 = { ...frame(paragraphs.slice(10)), id: 'frame-2' }
    const { bytes } = await buildPdf({ frames: [page1, page2], meta: META, fonts: latoFonts() })
    expect(bytes.byteLength).toBeLessThan(150_000)
  })
})

describe.skipIf(!FIXTURES_PRESENT || !hasFixture('EBGaramond.ttf'))('ligature ToUnicode (FR-1 §2)', () => {
  it('extracts fi/fl/ffi ligature-prone words as plain character pairs', async () => {
    const text = 'Configuration efficient affinity floating final'
    const node = textNode('n1', 40, 60, [run(text, 0, 12, 0, { font: GARAMOND, fontSize: 12 })])
    const fonts = new Map([[fontId(GARAMOND), fixture('EBGaramond.ttf')]])
    const { bytes } = await buildPdf({ frames: [frame([node])], meta: META, fonts })
    const pages = await extractPageTexts(bytes)
    for (const word of ['Configuration', 'efficient', 'affinity', 'floating', 'final']) {
      expect(pages[0]).toContain(word)
    }
    // No ligature codepoints (U+FB00..U+FB06) may leak into extraction.
    expect(pages[0]).not.toMatch(/[ﬀ-ﬆ]/)
  })
})

describe.skipIf(!FIXTURES_PRESENT)('tagged structure tree (FR-1 reading order)', () => {
  async function loadStructTree(bytes: Uint8Array) {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false })
    const rootRef = doc.catalog.get(PDFName.of('StructTreeRoot')) as PDFRef
    expect(rootRef).toBeInstanceOf(PDFRef)
    const root = doc.context.lookup(rootRef, PDFDict)
    return { doc, root }
  }

  function lookupKids(doc: PDFDocument, dict: PDFDict): PDFDict[] {
    const k = doc.context.lookup(dict.get(PDFName.of('K')))
    if (k instanceof PDFArray) {
      return k.asArray().map((entry) => doc.context.lookup(entry, PDFDict))
    }
    return [doc.context.lookup(k, PDFDict)]
  }

  function elemText(doc: PDFDocument, elem: PDFDict, key: string): string | null {
    const value = elem.get(PDFName.of(key))
    if (value instanceof PDFHexString) return value.decodeText()
    if (value instanceof PDFString) return value.decodeText()
    return null
  }

  it('builds StructTreeRoot -> Document -> P elements in reading order', async () => {
    const first = textNode('first', 20, 40, [run('First paragraph', 0, 10, 0)])
    const second = textNode('second', 20, 80, [run('Second paragraph', 0, 10, 0)])
    const { bytes } = await buildPdf({
      frames: [frame([second, first], ['first', 'second'])],
      meta: META,
      fonts: latoFonts(),
    })

    const { doc, root } = await loadStructTree(bytes)
    expect(root.get(PDFName.of('Type'))?.toString()).toBe('/StructTreeRoot')

    const markInfo = doc.context.lookup(doc.catalog.get(PDFName.of('MarkInfo')), PDFDict)
    expect(markInfo.get(PDFName.of('Marked'))?.toString()).toBe('true')

    const documentElem = lookupKids(doc, root)[0]
    expect(documentElem.get(PDFName.of('S'))?.toString()).toBe('/Document')

    const paragraphs = lookupKids(doc, documentElem)
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs.every((p) => p.get(PDFName.of('S'))?.toString() === '/P')).toBe(true)

    // ParentTree must map every MCID back to its element.
    const parentTree = doc.context.lookup(root.get(PDFName.of('ParentTree')), PDFDict)
    const nums = doc.context.lookup(parentTree.get(PDFName.of('Nums')), PDFArray)
    expect(nums.size()).toBeGreaterThanOrEqual(2)

    // Page carries StructParents.
    const page = doc.getPage(0)
    expect(page.node.get(PDFName.of('StructParents'))).toBeInstanceOf(PDFNumber)
  })

  it('writes /ActualText when a wrap splits a keyword (FR-7)', async () => {
    const url = 'https://github.com/example/legible'
    const node = textNode(
      'n1',
      20,
      40,
      [run('https://github.com/exam', 0, 10, 0), run('ple/legible', 0, 24, 1)],
      url
    )
    const { bytes } = await buildPdf({ frames: [frame([node])], meta: META, fonts: latoFonts() })
    const { doc, root } = await loadStructTree(bytes)
    const documentElem = lookupKids(doc, root)[0]
    const para = lookupKids(doc, documentElem)[0]
    expect(elemText(doc, para, 'ActualText')).toBe(url)
  })

  it('omits /ActualText for ordinary whitespace wraps', async () => {
    const source = 'ten years of experience'
    const node = textNode('n1', 20, 40, [run('ten years', 0, 10, 0), run('of experience', 0, 24, 1)], source)
    const { bytes } = await buildPdf({ frames: [frame([node])], meta: META, fonts: latoFonts() })
    const { doc, root } = await loadStructTree(bytes)
    const para = lookupKids(doc, lookupKids(doc, root)[0])[0]
    expect(para.get(PDFName.of('ActualText'))).toBeUndefined()
  })

  it('tags outline-fallback nodes as Figure with the source text as Alt (FR-5)', async () => {
    const node = {
      ...textNode('n1', 20, 40, [], 'Outlined wordmark text'),
      fallback: {
        kind: 'paths' as const,
        reason: 'test',
        paths: [{ d: 'M0 0L10 0L10 10Z', fill: { r: 0, g: 0, b: 0, opacity: 1 }, fillRule: 'nonzero' as const }],
      },
    }
    const { bytes } = await buildPdf({ frames: [frame([node])], meta: META, fonts: latoFonts() })
    const { doc, root } = await loadStructTree(bytes)
    const figure = lookupKids(doc, lookupKids(doc, root)[0])[0]
    expect(figure.get(PDFName.of('S'))?.toString()).toBe('/Figure')
    expect(elemText(doc, figure, 'Alt')).toBe('Outlined wordmark text')
  })
})

describe.skipIf(!FIXTURES_PRESENT)('hyperlinks (FR-6)', () => {
  it('emits a Link annotation with URI action and structure-tree Link element', async () => {
    const url = 'https://www.linkedin.com/in/example'
    const node = textNode('n1', 40, 60, [
      run('Kontakt: ', 0, 10, 0),
      run('LinkedIn-Profil', 46, 10, 0, { hyperlink: url, underline: true }),
    ])
    const { bytes } = await buildPdf({ frames: [frame([node])], meta: META, fonts: latoFonts() })

    const doc = await PDFDocument.load(bytes)
    const page = doc.getPage(0)
    const annots = page.node.Annots()
    expect(annots).toBeDefined()
    expect(annots!.size()).toBe(1)
    const annot = doc.context.lookup(annots!.get(0), PDFDict)
    expect(annot.get(PDFName.of('Subtype'))?.toString()).toBe('/Link')
    const action = doc.context.lookup(annot.get(PDFName.of('A')), PDFDict)
    expect(doc.context.lookup(action.get(PDFName.of('URI')), PDFString).decodeText()).toBe(url)
    expect(annot.get(PDFName.of('StructParent'))).toBeInstanceOf(PDFNumber)

    // The annotation rect must sit inside the page and around the link text.
    const rect = doc.context.lookup(annot.get(PDFName.of('Rect')), PDFArray)
    const [x1, y1, x2, y2] = rect.asArray().map((n) => (n as PDFNumber).asNumber())
    expect(x2).toBeGreaterThan(x1)
    expect(y2).toBeGreaterThan(y1)
    expect(x1).toBeGreaterThanOrEqual(40)
    expect(y1).toBeGreaterThan(700) // near the top of an A4 page (842pt)

    // Structure: P -> Link -> [mcid, OBJR].
    const rootRef = doc.catalog.get(PDFName.of('StructTreeRoot')) as PDFRef
    const root = doc.context.lookup(rootRef, PDFDict)
    const documentElem = doc.context.lookup(
      (doc.context.lookup(root.get(PDFName.of('K'))) as PDFRef | PDFDict) instanceof PDFDict
        ? (root.get(PDFName.of('K')) as PDFRef)
        : (root.get(PDFName.of('K')) as PDFRef),
      PDFDict
    )
    const kArray = doc.context.lookup(documentElem.get(PDFName.of('K')), PDFArray)
    const para = doc.context.lookup(kArray.get(0), PDFDict)
    const paraKids = doc.context.lookup(para.get(PDFName.of('K')), PDFArray)
    const kidDicts = paraKids
      .asArray()
      .map((entry) => (entry instanceof PDFRef ? doc.context.lookup(entry, PDFDict) : null))
      .filter((d): d is PDFDict => d !== null)
    const linkElem = kidDicts.find((d) => d.get(PDFName.of('S'))?.toString() === '/Link')
    expect(linkElem).toBeDefined()
    const linkKids = doc.context.lookup(linkElem!.get(PDFName.of('K')), PDFArray)
    const objr = doc.context.lookup(linkKids.get(1), PDFDict)
    expect(objr.get(PDFName.of('Type'))?.toString()).toBe('/OBJR')
  })
})

describe.skipIf(!FIXTURES_PRESENT)('raster backgrounds and fallbacks (FR-4, FR-5)', () => {
  // 1x1 red pixel.
  const PNG_1PX = Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )
  )

  it('draws a PNG background as a tagged Artifact behind real text', async () => {
    const node = textNode('n1', 40, 60, [run('Über dem Hintergrund', 0, 10, 0)])
    const withPngBackground = {
      ...frame([node]),
      background: { kind: 'png' as const, bytes: PNG_1PX, scale: 96 / 72 },
    }
    const { bytes } = await buildPdf({ frames: [withPngBackground], meta: META, fonts: latoFonts() })
    const pages = await extractPageTexts(bytes)
    expect(pages[0]).toContain('Über dem Hintergrund')

    // Content streams are Flate-compressed; decode to check the operators.
    const doc = await PDFDocument.load(bytes)
    const page = doc.getPage(0)
    const contents = doc.context.lookup(page.node.get(PDFName.of('Contents')))
    const streamRefs = contents instanceof PDFArray ? contents.asArray() : [contents]
    const decoded = streamRefs
      .map((ref) => {
        const stream = doc.context.lookup(ref, PDFRawStream)
        return Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')
      })
      .join('\n')
    expect(decoded).toContain('/Artifact')
    expect(decoded).toMatch(/BDC/)
    expect(decoded).toMatch(/EMC/)
    expect(decoded).toContain('/MCID')
  })

  it('draws PNG-fallback text nodes as tagged Figures with Alt text', async () => {
    const node = {
      ...textNode('n1', 40, 60, [], 'Bildtext für Screenreader'),
      fallback: { kind: 'png' as const, reason: 'missing font', bytes: PNG_1PX, scale: 1 },
    }
    const { bytes } = await buildPdf({ frames: [frame([node])], meta: META, fonts: latoFonts() })
    const doc = await PDFDocument.load(bytes)
    const rootRef = doc.catalog.get(PDFName.of('StructTreeRoot')) as PDFRef
    const root = doc.context.lookup(rootRef, PDFDict)
    const documentElem = doc.context.lookup(doc.context.lookup(root.get(PDFName.of('K'))), PDFDict)
    const kids = doc.context.lookup(documentElem.get(PDFName.of('K')), PDFArray)
    const figure = doc.context.lookup(kids.get(0), PDFDict)
    expect(figure.get(PDFName.of('S'))?.toString()).toBe('/Figure')
    const alt = figure.get(PDFName.of('Alt'))
    expect(alt).toBeInstanceOf(PDFHexString)
    expect((alt as PDFHexString).decodeText()).toBe('Bildtext für Screenreader')
  })
})

describe.skipIf(!FIXTURES_PRESENT)('metadata (FR-1)', () => {
  it('writes Title, Author, Language and viewer preferences', async () => {
    const node = textNode('n1', 40, 60, [run('Inhalt', 0, 10, 0)])
    const { bytes } = await buildPdf({ frames: [frame([node])], meta: META, fonts: latoFonts() })
    const doc = await PDFDocument.load(bytes, { updateMetadata: false })
    expect(doc.getTitle()).toBe(META.title)
    expect(doc.getAuthor()).toBe(META.author)
    expect(doc.getProducer()).toBe('Legible PDF')
    const lang = doc.catalog.get(PDFName.of('Lang'))
    expect(lang).toBeDefined()
    const viewerPrefs = doc.catalog.getOrCreateViewerPreferences()
    expect(viewerPrefs.getDisplayDocTitle()).toBe(true)
  })
})
