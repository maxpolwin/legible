/**
 * Legible PDF — Figma main thread.
 *
 * Responsibilities: scope resolution (selection vs whole file), text/style
 * extraction via SVG export + styled segments, background rendering with
 * text hidden, outline/raster fallbacks for non-embeddable fonts (FR-5),
 * and clientStorage persistence (FR-3). PDF construction happens in the UI.
 */

import { emit, on, showUI } from '@create-figma-plugin/utilities'
import { attributeRuns, type StyledSegment } from './lib/attribute'
import type {
  DeleteFontHandler,
  ExportHandler,
  NotifyHandler,
  ResizeHandler,
  SaveSettingsHandler,
  StoreFontHandler,
  UiReadyHandler,
} from './lib/events'
import { computeReadingOrder, rowMajorOrder, type OrderBox } from './lib/order'
import { extractSvgPaths, extractSvgTextRuns, parseCssColor } from './lib/svgtext'
import { transformPathData, UnsupportedPathCommandError } from './lib/svgpath'
import { translate } from './lib/matrix'
import {
  DEFAULT_SETTINGS,
  fontId,
  type ExportRequest,
  type ExtractedFrame,
  type ExtractedPath,
  type ExtractedTextNode,
  type FontKey,
  type FrameBackground,
  type FrameSummary,
  type PluginSettings,
  type ReportEntry,
  type SolidColor,
  type StoredFontMeta,
  type TextNodeSummary,
} from './lib/types'

type FrameLike = FrameNode | ComponentNode | InstanceNode

const SETTINGS_KEY = 'legible.settings.v1'
const FONT_INDEX_KEY = 'legible.fonts.index.v1'
const FONT_DATA_PREFIX = 'legible.fonts.data.v1.'

/* ------------------------------------------------------------------ */
/* Scope + summaries                                                   */
/* ------------------------------------------------------------------ */

function isFrameLike(node: BaseNode): node is FrameLike {
  return node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE'
}

async function resolveScope(): Promise<{ frames: FrameLike[]; scopedAll: boolean }> {
  const selected: FrameLike[] = []
  for (const node of figma.currentPage.selection) {
    if (isFrameLike(node)) {
      selected.push(node)
    } else if (node.type === 'SECTION') {
      for (const child of node.children) {
        if (isFrameLike(child)) selected.push(child)
      }
    }
  }
  if (selected.length > 0) {
    return { frames: sortFramesByCanvasPosition(selected), scopedAll: false }
  }
  await figma.loadAllPagesAsync()
  const all: FrameLike[] = []
  for (const page of figma.root.children) {
    const pageFrames = page.children.filter(isFrameLike)
    all.push(...sortFramesByCanvasPosition(pageFrames))
  }
  return { frames: all, scopedAll: true }
}

/** Default page order (FR-2): canvas position, left-to-right, top-to-bottom. */
function sortFramesByCanvasPosition(frames: FrameLike[]): FrameLike[] {
  const boxes: OrderBox[] = frames.map((f) => {
    const bb = f.absoluteBoundingBox
    return { id: f.id, x: bb?.x ?? f.x, y: bb?.y ?? f.y, w: bb?.width ?? f.width, h: bb?.height ?? f.height }
  })
  const order = rowMajorOrder(boxes)
  const byId = new Map(frames.map((f) => [f.id, f]))
  return order.map((id) => byId.get(id) as FrameLike)
}

function isNodeVisible(node: SceneNode, root: SceneNode): boolean {
  let current: BaseNode | null = node
  while (current && current.id !== root.id) {
    if ('visible' in current && !(current as SceneNode).visible) return false
    if ('opacity' in current && (current as MinimalBlendMixin).opacity === 0) return false
    current = current.parent
  }
  return true
}

function collectTextNodes(frame: FrameLike): TextNode[] {
  return frame
    .findAll((n) => n.type === 'TEXT')
    .filter((n): n is TextNode => n.type === 'TEXT')
    .filter((n) => isNodeVisible(n, frame) && n.characters.length > 0)
}

function firstVisibleSolid(paints: readonly Paint[] | typeof figma.mixed): SolidColor | null {
  if (paints === figma.mixed) return null
  for (const paint of paints) {
    if (paint.type === 'SOLID' && paint.visible !== false) {
      return { r: paint.color.r, g: paint.color.g, b: paint.color.b, opacity: paint.opacity ?? 1 }
    }
  }
  return null
}

function nodeFonts(node: TextNode): FontKey[] {
  try {
    const segments = node.getStyledTextSegments(['fontName'])
    const seen = new Map<string, FontKey>()
    for (const seg of segments) {
      const key = { family: seg.fontName.family, style: seg.fontName.style }
      seen.set(fontId(key), key)
    }
    return [...seen.values()]
  } catch {
    return []
  }
}

function frameRelativeBox(node: SceneNode, frame: FrameLike): { x: number; y: number; w: number; h: number } {
  const nb = node.absoluteBoundingBox
  const fb = frame.absoluteBoundingBox
  if (!nb || !fb) return { x: 0, y: 0, w: 0, h: 0 }
  return { x: nb.x - fb.x, y: nb.y - fb.y, w: nb.width, h: nb.height }
}

function hasVisibleImageFill(node: SceneNode): boolean {
  if (!('fills' in node)) return false
  const fills = (node as GeometryMixin).fills
  if (fills === figma.mixed) return false
  return fills.some((p) => p.type === 'IMAGE' && p.visible !== false)
}

function rendersNonTextContent(node: SceneNode, frame: FrameLike): boolean {
  if (node.id === frame.id || node.type === 'TEXT') return false
  if (!isNodeVisible(node, frame)) return false
  switch (node.type) {
    case 'GROUP':
    case 'SECTION':
      return false
    case 'FRAME':
    case 'COMPONENT':
    case 'INSTANCE': {
      const n = node as FrameNode
      const hasFill = n.fills !== figma.mixed && (n.fills as readonly Paint[]).some((p) => p.visible !== false)
      const hasStroke = n.strokes.some((p) => p.visible !== false)
      return hasFill || hasStroke
    }
    default: {
      if ('fills' in node || 'strokes' in node) {
        const g = node as GeometryMixin
        const hasFill = g.fills !== figma.mixed && (g.fills as readonly Paint[]).some((p) => p.visible !== false)
        const hasStroke = 'strokes' in node && g.strokes.some((p) => p.visible !== false)
        return hasFill || hasStroke
      }
      return true
    }
  }
}

function summarizeFrame(frame: FrameLike): FrameSummary {
  const texts: TextNodeSummary[] = collectTextNodes(frame).map((node) => ({
    id: node.id,
    name: node.name,
    preview: node.characters.slice(0, 60).replace(/\n/g, ' '),
    box: frameRelativeBox(node, frame),
    fonts: nodeFonts(node).map(fontId),
    hasMissingFont: node.hasMissingFont,
    charCount: node.characters.length,
  }))

  let imageAreaPt2 = 0
  let hasNonTextContent = false
  for (const node of frame.findAll(() => true)) {
    if (!isNodeVisible(node, frame)) continue
    if (hasVisibleImageFill(node)) {
      const bb = node.absoluteBoundingBox
      if (bb) imageAreaPt2 += bb.width * bb.height
    }
    if (rendersNonTextContent(node, frame)) hasNonTextContent = true
  }

  const fills = frame.fills
  const visibleFills = fills === figma.mixed ? [] : (fills as readonly Paint[]).filter((p) => p.visible !== false)
  const solidBackground = visibleFills.length === 0 || (visibleFills.length === 1 && visibleFills[0].type === 'SOLID')
  if (!solidBackground) hasNonTextContent = true

  return {
    id: frame.id,
    name: frame.name,
    width: frame.width,
    height: frame.height,
    texts,
    imageAreaPt2,
    hasNonTextContent,
    backgroundFill: firstVisibleSolid(fills),
  }
}

/* ------------------------------------------------------------------ */
/* Extraction                                                          */
/* ------------------------------------------------------------------ */

function toStyledSegments(node: TextNode): StyledSegment[] {
  const segments = node.getStyledTextSegments([
    'fontName',
    'fontSize',
    'fills',
    'textDecoration',
    'hyperlink',
    'letterSpacing',
  ])
  return segments.map((seg) => {
    const letterSpacingPt =
      seg.letterSpacing.unit === 'PERCENT'
        ? (seg.fontSize * seg.letterSpacing.value) / 100
        : seg.letterSpacing.value
    return {
      start: seg.start,
      end: seg.end,
      fontFamily: seg.fontName.family,
      fontStyle: seg.fontName.style,
      fontSize: seg.fontSize,
      fill: firstVisibleSolid(seg.fills),
      letterSpacingPt,
      hyperlink: seg.hyperlink?.type === 'URL' ? seg.hyperlink.value : null,
      underline: seg.textDecoration === 'UNDERLINE',
      strikethrough: seg.textDecoration === 'STRIKETHROUGH',
    }
  })
}

async function extractTrueText(
  node: TextNode,
  frame: FrameLike,
  report: ReportEntry[]
): Promise<Omit<ExtractedTextNode, 'fallback'>> {
  const svg = await node.exportAsync({
    format: 'SVG_STRING',
    svgOutlineText: false,
    svgIdAttribute: false,
    svgSimplifyStroke: true,
  })
  const svgRuns = extractSvgTextRuns(svg)
  const segments = toStyledSegments(node)
  const { runs, fullyAligned } = attributeRuns(svgRuns, node.characters, segments)
  if (!fullyAligned) {
    report.push({
      severity: 'info',
      frameName: frame.name,
      nodeName: node.name,
      message:
        'Some rendered text could not be aligned to the source characters (e.g. text-case transform); styles were derived from the rendered output instead.',
    })
  }
  const box = frameRelativeBox(node, frame)
  return {
    id: node.id,
    name: node.name,
    frameTransform: translate(box.x, box.y),
    width: box.w,
    height: box.h,
    characters: node.characters,
    runs,
  }
}

async function extractFallback(
  node: TextNode,
  frame: FrameLike,
  dpi: number,
  reason: string,
  report: ReportEntry[]
): Promise<ExtractedTextNode> {
  const box = frameRelativeBox(node, frame)
  const base = {
    id: node.id,
    name: node.name,
    frameTransform: translate(box.x, box.y),
    width: box.w,
    height: box.h,
    characters: node.characters,
    runs: [],
  }
  try {
    const svg = await node.exportAsync({ format: 'SVG_STRING', svgIdAttribute: false })
    const elements = extractSvgPaths(svg)
    const paths: ExtractedPath[] = elements.map((el) => {
      const color = parseCssColor(el.fill)
      return {
        d: transformPathData(el.d, el.transform),
        fill: color ? { r: color.r, g: color.g, b: color.b, opacity: color.a * el.fillOpacity } : null,
        fillRule: el.fillRule,
      }
    })
    if (paths.length === 0) throw new Error('No paths in outline export')
    report.push({
      severity: 'warning',
      frameName: frame.name,
      nodeName: node.name,
      message: `Rendered as vector outlines (not selectable text): ${reason}. The structure tree carries the original text as an alt description.`,
    })
    return { ...base, fallback: { kind: 'paths', reason, paths } }
  } catch (error) {
    const isUnsupported = error instanceof UnsupportedPathCommandError
    const bytes = await node.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: Math.max(1, dpi / 72) },
    })
    report.push({
      severity: 'warning',
      frameName: frame.name,
      nodeName: node.name,
      message: `Rendered as an image (not selectable text): ${reason}${isUnsupported ? ' (outline export contained unsupported path commands)' : ''}.`,
    })
    return { ...base, fallback: { kind: 'png', reason, bytes, scale: dpi / 72 } }
  }
}

interface OpacityBackup {
  node: SceneNode
  opacity: number
}

async function renderBackground(
  frame: FrameLike,
  textNodes: TextNode[],
  summary: FrameSummary,
  dpi: number,
  report: ReportEntry[]
): Promise<{ background: FrameBackground; hiddenIds: Set<string> }> {
  if (!summary.hasNonTextContent) {
    return { background: { kind: 'solid', fill: summary.backgroundFill }, hiddenIds: new Set() }
  }
  const backups: OpacityBackup[] = []
  const hiddenIds = new Set<string>()
  for (const node of textNodes) {
    try {
      backups.push({ node, opacity: node.opacity })
      node.opacity = 0
      hiddenIds.add(node.id)
    } catch {
      backups.pop()
      report.push({
        severity: 'warning',
        frameName: frame.name,
        nodeName: node.name,
        message:
          'Could not hide this text layer for the background render; it stays part of the background image and is not exported as selectable text.',
      })
    }
  }
  try {
    const bytes = await frame.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: Math.max(0.5, dpi / 72) },
    })
    return { background: { kind: 'png', bytes, scale: dpi / 72 }, hiddenIds }
  } finally {
    for (const backup of backups) {
      try {
        ;(backup.node as MinimalBlendMixin).opacity = backup.opacity
      } catch {
        // Restoring failed: surface loudly, never silently.
        report.push({
          severity: 'error',
          frameName: frame.name,
          nodeName: backup.node.name,
          message: 'Failed to restore layer opacity after background render — please undo (Cmd+Z) once.',
        })
      }
    }
  }
}

async function runExport(request: ExportRequest): Promise<{ frames: ExtractedFrame[]; report: ReportEntry[] }> {
  const report: ReportEntry[] = []
  const unembeddable = new Set(request.unembeddableFonts)
  const frames: ExtractedFrame[] = []
  const total = request.frames.length

  for (let i = 0; i < total; i++) {
    const entry = request.frames[i]
    const node = await figma.getNodeByIdAsync(entry.id)
    if (!node || !isFrameLike(node)) {
      report.push({
        severity: 'error',
        frameName: entry.id,
        message: 'Frame no longer exists; it was skipped.',
      })
      continue
    }
    const frame = node
    emit('PROGRESS', {
      message: `Exporting “${frame.name}” (${i + 1}/${total})`,
      current: i,
      total,
    })

    const summary = summarizeFrame(frame)
    const textNodes = collectTextNodes(frame)
    const texts: ExtractedTextNode[] = []

    // Fallback raster/outline exports must happen while nodes are visible.
    for (const textNode of textNodes) {
      const fonts = nodeFonts(textNode)
      const blockedFont = fonts.find((f) => unembeddable.has(fontId(f)))
      if (textNode.hasMissingFont) {
        texts.push(
          await extractFallback(textNode, frame, request.dpi, 'the font is missing on this machine', report)
        )
      } else if (blockedFont) {
        texts.push(
          await extractFallback(
            textNode,
            frame,
            request.dpi,
            `“${blockedFont.family} ${blockedFont.style}” could not be embedded`,
            report
          )
        )
      } else {
        const extracted = await extractTrueText(textNode, frame, report)
        texts.push({ ...extracted, fallback: null })
      }
    }

    const { background } = await renderBackground(frame, textNodes, summary, request.dpi, report)

    const orderBoxes: OrderBox[] = texts.map((t) => {
      const box = frameRelativeBox(figmaNodeById(textNodes, t.id), frame)
      return { id: t.id, x: box.x, y: box.y, w: box.w, h: box.h }
    })
    const defaultOrder = computeReadingOrder(orderBoxes)
    const requested = entry.textOrder.filter((id) => texts.some((t) => t.id === id))
    const readingOrder = requested.length === texts.length ? requested : defaultOrder

    frames.push({
      id: frame.id,
      name: frame.name,
      width: frame.width,
      height: frame.height,
      background,
      texts,
      readingOrder,
    })
  }

  emit('PROGRESS', { message: 'Building PDF…', current: total, total })
  return { frames, report }
}

function figmaNodeById(nodes: TextNode[], id: string): TextNode {
  return nodes.find((n) => n.id === id) as TextNode
}

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

async function loadSettings(): Promise<PluginSettings> {
  const stored = (await figma.clientStorage.getAsync(SETTINGS_KEY)) as Partial<PluginSettings> | undefined
  return { ...DEFAULT_SETTINGS, ...stored }
}

export async function loadStoredFonts(): Promise<Array<{ meta: StoredFontMeta; bytes: Uint8Array }>> {
  const index = ((await figma.clientStorage.getAsync(FONT_INDEX_KEY)) as StoredFontMeta[] | undefined) ?? []
  const out: Array<{ meta: StoredFontMeta; bytes: Uint8Array }> = []
  for (const meta of index) {
    const base64 = (await figma.clientStorage.getAsync(FONT_DATA_PREFIX + meta.id)) as string | undefined
    if (base64) out.push({ meta, bytes: figma.base64Decode(base64) })
  }
  return out
}

/**
 * Serializes reads/writes of FONT_INDEX_KEY. The UI's file picker allows
 * dropping several font files at once (e.g. Inter's Regular/Bold/Italic/Bold
 * Italic together), which fires one STORE_FONT per file without waiting for
 * the previous one to finish. Without this lock, concurrent storeFont calls
 * each read the same stale index before either writes it back, so whichever
 * write lands last overwrites (drops) the others from the index — their
 * data blobs stay in clientStorage but are never loaded again, which is why
 * fonts appeared to need re-uploading every session.
 */
let fontIndexQueue: Promise<unknown> = Promise.resolve()

function withFontIndexLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = fontIndexQueue.then(fn, fn)
  fontIndexQueue = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

export async function storeFont(meta: StoredFontMeta, bytes: Uint8Array): Promise<void> {
  await figma.clientStorage.setAsync(FONT_DATA_PREFIX + meta.id, figma.base64Encode(bytes))
  await withFontIndexLock(async () => {
    const index = ((await figma.clientStorage.getAsync(FONT_INDEX_KEY)) as StoredFontMeta[] | undefined) ?? []
    const next = [...index.filter((m) => m.id !== meta.id), meta]
    await figma.clientStorage.setAsync(FONT_INDEX_KEY, next)
  })
}

export async function deleteFont(id: string): Promise<void> {
  await figma.clientStorage.deleteAsync(FONT_DATA_PREFIX + id)
  await withFontIndexLock(async () => {
    const index = ((await figma.clientStorage.getAsync(FONT_INDEX_KEY)) as StoredFontMeta[] | undefined) ?? []
    await figma.clientStorage.setAsync(
      FONT_INDEX_KEY,
      index.filter((m) => m.id !== id)
    )
  })
}

/* ------------------------------------------------------------------ */
/* Entry                                                               */
/* ------------------------------------------------------------------ */

async function sendState(): Promise<void> {
  const { frames, scopedAll } = await resolveScope()
  const summaries = frames.map(summarizeFrame)
  const neededFonts = new Map<string, FontKey>()
  const charsByFont: Record<string, string> = {}
  for (const frame of frames) {
    for (const textNode of collectTextNodes(frame)) {
      for (const key of nodeFonts(textNode)) neededFonts.set(fontId(key), key)
      try {
        for (const seg of textNode.getStyledTextSegments(['fontName'])) {
          const id = fontId({ family: seg.fontName.family, style: seg.fontName.style })
          const existing = charsByFont[id] ?? ''
          const merged = new Set([...existing, ...seg.characters])
          charsByFont[id] = [...merged].join('')
        }
      } catch {
        // Missing-font nodes cannot report segments; they fall back anyway.
      }
    }
  }
  const settings = await loadSettings()
  const storedFonts = await loadStoredFonts()
  emit('STATE', {
    fileName: figma.root.name,
    scopedAll,
    frames: summaries,
    neededFonts: [...neededFonts.values()],
    charsByFont,
    settings,
    storedFonts: storedFonts.map((f) => f.meta),
  })
  emit('STORED_FONTS', storedFonts)
}

export default function main(): void {
  showUI({ width: 400, height: 560, themeColors: true })

  on<UiReadyHandler>('UI_READY', () => {
    sendState().catch((error) => emit('EXPORT_ERROR', String(error)))
  })

  on<ExportHandler>('EXPORT', (request) => {
    runExport(request)
      .then((result) => emit('EXPORT_RESULT', result))
      .catch((error) => emit('EXPORT_ERROR', String(error)))
  })

  on<SaveSettingsHandler>('SAVE_SETTINGS', (settings) => {
    figma.clientStorage.setAsync(SETTINGS_KEY, settings).catch(() => undefined)
  })

  on<StoreFontHandler>('STORE_FONT', (meta, bytes) => {
    storeFont(meta, bytes).catch(() =>
      emit('NOTIFY', `Could not store ${meta.family} ${meta.style} (storage limit?)`, true)
    )
  })

  on<DeleteFontHandler>('DELETE_FONT', (id) => {
    deleteFont(id).catch(() => undefined)
  })

  on<NotifyHandler>('NOTIFY', (message, error) => {
    figma.notify(message, { error: error === true })
  })

  on<ResizeHandler>('RESIZE', (width, height) => {
    figma.ui.resize(Math.round(width), Math.round(height))
  })

  figma.on('selectionchange', () => {
    sendState().catch(() => undefined)
  })
}
