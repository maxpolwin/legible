/**
 * Reading-order heuristics (FR-1, FR-2).
 *
 * `computeReadingOrder` implements a column-aware recursive XY-cut:
 * within a region, prefer splitting at wide vertical whitespace gutters
 * (columns, traversed left -> right, each column completed top -> bottom
 * before moving right), otherwise split at horizontal whitespace (bands,
 * top -> bottom), otherwise sort by position. A full-width header above two
 * columns is handled naturally: no full-height gutter exists until the
 * header band has been cut off.
 *
 * A vertical gutter only counts as a column boundary when it is wider than
 * `columnGapFactor` (1.5) x the median positive inter-node x-gap — this is
 * the "gap analysis" rule from the spec, guarding against splitting at
 * small label/value spacing — or wider than `hardColumnGap`, which catches
 * clean two-column layouts where the gutter is the *only* positive gap
 * (median == gutter, so the factor rule alone could never fire).
 *
 * `rowMajorOrder` is the simpler frame-level default (left-to-right,
 * top-to-bottom by row clustering) used for page order.
 */

export interface OrderBox {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export interface OrderOptions {
  /** Minimum gutter width (pt) to ever consider a column split. */
  minColumnGap?: number
  /** Gutter must exceed this factor x median inter-node gap ... */
  columnGapFactor?: number
  /** ... or simply be at least this wide (pt). */
  hardColumnGap?: number
  /** Minimum vertical whitespace (pt) to split into bands. */
  minBandGap?: number
}

const DEFAULTS: Required<OrderOptions> = {
  minColumnGap: 12,
  columnGapFactor: 1.5,
  hardColumnGap: 24,
  minBandGap: 0.5,
}

interface Interval {
  start: number
  end: number
}

/** Merge overlapping/touching intervals (with tolerance) into clusters. */
function mergeIntervals(intervals: Interval[], tolerance: number): Interval[] {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((p, q) => p.start - q.start)
  const merged: Interval[] = [{ ...sorted[0] }]
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]
    const last = merged[merged.length - 1]
    if (cur.start <= last.end + tolerance) {
      last.end = Math.max(last.end, cur.end)
    } else {
      merged.push({ ...cur })
    }
  }
  return merged
}

/** Positive gaps between adjacent raw intervals, sorted ascending. */
function positiveGaps(intervals: Interval[]): number[] {
  const sorted = [...intervals].sort((p, q) => p.start - q.start)
  const gaps: number[] = []
  let maxEnd = -Infinity
  for (const iv of sorted) {
    if (maxEnd !== -Infinity && iv.start > maxEnd) gaps.push(iv.start - maxEnd)
    maxEnd = Math.max(maxEnd, iv.end)
  }
  return gaps.sort((p, q) => p - q)
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function verticalCut(boxes: OrderBox[], opts: Required<OrderOptions>): OrderBox[][] | null {
  const xIntervals = boxes.map((b) => ({ start: b.x, end: b.x + b.w }))
  const clusters = mergeIntervals(xIntervals, 1)
  if (clusters.length < 2) return null

  const interNodeGaps = positiveGaps(xIntervals)
  const med = median(interNodeGaps)

  // Column boundaries: midpoints of qualifying gutters.
  const boundaries: number[] = []
  for (let i = 1; i < clusters.length; i++) {
    const gap = clusters[i].start - clusters[i - 1].end
    const qualifies =
      gap >= opts.minColumnGap &&
      (gap >= opts.hardColumnGap || (med > 0 && gap > opts.columnGapFactor * med))
    if (qualifies) boundaries.push((clusters[i - 1].end + clusters[i].start) / 2)
  }
  if (boundaries.length === 0) return null

  const columns: OrderBox[][] = Array.from({ length: boundaries.length + 1 }, () => [])
  for (const b of boxes) {
    const cx = b.x + b.w / 2
    let col = boundaries.findIndex((boundary) => cx < boundary)
    if (col === -1) col = boundaries.length
    columns[col].push(b)
  }
  const nonEmpty = columns.filter((c) => c.length > 0)
  return nonEmpty.length > 1 ? nonEmpty : null
}

/**
 * Split off the topmost band only, leaving the remainder intact so a column
 * cut can still fire across the rest of the region. Splitting into ALL
 * bands at once would row-interleave side-by-side columns that happen to
 * share horizontal whitespace.
 */
function horizontalCut(boxes: OrderBox[], opts: Required<OrderOptions>): OrderBox[][] | null {
  const yIntervals = boxes.map((b) => ({ start: b.y, end: b.y + b.h }))
  const clusters = mergeIntervals(yIntervals, opts.minBandGap)
  if (clusters.length < 2) return null
  const first: OrderBox[] = []
  const rest: OrderBox[] = []
  for (const b of boxes) {
    const cy = b.y + b.h / 2
    if (cy <= clusters[0].end + opts.minBandGap) {
      first.push(b)
    } else {
      rest.push(b)
    }
  }
  return first.length > 0 && rest.length > 0 ? [first, rest] : null
}

function recurse(boxes: OrderBox[], opts: Required<OrderOptions>, depth: number): OrderBox[] {
  if (boxes.length <= 1) return boxes
  if (depth > 32) return [...boxes].sort(byPosition)

  // Columns first: complete the leftmost column before moving right.
  const columns = verticalCut(boxes, opts)
  if (columns) {
    return columns
      .sort((p, q) => minX(p) - minX(q))
      .flatMap((col) => recurse(col, opts, depth + 1))
  }

  const bands = horizontalCut(boxes, opts)
  if (bands) {
    return bands
      .sort((p, q) => minY(p) - minY(q))
      .flatMap((band) => recurse(band, opts, depth + 1))
  }

  return [...boxes].sort(byPosition)
}

function minX(boxes: OrderBox[]): number {
  return Math.min(...boxes.map((b) => b.x))
}

function minY(boxes: OrderBox[]): number {
  return Math.min(...boxes.map((b) => b.y))
}

function byPosition(p: OrderBox, q: OrderBox): number {
  return p.y + p.h / 2 - (q.y + q.h / 2) || p.x - q.x
}

/** Column-aware reading order (FR-1). Returns box ids. */
export function computeReadingOrder(boxes: OrderBox[], options?: OrderOptions): string[] {
  const opts = { ...DEFAULTS, ...options }
  return recurse(boxes, opts, 0).map((b) => b.id)
}

/**
 * Row-major order (left-to-right, top-to-bottom) for frame/page ordering
 * (FR-2 default). Frames whose vertical extents overlap are one row.
 */
export function rowMajorOrder(boxes: OrderBox[]): string[] {
  if (boxes.length === 0) return []
  const sorted = [...boxes].sort((p, q) => p.y - q.y)
  const rows: OrderBox[][] = []
  let currentRow: OrderBox[] = [sorted[0]]
  let rowEnd = sorted[0].y + sorted[0].h
  for (let i = 1; i < sorted.length; i++) {
    const b = sorted[i]
    // Same row while the frame's top is above the current row's bottom.
    if (b.y < rowEnd) {
      currentRow.push(b)
      rowEnd = Math.max(rowEnd, b.y + b.h)
    } else {
      rows.push(currentRow)
      currentRow = [b]
      rowEnd = b.y + b.h
    }
  }
  rows.push(currentRow)
  return rows.flatMap((row) => row.sort((p, q) => p.x - q.x).map((b) => b.id))
}
