/**
 * DPI zones and live file-size estimation (FR-4, §8).
 *
 * The estimate is `base_text_pdf_size + Σ(raster_asset_size_at_selected_DPI)`
 * with empirically-seeded constants. These are starting points, meant to be
 * recalibrated against real exports; they intentionally live in one place.
 */

export type DpiZone = 'ats' | 'balanced' | 'print'

export const DPI_ZONE_LIMITS = {
  /** ATS-safe ceiling (§8). */
  ats: 96,
  /** Balanced ceiling; above this is print territory. */
  balanced: 150,
} as const

export const DPI_MIN = 36
export const DPI_MAX = 600

export function classifyDpi(dpi: number): DpiZone {
  if (dpi <= DPI_ZONE_LIMITS.ats) return 'ats'
  if (dpi <= DPI_ZONE_LIMITS.balanced) return 'balanced'
  return 'print'
}

export const ESTIMATE_CONSTANTS = {
  /** Fixed PDF scaffolding: catalog, xref, metadata, structure tree base. */
  docOverheadBytes: 4_000,
  /** Per-page dicts, content-stream overhead, struct elems. */
  perPageBytes: 1_500,
  /** A subset-embedded latin font program (glyf/CFF + tables), typical CV. */
  perFontBytes: 24_000,
  /** Content-stream bytes per character of drawn text (ops + hex). */
  perCharBytes: 4.0,
  /**
   * PNG bytes per output pixel for a mostly-flat page background render
   * (solid fills, a few vector shapes). Flat regions compress extremely well.
   */
  backgroundBytesPerPixel: 0.03,
  /** PNG bytes per output pixel for photographic image fills. */
  imageBytesPerPixel: 0.55,
} as const

export interface PageEstimateInput {
  widthPt: number
  heightPt: number
  /** Whether this page needs a full-page raster background. */
  hasRasterBackground: boolean
  /** Area (pt^2) covered by photographic image fills. */
  imageAreaPt2: number
  charCount: number
}

export interface EstimateInput {
  pages: PageEstimateInput[]
  fontCount: number
  dpi: number
}

export function estimateSizeBytes(input: EstimateInput): number {
  const c = ESTIMATE_CONSTANTS
  const pxPerPt = input.dpi / 72
  let total = c.docOverheadBytes + input.fontCount * c.perFontBytes
  for (const page of input.pages) {
    total += c.perPageBytes + page.charCount * c.perCharBytes
    if (page.hasRasterBackground) {
      const pagePx = page.widthPt * pxPerPt * (page.heightPt * pxPerPt)
      total += pagePx * c.backgroundBytesPerPixel
    }
    const imagePx = page.imageAreaPt2 * pxPerPt * pxPerPt
    total += imagePx * c.imageBytesPerPixel
  }
  return Math.round(total)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 1000_000) return `${Math.round(bytes / 1000)} KB`
  return `${(bytes / 1000_000).toFixed(1)} MB`
}
