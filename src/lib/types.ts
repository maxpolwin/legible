/**
 * Shared data model between the Figma main thread (extraction) and the
 * plugin UI (font resolution + PDF construction). Everything here must be
 * structured-cloneable (postMessage-safe).
 *
 * Coordinate conventions:
 *  - All geometry is in Figma pixels, treated 1:1 as PDF points (72 dpi).
 *  - All matrices/points are y-down (Figma/SVG convention). The PDF builder
 *    flips to y-up at the last moment.
 */

export interface Vec2 {
  x: number
  y: number
}

/** 2x3 affine transform: x' = a*x + c*y + e ; y' = b*x + d*y + f (y-down). */
export interface Mat23 {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface FontKey {
  family: string
  style: string
}

/** Canonical id for a FontKey: `${family}##${style}`. */
export type FontId = string

export interface SolidColor {
  r: number
  g: number
  b: number
  opacity: number
}

export interface TextRunStyle {
  font: FontKey
  fontSize: number
  fill: SolidColor
  /** Letter spacing in points (already resolved from px/percent). */
  letterSpacingPt: number
  hyperlink: string | null
  underline: boolean
  strikethrough: boolean
}

/**
 * One positioned fragment of rendered text: a single style run on a single
 * visual line, with its baseline origin in node-local (SVG) coordinates.
 */
export interface PositionedRun {
  text: string
  x: number
  y: number
  /** Accumulated SVG-internal transform (rotation etc.), node-local. */
  transform: Mat23
  style: TextRunStyle
  lineIndex: number
}

export interface ExtractedPath {
  /** SVG path data, already in node-local coordinates. */
  d: string
  fill: SolidColor | null
  fillRule: 'nonzero' | 'evenodd'
}

export type TextFallback =
  | { kind: 'paths'; reason: string; paths: ExtractedPath[] }
  | { kind: 'png'; reason: string; bytes: Uint8Array; scale: number }

export interface ExtractedTextNode {
  id: string
  name: string
  /** Node-local (SVG) space -> frame space, y-down, points. */
  frameTransform: Mat23
  width: number
  height: number
  /** The node's source characters (Figma `TextNode.characters`). */
  characters: string
  runs: PositionedRun[]
  /**
   * When set, this node is NOT drawn as true text; it is drawn from vector
   * paths or a raster tile instead (non-embeddable/missing font).
   */
  fallback: TextFallback | null
}

export type FrameBackground =
  | { kind: 'png'; bytes: Uint8Array; scale: number }
  | { kind: 'solid'; fill: SolidColor | null }

export interface ExtractedFrame {
  id: string
  name: string
  width: number
  height: number
  background: FrameBackground
  texts: ExtractedTextNode[]
  /** Text node ids in confirmed reading order. */
  readingOrder: string[]
}

export interface DocMeta {
  title: string
  author: string
  /** BCP-47 language tag written to the PDF catalog (e.g. "de-DE"). */
  language: string
}

export type ReportSeverity = 'info' | 'warning' | 'error'

export interface ReportEntry {
  severity: ReportSeverity
  frameName: string
  nodeName?: string
  message: string
}

/* ------------------------------------------------------------------ */
/* UI <-> main messaging                                               */
/* ------------------------------------------------------------------ */

export interface TextNodeSummary {
  id: string
  name: string
  preview: string
  box: Rect
  fonts: FontId[]
  hasMissingFont: boolean
  charCount: number
}

export interface FrameSummary {
  id: string
  name: string
  width: number
  height: number
  texts: TextNodeSummary[]
  /** Total area (pt^2) covered by image fills, for the size estimate. */
  imageAreaPt2: number
  /** True when the frame renders anything beyond text + a solid background. */
  hasNonTextContent: boolean
  backgroundFill: SolidColor | null
}

export interface StoredFontMeta {
  id: string
  family: string
  style: string
  postscriptName: string
  byteLength: number
}

export interface PluginSettings {
  /** Base filename the user typed, without the date prefix or extension. */
  filenameName: string
  /**
   * The Figma file `filenameName` was saved for. Settings live in
   * clientStorage, which is per user and not per file, so without this a name
   * typed in one file would shadow the next file's own name (FR-3).
   */
  filenameFile: string
  author: string
  /** BCP-47 tag written to the PDF catalog, e.g. "de-DE". */
  language: string
  dpi: number
}

export const DEFAULT_SETTINGS: PluginSettings = {
  filenameName: '',
  filenameFile: '',
  author: '',
  language: 'de-DE',
  dpi: 96,
}

export interface StateMessage {
  /** The Figma file's name, used to default the export filename (FR-3). */
  fileName: string
  /** The current page (tab) name; used when the file itself is unnamed. */
  pageName: string
  /** True when nothing was selected and the whole file is in scope. */
  scopedAll: boolean
  frames: FrameSummary[]
  neededFonts: FontKey[]
  /** Unique characters drawn with each font — for glyph-coverage checks. */
  charsByFont: Record<FontId, string>
  settings: PluginSettings
  storedFonts: StoredFontMeta[]
}

export interface ExportRequest {
  /** Frame ids in confirmed page order, each with confirmed text order. */
  frames: Array<{ id: string; textOrder: string[] }>
  dpi: number
  /** Fonts the UI could not resolve to embeddable bytes -> fallback nodes. */
  unembeddableFonts: FontId[]
}

export interface ExportResult {
  frames: ExtractedFrame[]
  report: ReportEntry[]
}

export interface ProgressMessage {
  message: string
  current: number
  total: number
}

export function fontId(key: FontKey): FontId {
  return `${key.family}##${key.style}`
}

export function parseFontId(id: FontId): FontKey {
  const i = id.indexOf('##')
  return { family: id.slice(0, i), style: id.slice(i + 2) }
}
