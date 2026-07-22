/**
 * True-text PDF assembly (FR-1, FR-5, FR-6, FR-7).
 *
 * Consumes extracted frames (from the Figma main thread) plus resolved font
 * bytes (from the UI's font manager) and produces a tagged, metadata-
 * complete PDF. All drawing happens through raw content-stream operators so
 * every piece of real content sits inside a marked-content sequence wired
 * into the structure tree, and everything decorative is an Artifact.
 */

import fontkit from '@pdf-lib/fontkit'
import {
  PDFDict,
  PDFDocument,
  PDFFont,
  PDFName,
  PDFNumber,
  PDFOperator,
  PDFPage,
  PDFRef,
  PDFString,
} from 'pdf-lib'
import { mul, translate } from '../matrix'
import { apply } from '../matrix'
import { paragraphActualText } from '../linewrap'
import { parsePathData } from '../svgpath'
import type {
  DocMeta,
  ExtractedFrame,
  ExtractedTextNode,
  FontId,
  Mat23,
  PositionedRun,
  ReportEntry,
  SolidColor,
} from '../types'
import { fontId as makeFontId } from '../types'
import * as ops from './ops'
import { attachMetadataStream, StructTreeBuilder, type PageStructContext, type ParagraphKid } from './tags'

export interface BuildInput {
  frames: ExtractedFrame[]
  meta: DocMeta
  /** Embeddable font bytes per FontId; missing ids were already reported. */
  fonts: Map<FontId, Uint8Array>
}

export interface BuildOutput {
  bytes: Uint8Array
  report: ReportEntry[]
}

/** Deterministic 6-letter subset tag (FNV-1a over the font id). */
function subsetTag(id: string): string {
  let hash = 2166136261
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  let tag = ''
  for (let i = 0; i < 6; i++) {
    tag += String.fromCharCode(65 + ((hash >>> 0) % 26))
    hash = Math.imul(hash ^ (hash >>> 13), 16777619)
  }
  return tag
}

/** Convert a y-down matrix to the equivalent y-up PDF matrix on a page. */
function toPdfMatrix(m: Mat23, pageHeight: number): Mat23 {
  return { a: m.a, b: -m.b, c: -m.c, d: m.d, e: m.e, f: pageHeight - m.f }
}

interface PageResources {
  page: PDFPage
  fontKeys: Map<string, PDFName>
  gsKeys: Map<number, PDFName>
}

function getFontKey(res: PageResources, doc: PDFDocument, font: PDFFont): PDFName {
  const cached = res.fontKeys.get(font.name)
  if (cached) return cached
  const key = res.page.node.newFontDictionary(font.name, font.ref)
  res.fontKeys.set(font.name, key)
  return key
}

function getAlphaKey(res: PageResources, doc: PDFDocument, alpha: number): PDFName {
  const quantized = Math.round(alpha * 100) / 100
  const cached = res.gsKeys.get(quantized)
  if (cached) return cached
  const dict = doc.context.obj({ Type: 'ExtGState', ca: quantized, CA: quantized })
  const ref = doc.context.register(dict)
  const key = res.page.node.newExtGState('GS', ref)
  res.gsKeys.set(quantized, key)
  return key
}

/** Group a node's runs into marked-content sequences by hyperlink value. */
export function groupRunsByLink(runs: PositionedRun[]): PositionedRun[][] {
  const groups: PositionedRun[][] = []
  let current: PositionedRun[] = []
  let currentLink: string | null | undefined = undefined
  for (const run of runs) {
    if (currentLink === undefined || run.style.hyperlink === currentLink) {
      current.push(run)
    } else {
      groups.push(current)
      current = [run]
    }
    currentLink = run.style.hyperlink
  }
  if (current.length > 0) groups.push(current)
  return groups
}

/** Rendered lines of a node, in run order (for FR-7 ActualText). */
export function nodeLines(node: ExtractedTextNode): string[] {
  const byLine = new Map<number, string>()
  for (const run of node.runs) {
    byLine.set(run.lineIndex, (byLine.get(run.lineIndex) ?? '') + run.text)
  }
  return [...byLine.entries()].sort((p, q) => p[0] - q[0]).map(([, text]) => text)
}

function runAdvanceWidth(font: PDFFont, run: PositionedRun): number {
  let width = font.widthOfTextAtSize(run.text, run.style.fontSize)
  if (run.style.letterSpacingPt !== 0) {
    width += run.style.letterSpacingPt * run.text.length
  }
  return width
}

/** Axis-aligned bbox (PDF coords) of a run's text box, honoring rotation. */
function runPdfBounds(
  font: PDFFont,
  run: PositionedRun,
  nodeToFrame: Mat23,
  pageHeight: number
): { x1: number; y1: number; x2: number; y2: number } {
  const size = run.style.fontSize
  const width = runAdvanceWidth(font, run)
  const ascent = size * 0.9
  const descent = size * 0.25
  const local = mul(nodeToFrame, mul(run.transform, translate(run.x, run.y)))
  const corners = [
    { x: 0, y: -ascent },
    { x: width, y: -ascent },
    { x: 0, y: descent },
    { x: width, y: descent },
  ].map((p) => apply(local, p))
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  return {
    x1: Math.min(...xs),
    y1: pageHeight - Math.max(...ys),
    x2: Math.max(...xs),
    y2: pageHeight - Math.min(...ys),
  }
}

function drawBackground(
  doc: PDFDocument,
  page: PDFPage,
  res: PageResources,
  frame: ExtractedFrame
): Promise<void> | void {
  const artifactProps = doc.context.obj({ Type: 'Layout' }) as PDFDict
  if (frame.background.kind === 'solid') {
    const fill = frame.background.fill
    if (!fill || fill.opacity <= 0) return
    page.pushOperators(
      ops.beginArtifact(artifactProps),
      ops.pushState(),
      ops.setGraphicsState(getAlphaKey(res, doc, fill.opacity)),
      ops.setFillRgb(fill.r, fill.g, fill.b),
      ops.rectangle(0, 0, frame.width, frame.height),
      ops.fillNonZero(),
      ops.popState(),
      ops.endMarkedContent()
    )
    return
  }
  const png = frame.background
  return doc.embedPng(png.bytes).then((image) => {
    page.pushOperators(ops.beginArtifact(artifactProps))
    page.drawImage(image, { x: 0, y: 0, width: frame.width, height: frame.height })
    page.pushOperators(ops.endMarkedContent())
  })
}

/** Elevate a quadratic Bezier to cubic (PDF has no quadratic operator). */
function quadToCubic(p0: { x: number; y: number }, c: { x: number; y: number }, p: { x: number; y: number }) {
  return {
    c1: { x: p0.x + (2 / 3) * (c.x - p0.x), y: p0.y + (2 / 3) * (c.y - p0.y) },
    c2: { x: p.x + (2 / 3) * (c.x - p.x), y: p.y + (2 / 3) * (c.y - p.y) },
  }
}

function drawFallbackPaths(
  doc: PDFDocument,
  page: PDFPage,
  res: PageResources,
  node: ExtractedTextNode,
  st: StructTreeBuilder,
  pageCtx: PageStructContext,
  pageHeight: number
): void {
  if (node.fallback?.kind !== 'paths') return
  const mcid = st.takeMcid(pageCtx)
  const props = doc.context.obj({ MCID: mcid }) as PDFDict
  const operators: PDFOperator[] = [ops.beginMarkedContent('Figure', props), ops.pushState()]
  for (const path of node.fallback.paths) {
    const fill = path.fill ?? { r: 0, g: 0, b: 0, opacity: 1 }
    // node-local -> frame -> flip to PDF y-up.
    const toFrame = node.frameTransform
    const flip: Mat23 = { a: 1, b: 0, c: 0, d: -1, e: 0, f: pageHeight }
    const m = mul(flip, toFrame)
    operators.push(
      ops.setGraphicsState(getAlphaKey(res, doc, fill.opacity)),
      ops.setFillRgb(fill.r, fill.g, fill.b)
    )
    let cursor = { x: 0, y: 0 }
    for (const cmd of parsePathData(path.d)) {
      switch (cmd.cmd) {
        case 'M': {
          const p = apply(m, cmd.p)
          operators.push(ops.moveTo(p.x, p.y))
          cursor = cmd.p
          break
        }
        case 'L': {
          const p = apply(m, cmd.p)
          operators.push(ops.lineTo(p.x, p.y))
          cursor = cmd.p
          break
        }
        case 'C': {
          const c1 = apply(m, cmd.c1)
          const c2 = apply(m, cmd.c2)
          const p = apply(m, cmd.p)
          operators.push(ops.curveTo(c1.x, c1.y, c2.x, c2.y, p.x, p.y))
          cursor = cmd.p
          break
        }
        case 'Q': {
          const { c1, c2 } = quadToCubic(cursor, cmd.c1, cmd.p)
          const tc1 = apply(m, c1)
          const tc2 = apply(m, c2)
          const p = apply(m, cmd.p)
          operators.push(ops.curveTo(tc1.x, tc1.y, tc2.x, tc2.y, p.x, p.y))
          cursor = cmd.p
          break
        }
        case 'Z':
          operators.push(ops.closePath())
          break
      }
    }
    operators.push(path.fillRule === 'evenodd' ? ops.fillEvenOdd() : ops.fillNonZero())
  }
  operators.push(ops.popState(), ops.endMarkedContent())
  page.pushOperators(...operators)
  st.figure(pageCtx, mcid, node.characters)
}

async function drawFallbackPng(
  doc: PDFDocument,
  page: PDFPage,
  node: ExtractedTextNode,
  st: StructTreeBuilder,
  pageCtx: PageStructContext,
  pageHeight: number
): Promise<void> {
  if (node.fallback?.kind !== 'png') return
  const image = await doc.embedPng(node.fallback.bytes)
  const mcid = st.takeMcid(pageCtx)
  const props = doc.context.obj({ MCID: mcid }) as PDFDict
  const origin = apply(node.frameTransform, { x: 0, y: 0 })
  page.pushOperators(ops.beginMarkedContent('Figure', props))
  page.drawImage(image, {
    x: origin.x,
    y: pageHeight - origin.y - node.height,
    width: node.width,
    height: node.height,
  })
  page.pushOperators(ops.endMarkedContent())
  st.figure(pageCtx, mcid, node.characters)
}

function drawTextNode(
  doc: PDFDocument,
  page: PDFPage,
  res: PageResources,
  node: ExtractedTextNode,
  fonts: Map<FontId, PDFFont>,
  st: StructTreeBuilder,
  pageCtx: PageStructContext,
  pageHeight: number,
  report: ReportEntry[],
  frameName: string
): void {
  const groups = groupRunsByLink(node.runs)
  const kids: ParagraphKid[] = []
  const annots: Array<{ key: number; mcid: number; ref: PDFRef }> = []

  for (const group of groups) {
    const link = group[0].style.hyperlink
    const mcid = st.takeMcid(pageCtx)
    const tag = link ? 'Span' : 'P'
    const props = doc.context.obj({ MCID: mcid }) as PDFDict
    const operators: PDFOperator[] = [ops.beginMarkedContent(tag, props)]

    for (const run of group) {
      const id = makeFontId(run.style.font)
      const font = fonts.get(id)
      if (!font) {
        // Should not happen (fallback decided upstream); skip run defensively.
        report.push({
          severity: 'warning',
          frameName,
          nodeName: node.name,
          message: `Run skipped: no embedded font for ${run.style.font.family} ${run.style.font.style}`,
        })
        continue
      }
      const size = run.style.fontSize
      const fill = run.style.fill
      const m = mul(node.frameTransform, mul(run.transform, translate(run.x, run.y)))
      const tm = toPdfMatrix(m, pageHeight)
      operators.push(
        ops.beginText(),
        ops.setFont(getFontKey(res, doc, font), size),
        ops.setGraphicsState(getAlphaKey(res, doc, fill.opacity)),
        ops.setFillRgb(fill.r, fill.g, fill.b),
        ops.setCharSpacing(run.style.letterSpacingPt),
        ops.setTextMatrix(tm),
        ops.showText(font.encodeText(run.text)),
        ops.endText()
      )
      if (run.style.underline || run.style.strikethrough) {
        const width = runAdvanceWidth(font, run)
        const offset = run.style.underline ? size * 0.12 : -size * 0.28
        const from = apply(m, { x: 0, y: offset })
        const to = apply(m, { x: width, y: offset })
        operators.push(
          ops.pushState(),
          ops.setLineWidth(Math.max(0.5, size * 0.065)),
          ops.setStrokeRgb(fill.r, fill.g, fill.b),
          ops.moveTo(from.x, pageHeight - from.y),
          ops.lineTo(to.x, pageHeight - to.y),
          ops.stroke(),
          ops.popState()
        )
      }
    }

    operators.push(ops.endMarkedContent())
    page.pushOperators(...operators)

    if (link) {
      // Link annotation covering the group's runs (FR-6).
      let bounds: { x1: number; y1: number; x2: number; y2: number } | null = null
      for (const run of group) {
        const font = fonts.get(makeFontId(run.style.font))
        if (!font) continue
        const b = runPdfBounds(font, run, node.frameTransform, pageHeight)
        bounds = bounds
          ? {
              x1: Math.min(bounds.x1, b.x1),
              y1: Math.min(bounds.y1, b.y1),
              x2: Math.max(bounds.x2, b.x2),
              y2: Math.max(bounds.y2, b.y2),
            }
          : b
      }
      if (bounds) {
        const structParent = st.takeAnnotParentKey()
        const annot = doc.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: [bounds.x1, bounds.y1, bounds.x2, bounds.y2],
          Border: [0, 0, 0],
          F: 4,
          A: { Type: 'Action', S: 'URI', URI: PDFString.of(link) },
          StructParent: structParent,
        })
        annot.set(PDFName.of('Contents'), PDFString.of(link))
        const annotRef = doc.context.register(annot)
        page.node.addAnnot(annotRef)
        // PDF/UA (ISO 14289-1 §7.18.3): a page with any annotation must
        // declare its tab order explicitly; /S follows structure order.
        page.node.set(PDFName.of('Tabs'), PDFName.of('S'))
        kids.push({ kind: 'link', mcid, annotRef, url: link })
        annots.push({ key: structParent, mcid, ref: annotRef })
        continue
      }
    }
    kids.push({ kind: 'mcid', mcid })
  }

  const actualText = paragraphActualText(nodeLines(node), node.characters)
  st.paragraph(pageCtx, kids, actualText)
  for (const annot of annots) {
    st.annotParent(annot.key, pageCtx, annot.mcid)
  }
}

export async function buildPdf(input: BuildInput): Promise<BuildOutput> {
  const report: ReportEntry[] = []
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)

  // Subset-embed each resolved font once, shared across pages. The
  // ABCDEF+Name subset prefix is the ISO 32000 convention; pdf-lib does not
  // add it itself, and tools like pdffonts look for it.
  const fonts = new Map<FontId, PDFFont>()
  for (const [id, bytes] of input.fonts) {
    const baseName = id.replace(/##/g, '-').replace(/[^A-Za-z0-9-]/g, '')
    fonts.set(id, await doc.embedFont(bytes, { subset: true, customName: `${subsetTag(id)}+${baseName}` }))
  }

  const st = new StructTreeBuilder(doc)

  for (const frame of input.frames) {
    const page = doc.addPage([frame.width, frame.height])
    const res: PageResources = { page, fontKeys: new Map(), gsKeys: new Map() }
    const pageCtx = st.page(page)

    await drawBackground(doc, page, res, frame)

    const byId = new Map(frame.texts.map((t) => [t.id, t]))
    const orderedIds = [
      ...frame.readingOrder.filter((id) => byId.has(id)),
      ...frame.texts.filter((t) => !frame.readingOrder.includes(t.id)).map((t) => t.id),
    ]
    for (const id of orderedIds) {
      const node = byId.get(id) as ExtractedTextNode
      if (node.fallback?.kind === 'paths') {
        drawFallbackPaths(doc, page, res, node, st, pageCtx, frame.height)
      } else if (node.fallback?.kind === 'png') {
        await drawFallbackPng(doc, page, node, st, pageCtx, frame.height)
      } else {
        drawTextNode(doc, page, res, node, fonts, st, pageCtx, frame.height, report, frame.name)
      }
    }
  }

  st.finish()

  doc.setTitle(input.meta.title, { showInWindowTitleBar: true })
  if (input.meta.author) doc.setAuthor(input.meta.author)
  doc.setCreator('Legible PDF (Figma plugin)')
  doc.setProducer('Legible PDF')
  if (input.meta.language) doc.setLanguage(input.meta.language)
  attachMetadataStream(doc, input.meta)

  const bytes = await doc.save({ useObjectStreams: false })
  return { bytes, report }
}
