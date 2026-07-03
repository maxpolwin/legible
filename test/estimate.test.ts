import { describe, expect, it } from 'vitest'
import { classifyDpi, estimateSizeBytes, formatBytes } from '../src/lib/estimate'

const A4 = { widthPt: 595, heightPt: 842 }

describe('DPI zones (FR-4, §8)', () => {
  it('classifies ATS / Balanced / Print at the documented cutoffs', () => {
    expect(classifyDpi(72)).toBe('ats')
    expect(classifyDpi(96)).toBe('ats')
    expect(classifyDpi(97)).toBe('balanced')
    expect(classifyDpi(150)).toBe('balanced')
    expect(classifyDpi(151)).toBe('print')
    expect(classifyDpi(300)).toBe('print')
  })
})

describe('file-size estimate (§8 formula)', () => {
  it('puts a text-only 2-page CV in the ~100 KB class', () => {
    const size = estimateSizeBytes({
      pages: [
        { ...A4, hasRasterBackground: false, imageAreaPt2: 0, charCount: 2500 },
        { ...A4, hasRasterBackground: false, imageAreaPt2: 0, charCount: 2000 },
      ],
      fontCount: 3,
      dpi: 96,
    })
    expect(size).toBeGreaterThan(20_000)
    expect(size).toBeLessThan(150_000)
  })

  it('grows monotonically with DPI when raster content is present', () => {
    const page = { ...A4, hasRasterBackground: true, imageAreaPt2: 200 * 200, charCount: 1000 }
    const at72 = estimateSizeBytes({ pages: [page], fontCount: 1, dpi: 72 })
    const at150 = estimateSizeBytes({ pages: [page], fontCount: 1, dpi: 150 })
    const at300 = estimateSizeBytes({ pages: [page], fontCount: 1, dpi: 300 })
    expect(at150).toBeGreaterThan(at72)
    expect(at300).toBeGreaterThan(at150)
  })

  it('is unaffected by DPI for text-only pages (vector text)', () => {
    const page = { ...A4, hasRasterBackground: false, imageAreaPt2: 0, charCount: 1000 }
    expect(estimateSizeBytes({ pages: [page], fontCount: 1, dpi: 72 })).toBe(
      estimateSizeBytes({ pages: [page], fontCount: 1, dpi: 300 })
    )
  })

  it('formats byte counts for the UI', () => {
    expect(formatBytes(950)).toBe('950 B')
    expect(formatBytes(104_000)).toBe('104 KB')
    expect(formatBytes(2_600_000)).toBe('2.6 MB')
  })
})
