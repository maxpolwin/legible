/**
 * Static instances of variable TrueType fonts.
 *
 * PDF has no variable fonts, and pdf-lib/fontkit would embed a variable font's
 * default master (e.g. ExtraLight) whatever weight the design asks for. So a
 * variable font is turned into a plain static TTF at the requested axis values
 * before embedding. The result only needs to be readable by fontkit (pdf-lib
 * re-subsets it into the PDF): glyf outlines, advances and cmap are exact for
 * the instance; kerning (GPOS) and ligatures (GSUB) are intentionally dropped.
 * PDF viewers never apply kerning to the shown text, so the output is the same.
 *
 * Only TrueType-outline (gvar) fonts are supported — every Google Fonts
 * variable font is one. CFF2 variable fonts are refused with a clear error.
 */

interface PathCommand {
  command: string
  args: number[]
}

interface GlyphLike {
  id: number
  advanceWidth: number
  path: { commands: PathCommand[] }
}

export interface InstanceSource {
  unitsPerEm: number
  ascent: number
  descent: number
  lineGap: number
  italicAngle?: number
  'OS/2'?: Record<string, unknown> | null
  variationAxes?: Record<string, { name: string; min: number; default: number; max: number }>
  namedVariations?: Record<string, Record<string, number>>
  getVariation(settings: Record<string, number>): InstanceSource
  glyphForCodePoint(codePoint: number): GlyphLike
  getGlyph(id: number): GlyphLike
  getName?(key: string): string | null
}

export interface InstanceNames {
  family: string
  style: string
  postscriptName: string
}

/** True for a font with at least one variation axis. */
export function isVariableFont(font: InstanceSource): boolean {
  return font.variationAxes !== undefined && Object.keys(font.variationAxes).length > 0
}

/* ---------------------------- binary helpers ---------------------------- */

class Writer {
  private bytes: number[] = []
  u8(v: number): this {
    this.bytes.push(v & 0xff)
    return this
  }
  u16(v: number): this {
    return this.u8(v >> 8).u8(v)
  }
  i16(v: number): this {
    return this.u16(v < 0 ? v + 0x10000 : v)
  }
  u32(v: number): this {
    return this.u16(Math.floor(v / 0x10000)).u16(v % 0x10000)
  }
  fixed(v: number): this {
    return this.u32(Math.round(v * 65536) >>> 0)
  }
  tag(t: string): this {
    for (let i = 0; i < 4; i++) this.u8(t.charCodeAt(i))
    return this
  }
  raw(more: number[]): this {
    for (const b of more) this.bytes.push(b)
    return this
  }
  get length(): number {
    return this.bytes.length
  }
  toArray(): number[] {
    return this.bytes
  }
}

function pad4(bytes: number[]): number[] {
  const out = bytes.slice()
  while (out.length % 4 !== 0) out.push(0)
  return out
}

function checksum(bytes: number[]): number {
  const p = pad4(bytes)
  let sum = 0
  for (let i = 0; i < p.length; i += 4) {
    sum = (sum + (((p[i] << 24) | (p[i + 1] << 16) | (p[i + 2] << 8) | p[i + 3]) >>> 0)) >>> 0
  }
  return sum
}

/** 2024-01-01T00:00:00Z in seconds since 1904-01-01 (the font LONGDATETIME epoch). */
const MAC_EPOCH_2024 = 3786912000

const round = (n: number): number => Math.round(n)
const clamp16 = (n: number): number => Math.max(-32768, Math.min(32767, round(n)))

/* --------------------------- outline conversion -------------------------- */

interface Point {
  x: number
  y: number
  on: boolean
}

/** fontkit path (moveTo / lineTo / quadraticCurveTo / closePath) -> TrueType contours. */
function toContours(commands: PathCommand[]): Point[][] {
  const contours: Point[][] = []
  let current: Point[] | null = null
  const finish = (): void => {
    if (current && current.length > 0) {
      // The closing segment returns to the start; TrueType closes implicitly.
      const first = current[0]
      const last = current[current.length - 1]
      if (current.length > 1 && last.on && first.on && last.x === first.x && last.y === first.y) current.pop()
      contours.push(current)
    }
    current = null
  }
  for (const { command, args } of commands) {
    if (command === 'moveTo') {
      finish()
      current = [{ x: round(args[0]), y: round(args[1]), on: true }]
    } else if (command === 'lineTo') {
      current?.push({ x: round(args[0]), y: round(args[1]), on: true })
    } else if (command === 'quadraticCurveTo') {
      current?.push({ x: round(args[0]), y: round(args[1]), on: false })
      current?.push({ x: round(args[2]), y: round(args[3]), on: true })
    } else if (command === 'closePath') {
      finish()
    } else {
      throw new Error(`Unsupported outline command "${command}": only TrueType-outline variable fonts are supported`)
    }
  }
  finish()
  return contours
}

interface BuiltGlyph {
  data: number[]
  advance: number
  lsb: number
  xMin: number
  yMin: number
  xMax: number
  yMax: number
  points: number
  contours: number
}

function buildGlyph(glyph: GlyphLike): BuiltGlyph {
  const contours = toContours(glyph.path.commands)
  const advance = Math.max(0, Math.min(0xffff, round(glyph.advanceWidth)))
  const all = contours.flat()
  if (all.length === 0) {
    return { data: [], advance, lsb: 0, xMin: 0, yMin: 0, xMax: 0, yMax: 0, points: 0, contours: 0 }
  }
  const xs = all.map((p) => clamp16(p.x))
  const ys = all.map((p) => clamp16(p.y))
  const xMin = Math.min(...xs)
  const yMin = Math.min(...ys)
  const xMax = Math.max(...xs)
  const yMax = Math.max(...ys)
  const w = new Writer()
  w.i16(contours.length).i16(xMin).i16(yMin).i16(xMax).i16(yMax)
  let end = -1
  for (const c of contours) {
    end += c.length
    w.u16(end)
  }
  w.u16(0) // no instructions
  for (const p of all) w.u8(p.on ? 1 : 0) // on-curve bit only; coordinates are full int16 deltas
  let prevX = 0
  for (const x of xs) {
    w.i16(x - prevX)
    prevX = x
  }
  let prevY = 0
  for (const y of ys) {
    w.i16(y - prevY)
    prevY = y
  }
  return { data: pad4(w.toArray()), advance, lsb: xMin, xMin, yMin, xMax, yMax, points: all.length, contours: contours.length }
}

/* -------------------------------- tables --------------------------------- */

function utf16be(text: string): number[] {
  const out: number[] = []
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    out.push(c >> 8, c & 0xff)
  }
  return out
}

function nameTable(records: Array<[number, string]>): number[] {
  const rows = records.filter(([, s]) => s !== '').sort((a, b) => a[0] - b[0])
  const header = new Writer().u16(0).u16(rows.length).u16(6 + rows.length * 12)
  const strings: number[] = []
  for (const [id, text] of rows) {
    const encoded = utf16be(text)
    header.u16(3).u16(1).u16(0x409).u16(id).u16(encoded.length).u16(strings.length)
    strings.push(...encoded)
  }
  return header.raw(strings).toArray()
}

function os2Table(src: InstanceSource, weight: number, italic: boolean, first: number, last: number, vals: {
  ascender: number
  descender: number
  lineGap: number
  maxWidth: number
}): number[] {
  const o = (src['OS/2'] ?? {}) as Record<string, number | undefined>
  const n = (k: string, d = 0): number => (typeof o[k] === 'number' ? (o[k] as number) : d)
  const bold = weight >= 700
  const fsSelection = (italic ? 1 : 0) | (bold ? 1 << 5 : 0) | (!italic && !bold ? 1 << 6 : 0) | (1 << 7) // USE_TYPO_METRICS
  const w = new Writer()
  w.u16(4) // version (4 allows the USE_TYPO_METRICS bit)
  w.i16(clamp16(n('xAvgCharWidth', vals.maxWidth / 2)))
  w.u16(Math.max(1, Math.min(1000, round(weight))))
  w.u16(5) // width class: medium
  w.u16(0) // fsType: only embeddable fonts reach this point (see fsTypeToBits)
  for (const k of ['ySubscriptXSize', 'ySubscriptYSize', 'ySubscriptXOffset', 'ySubscriptYOffset', 'ySuperscriptXSize', 'ySuperscriptYSize', 'ySuperscriptXOffset', 'ySuperscriptYOffset', 'yStrikeoutSize', 'yStrikeoutPosition']) {
    w.i16(clamp16(n(k)))
  }
  w.i16(0) // sFamilyClass
  w.raw(new Array<number>(10).fill(0)) // panose
  w.u32(0).u32(0).u32(0).u32(0) // unicode ranges
  w.tag('NONE')
  w.u16(fsSelection)
  w.u16(Math.min(first, 0xffff)).u16(Math.min(last, 0xffff))
  w.i16(clamp16(vals.ascender)).i16(clamp16(vals.descender)).i16(clamp16(vals.lineGap))
  w.u16(Math.max(0, clamp16(n('usWinAscent', vals.ascender)))).u16(Math.max(0, clamp16(Math.abs(n('usWinDescent', vals.descender)))))
  w.u32(0).u32(0) // code page ranges
  w.i16(clamp16(n('sxHeight'))).i16(clamp16(n('sCapHeight')))
  w.u16(0).u16(32).u16(0) // default char, break char, max context
  return w.toArray()
}

/* --------------------------------- build --------------------------------- */

/**
 * Build a static, subsetted TTF from a variable font at `settings` (axis tag ->
 * value) containing only `codePoints` (BMP and above; code points the font
 * lacks are skipped, they render as .notdef like any missing glyph).
 */
export function buildStaticInstance(
  source: InstanceSource,
  settings: Record<string, number>,
  codePoints: Iterable<number>,
  names: InstanceNames
): Uint8Array {
  if (!isVariableFont(source)) throw new Error('Not a variable font')
  const inst = source.getVariation(settings)

  // Glyph 0 is .notdef; each distinct source glyph gets one new glyph id.
  const sourceToNew = new Map<number, number>()
  const notdef = inst.getGlyph(0)
  sourceToNew.set(notdef.id, 0)
  const built: BuiltGlyph[] = [buildGlyph(notdef)]
  const cmap: Array<[number, number]> = []
  for (const cp of [...new Set(codePoints)].sort((a, b) => a - b)) {
    if (cp < 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) continue
    const g = inst.glyphForCodePoint(cp)
    if (!g || g.id === 0) continue
    let id = sourceToNew.get(g.id)
    if (id === undefined) {
      id = built.length
      sourceToNew.set(g.id, id)
      built.push(buildGlyph(g))
    }
    cmap.push([cp, id])
  }
  if (built.length > 0xffff) throw new Error('Too many glyphs')

  // glyf + loca (long offsets)
  const glyf: number[] = []
  const loca = new Writer()
  for (const g of built) {
    loca.u32(glyf.length)
    for (const b of g.data) glyf.push(b)
  }
  loca.u32(glyf.length)

  // hmtx: one full metric per glyph
  const hmtx = new Writer()
  for (const g of built) hmtx.u16(g.advance).i16(g.lsb)

  const xMin = Math.min(...built.map((g) => g.xMin))
  const yMin = Math.min(...built.map((g) => g.yMin))
  const xMax = Math.max(...built.map((g) => g.xMax))
  const yMax = Math.max(...built.map((g) => g.yMax))
  const advanceMax = Math.max(...built.map((g) => g.advance))
  const weight = settings.wght ?? (source['OS/2']?.usWeightClass as number | undefined) ?? 400
  const italic = /italic|oblique/i.test(names.style) || (source.italicAngle ?? 0) !== 0

  const head = new Writer()
    .fixed(1)
    .fixed(1)
    .u32(0) // checkSumAdjustment, patched below
    .u32(0x5f0f3cf5)
    .u16(0x000b)
    .u16(source.unitsPerEm)
    .u32(0).u32(MAC_EPOCH_2024) // created (fixed, so output is reproducible)
    .u32(0).u32(MAC_EPOCH_2024) // modified
    .i16(xMin).i16(yMin).i16(xMax).i16(yMax)
    .u16((weight >= 700 ? 1 : 0) | (italic ? 2 : 0))
    .u16(8)
    .i16(2)
    .i16(1) // long loca
    .i16(0)
    .toArray()

  const hhea = new Writer()
    .fixed(1)
    .i16(clamp16(source.ascent))
    .i16(clamp16(source.descent))
    .i16(clamp16(source.lineGap))
    .u16(advanceMax)
    .i16(Math.min(...built.map((g) => g.lsb)))
    .i16(0) // minRightSideBearing (informational only)
    .i16(xMax)
    .i16(1) // caretSlopeRise
    .i16(0) // caretSlopeRun
    .i16(0) // caretOffset
    .raw(new Array<number>(8).fill(0))
    .i16(0) // metricDataFormat
    .u16(built.length)
    .toArray()

  const maxp = new Writer()
    .fixed(1)
    .u16(built.length)
    .u16(Math.max(...built.map((g) => g.points)))
    .u16(Math.max(...built.map((g) => g.contours)))
    .u16(0).u16(0) // composite points / contours
    .u16(2) // maxZones
    .raw(new Array<number>(16).fill(0)) // twilight, storage, defs, stack, instructions, component limits
    .toArray()

  // cmap format 12 (platform 3, encoding 10): consecutive code points with consecutive new glyph ids share a group.
  const groups: Array<[number, number, number]> = []
  for (const [cp, gid] of cmap) {
    const last = groups[groups.length - 1]
    if (last && cp === last[1] + 1 && gid === last[2] + (cp - last[0])) last[1] = cp
    else groups.push([cp, cp, gid])
  }
  const sub = new Writer().u16(12).u16(0).u32(16 + groups.length * 12).u32(0).u32(groups.length)
  for (const [s, e, g] of groups) sub.u32(s).u32(e).u32(g)
  const cmapT = new Writer().u16(0).u16(1).u16(3).u16(10).u32(12).raw(sub.toArray()).toArray()

  const fullName = `${names.family} ${names.style}`.trim()
  const nameT = nameTable([
    [0, source.getName?.('copyright') ?? ''],
    [1, names.family],
    [2, names.style],
    [3, `${names.postscriptName};static`],
    [4, fullName],
    [6, names.postscriptName],
    [13, source.getName?.('license') ?? ''],
    [14, source.getName?.('licenseURL') ?? ''],
  ])

  const post = new Writer()
    .fixed(3)
    .fixed(source.italicAngle ?? 0)
    .i16(-100) // underlinePosition
    .i16(50) // underlineThickness
    .u32(0)
    .u32(0).u32(0).u32(0).u32(0)
    .toArray()

  const os2 = os2Table(source, weight, italic, cmap.length ? cmap[0][0] : 0, cmap.length ? cmap[cmap.length - 1][0] : 0, {
    ascender: source.ascent,
    descender: source.descent,
    lineGap: source.lineGap,
    maxWidth: advanceMax,
  })

  const tables: Array<[string, number[]]> = [
    ['OS/2', os2],
    ['cmap', cmapT],
    ['glyf', glyf],
    ['head', head],
    ['hhea', hhea],
    ['hmtx', hmtx.toArray()],
    ['loca', loca.toArray()],
    ['maxp', maxp],
    ['name', nameT],
    ['post', post],
  ]

  // Table directory + data, 4-byte aligned, then patch head.checkSumAdjustment.
  const numTables = tables.length
  let searchRange = 1
  let entrySelector = 0
  while (searchRange * 2 <= numTables) {
    searchRange *= 2
    entrySelector++
  }
  const out = new Writer().u32(0x00010000).u16(numTables).u16(searchRange * 16).u16(entrySelector).u16(numTables * 16 - searchRange * 16)
  let offset = 12 + numTables * 16
  const body: number[] = []
  let headOffset = 0
  for (const [tag, data] of tables) {
    if (tag === 'head') headOffset = offset
    out.tag(tag).u32(checksum(data)).u32(offset).u32(data.length)
    const padded = pad4(data)
    for (const b of padded) body.push(b)
    offset += padded.length
  }
  const file = out.raw(body).toArray()
  const adjustment = (0xb1b0afba - checksum(file)) >>> 0
  const at = headOffset + 8
  file[at] = adjustment >>> 24
  file[at + 1] = (adjustment >>> 16) & 0xff
  file[at + 2] = (adjustment >>> 8) & 0xff
  file[at + 3] = adjustment & 0xff
  return Uint8Array.from(file)
}
